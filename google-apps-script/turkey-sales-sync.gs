/**
 * Turkey Sales Sync — clean two-tab version (app ↔ sheet).
 * Creates/uses TWO clean tabs in this spreadsheet:
 *   "LOWES_TR"  (brand = lowes)   ·   "STRONG_TR" (brand = strong)
 * Clean = no formulas / stray rows, so new orders always append at the
 * bottom and status/tracking edits sync both ways reliably.
 *
 * SETUP (owner, one time):
 *  1. Paste this code → Save.
 *  2. Run the function "setupSheets" once (▶ Run) and authorize. This creates
 *     the two clean tabs with the standard header.
 *  3. Deploy → Manage deployments → ✏️ → New version → Deploy (same URL).
 *  4. Two-way: Triggers (⏰) → Add Trigger → function "onSheetEdit",
 *     source "From spreadsheet", type "On edit" → Save.
 */

var TOKEN    = 'LOWES-TURKEY-2026';
var SUPA_URL = 'https://fghdumrgimoeqsafdhhh.supabase.co';
var ANON     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3OTQsImV4cCI6MjA5MTc2Nzc5NH0.e9DiuJySh4WMp7x5ErVV5LqBFawHUESrlGDRb8N5zPM';

var SHEET_FOR = { strong: 'STRONG_TR', lowes: 'LOWES_TR' };

// Standard clean header (both tabs identical).
var HEADER = [
  'التاريخ', 'كود الطلب', 'الاسم', 'الهاتف', 'رقم الواتساب', 'المدينة', 'البلدية',
  'العنوان', 'السعر', 'الحالة', 'صاحب الطلب', 'شركة الشحن', 'رقم التتبع',
  'نوع الدفع', 'مكان الاستلام', 'ملاحظة',
  'الصنف الأول', 'العدد', 'الصنف الثاني', 'العدد', 'الصنف الثالث', 'العدد',
  'الصنف الرابع', 'العدد', 'الصنف الخامس', 'العدد', 'الصنف السادس', 'العدد',
];

var FIELD_MAP = {
  'التاريخ': 'order_date', 'الاسم': 'customer_name', 'الإسم': 'customer_name',
  'الهاتف': 'phone_1', 'رقم الواتساب': 'wa_number', 'واتساب': 'wa_number',
  'المدينة': 'city', 'البلدية': 'district', 'العنوان': 'address',
  'السعر': 'amount', 'الحالة': 'status_ar', 'صاحب الطلب': 'handler_name',
  'شركة الشحن': 'shipping_company', 'كود الطلب': 'order_id', 'Order ID': 'order_id',
  'رقم التتبع': 'tracking_number', 'نوع الدفع': 'payment_method',
  'مكان الاستلام': 'pickup_type', 'ملاحظة': 'notes',
};

var STATUS_AR = {
  pending: 'وارد جديد 🆕', preparing: 'في التجهيز 📦', ready: 'جاهز 🚀',
  motor: 'قيد توصيل الموتور 🏍️', at_center: 'في المركز 🏢',
  shipped: 'في النقل 🚚', on_way: 'في الطريق للعميل 🛵', delivered: 'تم التسليم ✅',
  waiting: 'بالانتظار ⏳', not_received: 'لم يتم الاستلام 📭',
  returning: 'راجع للمركز ↩️', returned: 'راجع 🔁', settled: 'تمت التسوية 🤝',
  cancelled: 'ملغي ❌',
};

// Run once to create the two clean tabs.
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['STRONG_TR', 'LOWES_TR'].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight('bold').setBackground('#0f1f3d').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  });
}

// ── App → Sheet ──
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return _json({ ok: false, error: 'bad token' });
    var brand = (body.brand || 'lowes').toLowerCase();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_FOR[brand] || 'LOWES_TR');
    if (!sh) return _json({ ok: false, error: 'run setupSheets first' });

    var lastCol = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    var colOf = {}, itemCols = [];
    for (var c = 0; c < headers.length; c++) {
      var label = String(headers[c]).trim();
      if (FIELD_MAP[label] && colOf[FIELD_MAP[label]] == null) colOf[FIELD_MAP[label]] = c;
      if (/الصنف/.test(label)) itemCols.push(c);
    }

    var order = body.order || body;
    var rowValues = _buildRow(headers.length, colOf, itemCols, order);
    var idCol = colOf['order_id'];

    // Upsert by order code (so status/tracking edits update the same row)
    if (idCol != null && order.order_id) {
      var data = sh.getDataRange().getValues();
      for (var r = 1; r < data.length; r++) {
        if (String(data[r][idCol]).trim() === String(order.order_id).trim()) {
          sh.getRange(r + 1, 1, 1, rowValues.length).setValues([rowValues]);
          return _json({ ok: true, action: 'updated', row: r + 1 });
        }
      }
    }
    sh.appendRow(rowValues); // clean tab → always lands at the bottom
    return _json({ ok: true, action: 'appended', row: sh.getLastRow() });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

// ── Sheet → App (edit status / tracking) ──
function onSheetEdit(e) {
  try {
    var sh = e.range.getSheet();
    if (sh.getName() !== 'LOWES_TR' && sh.getName() !== 'STRONG_TR') return;
    var lastCol = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    var idCol = -1, stCol = -1, trCol = -1;
    for (var c = 0; c < headers.length; c++) {
      var l = String(headers[c]).trim();
      if (l === 'كود الطلب') idCol = c;
      if (l === 'الحالة') stCol = c;
      if (l === 'رقم التتبع') trCol = c;
    }
    var row = e.range.getRow(), col = e.range.getColumn() - 1;
    if (row <= 1 || idCol < 0) return;
    if (col !== stCol && col !== trCol) return;
    var orderId = String(sh.getRange(row, idCol + 1).getValue() || '').trim();
    if (!orderId) return;
    var patch = {};
    if (col === stCol) { var st = _statusKey(String(sh.getRange(row, stCol + 1).getValue())); if (st) patch.status = st; }
    if (col === trCol) patch.tracking_number = String(sh.getRange(row, trCol + 1).getValue() || '');
    if (!Object.keys(patch).length) return;
    UrlFetchApp.fetch(SUPA_URL + '/rest/v1/orders?order_id=eq.' + encodeURIComponent(orderId), {
      method: 'patch', contentType: 'application/json',
      headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, Prefer: 'return=minimal' },
      payload: JSON.stringify(patch), muteHttpExceptions: true,
    });
  } catch (err) { }
}

function _statusKey(ar) {
  ar = String(ar);
  if (/تم التسليم|delivered/i.test(ar)) return 'delivered';
  if (/تسوية|settled/i.test(ar)) return 'settled';
  if (/لم يتم الاستلام|not.?received/i.test(ar)) return 'not_received';
  if (/راجع للمركز|return.?center/i.test(ar)) return 'returning';
  if (/راجع|return/i.test(ar)) return 'returned';
  if (/انتظار|متابعة|wait/i.test(ar)) return 'waiting';
  if (/الطريق|on.?way/i.test(ar)) return 'on_way';
  if (/موتور|motor/i.test(ar)) return 'motor';
  if (/في المركز|center/i.test(ar)) return 'at_center';
  if (/تجهيز/i.test(ar)) return 'preparing';
  if (/جاهز/i.test(ar)) return 'ready';
  if (/شحن|نقل|ship|transit/i.test(ar)) return 'shipped';
  if (/ملغ|cancel|الغاء/i.test(ar)) return 'cancelled';
  if (/وارد|جديد|new/i.test(ar)) return 'pending';
  return null;
}

function _buildRow(width, colOf, itemCols, order) {
  var row = new Array(width).fill('');
  function put(key, val) { if (colOf[key] != null && val != null) row[colOf[key]] = val; }
  if (colOf['order_date'] != null && order.order_date) row[colOf['order_date']] = new Date(order.order_date);
  put('order_id', order.order_id); put('customer_name', order.customer_name);
  put('phone_1', order.phone_1); put('wa_number', order.wa_number);
  put('city', order.city); put('district', order.district); put('address', order.address);
  put('amount', order.amount); put('status_ar', STATUS_AR[order.status] || order.status || '');
  put('handler_name', order.handler_name); put('shipping_company', order.shipping_company);
  put('tracking_number', order.tracking_number); put('payment_method', order.payment_method);
  put('pickup_type', order.pickup_type); put('notes', order.notes);
  var items = order.items || [];
  for (var i = 0; i < items.length && i < itemCols.length; i++) {
    row[itemCols[i]] = items[i].name || '';
    if (itemCols[i] + 1 < width) row[itemCols[i] + 1] = items[i].qty || 1;
  }
  return row;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
