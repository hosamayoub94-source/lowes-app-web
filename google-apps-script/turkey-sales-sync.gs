/**
 * Turkey Sales Sync — TWO-WAY sync between the app and the Turkey spreadsheet.
 * Tabs: "Strong" (brand=strong) and "LOWE'S" (brand=lowes).
 *
 * SETUP (owner, one time):
 *  1. Paste this code → Save.
 *  2. Deploy → New deployment → Web app (Execute as: me · Access: Anyone) →
 *     copy the /exec URL (already configured in Supabase).
 *  3. Two-way (sheet → app): Triggers (⏰) → Add Trigger → choose function
 *     "onSheetEdit", event source "From spreadsheet", event type "On edit" →
 *     Save (authorize once). Now editing الحالة / رقم التتبع in the sheet
 *     updates the order in the app.
 */

var TOKEN    = 'LOWES-TURKEY-2026';
var SUPA_URL = 'https://fghdumrgimoeqsafdhhh.supabase.co';
var ANON     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3OTQsImV4cCI6MjA5MTc2Nzc5NH0.e9DiuJySh4WMp7x5ErVV5LqBFawHUESrlGDRb8N5zPM';

var FIELD_MAP = {
  'الاسم': 'customer_name', 'الإسم': 'customer_name', 'الاسم الكامل': 'customer_name',
  'الهاتف': 'phone_1', 'رقم الهاتف': 'phone_1', 'الرقم': 'phone_1',
  'رقم الواتساب': 'wa_number', 'واتساب': 'wa_number', 'W.App': 'wa_number',
  'المدينة': 'city', 'البلدية': 'district', 'العنوان': 'address',
  'السعر': 'amount', 'السعر (TRY)': 'amount', 'القيمة': 'amount',
  'الحالة': 'status_ar',
  'صاحب الطلب': 'handler_name', 'البائع': 'handler_name',
  'كود الطلب': 'order_id', 'رقم الطلب': 'order_id', 'Order ID': 'order_id',
  'رقم التتبع': 'tracking_number', 'التتبع': 'tracking_number',
  'نوع الدفع': 'payment_method', 'الدفع': 'payment_method',
  'مكان الاستلام': 'pickup_type',
  'ارسال مع': 'shipping_company', 'شركة الشحن': 'shipping_company',
  'ملاحظة': 'notes', 'ملاحظات': 'notes', 'التاريخ': 'order_date',
};

var STATUS_AR = {
  pending: 'وارد جديد 🆕', preparing: 'قيد التجهيز 📦', ready: 'جاهز 🚀',
  shipped: 'في الشحن 🚚', delivered: 'تم التسليم ✅', cancelled: 'ملغي ❌',
};

// ── App → Sheet (append below last order / upsert by order id) ──
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return _json({ ok: false, error: 'bad token' });
    var brand = (body.brand || 'lowes').toLowerCase();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = _findSheet(ss, brand);
    if (!sh) return _json({ ok: false, error: 'sheet not found' });

    var data = sh.getDataRange().getValues();
    var headerRow = _findHeaderRow(data);
    if (headerRow < 0) return _json({ ok: false, error: 'header row not found' });
    var headers = data[headerRow];

    var colOf = {}, itemCols = [];
    for (var c = 0; c < headers.length; c++) {
      var label = String(headers[c]).trim();
      if (FIELD_MAP[label] && colOf[FIELD_MAP[label]] == null) colOf[FIELD_MAP[label]] = c;
      if (/الصنف/.test(label)) itemCols.push(c);
    }

    var order = body.order || body;
    var rowValues = _buildRow(headers.length, colOf, itemCols, order);
    var idCol = colOf['order_id'];
    var nameCol = colOf['customer_name'];

    // Upsert by order_id
    if (idCol != null && order.order_id) {
      for (var r = headerRow + 1; r < data.length; r++) {
        if (String(data[r][idCol]).trim() === String(order.order_id).trim()) {
          sh.getRange(r + 1, 1, 1, rowValues.length).setValues([rowValues]);
          return _json({ ok: true, action: 'updated', row: r + 1 });
        }
      }
    }

    // Append immediately AFTER the last real order (not getLastRow, which
    // counts trailing formatted/empty rows).
    var lastOrderIdx = headerRow;
    for (var r2 = headerRow + 1; r2 < data.length; r2++) {
      var hasId   = idCol   != null && String(data[r2][idCol]   || '').trim() !== '';
      var hasName = nameCol != null && String(data[r2][nameCol] || '').trim() !== '';
      if (hasId || hasName) lastOrderIdx = r2;
    }
    var insertAfter = lastOrderIdx + 1; // 1-indexed row to insert after
    sh.insertRowAfter(insertAfter);
    sh.getRange(insertAfter + 1, 1, 1, rowValues.length).setValues([rowValues]);
    return _json({ ok: true, action: 'inserted', row: insertAfter + 1 });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

// ── Sheet → App (on manual edit of status / tracking) ──
function onSheetEdit(e) {
  try {
    var sh = e.range.getSheet();
    if (!/strong|lowe/i.test(sh.getName())) return;
    var data = sh.getDataRange().getValues();
    var hr = _findHeaderRow(data);
    if (hr < 0) return;
    var headers = data[hr], idCol = -1, stCol = -1, trCol = -1;
    for (var c = 0; c < headers.length; c++) {
      var l = String(headers[c]).trim();
      if (l === 'كود الطلب' || l === 'Order ID' || l === 'رقم الطلب') idCol = c;
      if (l === 'الحالة') stCol = c;
      if (l === 'رقم التتبع' || l === 'التتبع') trCol = c;
    }
    var row = e.range.getRow() - 1, col = e.range.getColumn() - 1;
    if (row <= hr || idCol < 0) return;
    if (col !== stCol && col !== trCol) return;
    var orderId = String(data[row][idCol] || '').trim();
    if (!orderId) return;
    var patch = {};
    if (col === stCol) { var st = _statusKey(String(data[row][stCol])); if (st) patch.status = st; }
    if (col === trCol) patch.tracking_number = String(data[row][trCol] || '');
    if (!Object.keys(patch).length) return;
    UrlFetchApp.fetch(SUPA_URL + '/rest/v1/orders?order_id=eq.' + encodeURIComponent(orderId), {
      method: 'patch', contentType: 'application/json',
      headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, Prefer: 'return=minimal' },
      payload: JSON.stringify(patch), muteHttpExceptions: true,
    });
  } catch (err) { /* silent */ }
}

function _statusKey(ar) {
  ar = String(ar);
  if (/تم التسليم|delivered/i.test(ar)) return 'delivered';
  if (/تجهيز/i.test(ar)) return 'preparing';
  if (/جاهز/i.test(ar)) return 'ready';
  if (/شحن|ship/i.test(ar)) return 'shipped';
  if (/ملغ|cancel/i.test(ar)) return 'cancelled';
  if (/وارد|جديد|new/i.test(ar)) return 'pending';
  return null;
}

function _buildRow(width, colOf, itemCols, order) {
  var row = new Array(width).fill('');
  function put(key, val) { if (colOf[key] != null && val != null) row[colOf[key]] = val; }
  put('customer_name', order.customer_name); put('phone_1', order.phone_1);
  put('wa_number', order.wa_number); put('city', order.city);
  put('district', order.district); put('address', order.address);
  put('amount', order.amount); put('status_ar', STATUS_AR[order.status] || order.status || '');
  put('handler_name', order.handler_name); put('order_id', order.order_id);
  put('tracking_number', order.tracking_number); put('payment_method', order.payment_method);
  put('pickup_type', order.pickup_type); put('shipping_company', order.shipping_company);
  put('notes', order.notes);
  if (colOf['order_date'] != null && order.order_date) row[colOf['order_date']] = new Date(order.order_date);
  var items = order.items || [];
  for (var i = 0; i < items.length && i < itemCols.length; i++) {
    var ic = itemCols[i];
    row[ic] = items[i].name || '';
    if (ic + 1 < width) row[ic + 1] = items[i].qty || 1;
  }
  return row;
}

function _findHeaderRow(data) {
  for (var r = 0; r < Math.min(data.length, 30); r++)
    for (var c = 0; c < data[r].length; c++) {
      var v = String(data[r][c]).trim();
      if (v === 'كود الطلب' || v === 'Order ID' || v === 'رقم الطلب') return r;
    }
  return -1;
}

function _findSheet(ss, brand) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName().toLowerCase();
    if (brand === 'strong' && /strong/.test(n)) return sheets[i];
    if (brand !== 'strong' && /lowe/.test(n)) return sheets[i];
  }
  return null;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
