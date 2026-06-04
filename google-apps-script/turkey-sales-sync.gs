/**
 * Turkey Sales Sync — appends/updates orders into the Turkey spreadsheet.
 * Two tabs: "Strong" (brand=strong) and "LOWE'S" (brand=lowes).
 * Deploy as a Web App (Execute as: me / owner · Access: Anyone) and put the
 * /exec URL into the Supabase edge function secret TURKEY_SHEET_SYNC_URL.
 *
 * Design (mirrors the proven Syria sync):
 *  - Detects the header row dynamically (the row containing "كود الطلب").
 *  - Maps order fields → columns by the header LABEL (Arabic), so it survives
 *    minor column shifts between the two tabs.
 *  - Upserts by "كود الطلب" (Order ID): if the order already exists, it UPDATES
 *    that row (so status & tracking changes reflect); otherwise appends a new
 *    row under the last one.
 */

var TOKEN = 'LOWES-TURKEY-2026';

// Arabic header label → key in the incoming payload.
var FIELD_MAP = {
  'الاسم': 'customer_name', 'الإسم': 'customer_name', 'الاسم الكامل': 'customer_name',
  'الهاتف': 'phone_1', 'رقم الهاتف': 'phone_1', 'الرقم': 'phone_1',
  'رقم الواتساب': 'wa_number', 'واتساب': 'wa_number', 'W.App': 'wa_number',
  'المدينة': 'city',
  'البلدية': 'district',
  'العنوان': 'address',
  'السعر': 'amount', 'السعر (TRY)': 'amount', 'القيمة': 'amount',
  'الحالة': 'status_ar',
  'صاحب الطلب': 'handler_name', 'البائع': 'handler_name',
  'كود الطلب': 'order_id', 'رقم الطلب': 'order_id', 'Order ID': 'order_id',
  'رقم التتبع': 'tracking_number', 'التتبع': 'tracking_number',
  'نوع الدفع': 'payment_method', 'الدفع': 'payment_method',
  'مكان الاستلام': 'pickup_type',
  'ارسال مع': 'shipping_company', 'شركة الشحن': 'shipping_company',
  'ملاحظة': 'notes', 'ملاحظات': 'notes',
  'التاريخ': 'order_date',
};

var STATUS_AR = {
  pending: 'وارد جديد 🆕', preparing: 'قيد التجهيز 📦', ready: 'جاهز 🚀',
  shipped: 'في الشحن 🚚', delivered: 'تم التسليم ✅', cancelled: 'ملغي ❌',
};

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return _json({ ok: false, error: 'bad token' });
    var brand = (body.brand || 'lowes').toLowerCase();
    var sheetName = brand === 'strong' ? 'Strong' : "LOWE'S";
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(sheetName) || _findSheet(ss, brand);
    if (!sh) return _json({ ok: false, error: 'sheet not found: ' + sheetName });

    var data = sh.getDataRange().getValues();
    var headerRow = _findHeaderRow(data);
    if (headerRow < 0) return _json({ ok: false, error: 'header row not found' });
    var headers = data[headerRow];

    // Build column index by label
    var colOf = {};
    for (var c = 0; c < headers.length; c++) {
      var label = String(headers[c]).trim();
      if (FIELD_MAP[label] && colOf[FIELD_MAP[label]] == null) colOf[FIELD_MAP[label]] = c;
    }
    // Item columns: every header that contains "الصنف" followed by a "العدد"
    var itemCols = [];
    for (var c2 = 0; c2 < headers.length; c2++) {
      if (/الصنف/.test(String(headers[c2]))) itemCols.push(c2);
    }

    var order = body.order || body;
    var rowValues = _buildRow(headers.length, colOf, itemCols, order);

    // Upsert by order_id
    var idCol = colOf['order_id'];
    var targetRow = -1;
    if (idCol != null && order.order_id) {
      for (var r = headerRow + 1; r < data.length; r++) {
        if (String(data[r][idCol]).trim() === String(order.order_id).trim()) { targetRow = r; break; }
      }
    }
    if (targetRow >= 0) {
      sh.getRange(targetRow + 1, 1, 1, rowValues.length).setValues([rowValues]);
      return _json({ ok: true, action: 'updated', row: targetRow + 1, sheet: sheetName });
    } else {
      sh.appendRow(rowValues);
      return _json({ ok: true, action: 'appended', sheet: sheetName });
    }
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function _buildRow(width, colOf, itemCols, order) {
  var row = new Array(width).fill('');
  function put(key, val) { if (colOf[key] != null && val != null) row[colOf[key]] = val; }
  put('customer_name', order.customer_name);
  put('phone_1', order.phone_1);
  put('wa_number', order.wa_number);
  put('city', order.city);
  put('district', order.district);
  put('address', order.address);
  put('amount', order.amount);
  put('status_ar', STATUS_AR[order.status] || order.status || '');
  put('handler_name', order.handler_name);
  put('order_id', order.order_id);
  put('tracking_number', order.tracking_number);
  put('payment_method', order.payment_method);
  put('pickup_type', order.pickup_type);
  put('shipping_company', order.shipping_company);
  put('notes', order.notes);
  if (colOf['order_date'] != null && order.order_date) {
    row[colOf['order_date']] = new Date(order.order_date);
  }
  // Items into الصنف/العدد column pairs
  var items = order.items || [];
  for (var i = 0; i < items.length && i < itemCols.length; i++) {
    var ic = itemCols[i];
    row[ic] = items[i].name || '';
    if (ic + 1 < width) row[ic + 1] = items[i].qty || 1;
  }
  return row;
}

function _findHeaderRow(data) {
  for (var r = 0; r < Math.min(data.length, 30); r++) {
    for (var c = 0; c < data[r].length; c++) {
      var v = String(data[r][c]).trim();
      if (v === 'كود الطلب' || v === 'Order ID' || v === 'رقم الطلب') return r;
    }
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
