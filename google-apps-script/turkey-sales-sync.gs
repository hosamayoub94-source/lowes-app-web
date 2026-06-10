/**
 * Turkey Sales Sync — clean two-tab version (app ↔ sheet).
 * Creates/uses TWO clean tabs in this spreadsheet:
 *   "LOWES_TR"  (brand = lowes)   ·   "STRONG_TR" (brand = strong)
 * Clean = no formulas / stray rows, so new orders always append at the
 * bottom and status/tracking edits sync both ways reliably.
 *
 * ⚠️ LIVE REALITY (verified 10 Jun 2026): the deployed Turkey Apps Script is
 * NOT this exact file. It lives in the spreadsheet-bound project id
 * "1ub2zm_Ne4NzbJmylw_IgB7Mu8ac_EIUBnVGHbCV-n2jhxbymcEmrkX1O" (account
 * hosam101hosam10@gmail.com), file "Dashboard.gs", and already contains
 * relaxPickupValidation() (column T) + the doPost upsert. This file is a
 * reference; treat the live project as source of truth. The
 * relaxAllStatusValidation() helper below WAS pasted into & run on the live
 * project to fix order 6S534 (status "motor" was rejected by column I's
 * "reject" data-validation → relaxed to "warning"). Sheet: 1OP_q1GJeE7...
 *
 * SETUP (owner, one time):
 *  1. Paste this code → Save.
 *  2. Run the function "setupSheets" once (▶ Run) and authorize. This creates
 *     the two clean tabs with the standard header.
 *  3. Deploy → Manage deployments → ✏️ → New version → Deploy (same URL).
 *  4. Two-way: Triggers (⏰) → Add Trigger → function "onSheetEdit",
 *     source "From spreadsheet", type "On edit" → Save.
 */

var TOKEN          = 'LOWES-TURKEY-2026';
var SUPA_URL       = 'https://fghdumrgimoeqsafdhhh.supabase.co';
var ANON           = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3OTQsImV4cCI6MjA5MTc2Nzc5NH0.e9DiuJySh4WMp7x5ErVV5LqBFawHUESrlGDRb8N5zPM';
// Edge Function URL — يستخدم service_role داخلياً فيتجاوز RLS
var SHEET_TO_APP_URL = SUPA_URL + '/functions/v1/sheet-to-app';

var SHEET_FOR = { strong: 'STRONG_TR', lowes: 'LOWES_TR' };

// Header — mirrors the team's OLD sheet column range (row 5) so it feels familiar.
// Manual/formula columns (تقييد, واتساب, W.App, الموقع, رقم التتبع, YURTİÇİ, تتبع,
// فاطمة, زيزو) are kept as placeholders and NEVER overwritten by the app — the
// team fills them by hand (esp. رقم التتبع in column P).
var HEADER = [
  'التاريخ', 'الإسم', 'الهاتف', 'رقم الواتساب', 'المدينة', 'البلدية', 'العنوان',
  'السعر', 'الحالة', 'صاحب الطلب', 'كود الطلب', 'تقييد', 'واتساب', 'W.App',
  '📍الموقع', 'رقم التتبع', 'YURTİÇİ', 'تتبع', 'نوع الدفع', 'مكان الاستلام',
  'ارسال مع', 'ملاحظة', 'فاطمة', 'زيزو',
  'الصنف الأول', 'العدد', 'الصنف الثاني', 'العدد', 'الصنف الثالث', 'العدد',
  'الصنف الرابع', 'العدد', 'الصنف الخامس', 'العدد', 'الصنف السادس', 'العدد',
  'الصنف السابع', 'العدد', 'الصنف الثامن', 'العدد',
];

var FIELD_MAP = {
  'التاريخ': 'order_date', 'الاسم': 'customer_name', 'الإسم': 'customer_name',
  'الهاتف': 'phone_1', 'رقم الواتساب': 'wa_number', 'واتساب': 'wa_number',
  'المدينة': 'city', 'البلدية': 'district', 'العنوان': 'address',
  'السعر': 'amount', 'الحالة': 'status_ar', 'صاحب الطلب': 'handler_name',
  'شركة الشحن': 'shipping_company', 'ارسال مع': 'shipping_company',
  'كود الطلب': 'order_id', 'Order ID': 'order_id',
  'رقم التتبع': 'tracking_number', 'نوع الدفع': 'payment_method',
  'مكان الاستلام': 'pickup_type', 'ملاحظة': 'notes',
};

// Header labels the APP writes (forward sync). Anything else (tracking, تقييد,
// W.App, الموقع, YURTİÇİ, تتبع, فاطمة, زيزو, totals) is preserved on upsert.
var APP_OWNED = {
  'التاريخ': 1, 'الإسم': 1, 'الاسم': 1, 'الهاتف': 1, 'رقم الواتساب': 1, 'المدينة': 1,
  'البلدية': 1, 'العنوان': 1, 'السعر': 1, 'الحالة': 1, 'صاحب الطلب': 1, 'كود الطلب': 1,
  'نوع الدفع': 1, 'مكان الاستلام': 1, 'ارسال مع': 1, 'شركة الشحن': 1, 'ملاحظة': 1,
};

var STATUS_AR = {
  pending: 'وارد جديد 🆕', preparing: 'في التجهيز 📦', ready: 'جاهز 🚀',
  motor: 'قيد توصيل الموتور 🏍️', motor_prep: 'تحضير الموتور 🛠️', at_center: 'في المركز 🏢',
  shipped: 'في النقل 🚚', on_way: 'قيد التوصيل 🛵', special_delivery: 'توصيل خاص 🚗',
  prepaid: 'مسبق الدفع 💳', delivered: 'تم التسليم ✅',
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
    var owned = _buildOwned(headers.length, colOf, itemCols, order); // {colIndex: value}
    var idCol = colOf['order_id'];

    // Upsert by order code: overwrite ONLY app-owned cells, keep manual columns
    // (tracking, تقييد, W.App, الموقع, YURTİÇİ, فاطمة, زيزو, totals) intact.
    if (idCol != null && order.order_id) {
      var data = sh.getDataRange().getValues();
      for (var r = 1; r < data.length; r++) {
        if (String(data[r][idCol]).trim() === String(order.order_id).trim()) {
          var rowVals = data[r].slice(0, headers.length);
          while (rowVals.length < headers.length) rowVals.push('');
          for (var k in owned) rowVals[k] = owned[k];
          sh.getRange(r + 1, 1, 1, headers.length).setValues([rowVals]);
          return _json({ ok: true, action: 'updated', row: r + 1 });
        }
      }
    }
    // Insert right after the last row that has an order_id (not at sheet bottom)
    var idColNum = (idCol != null ? idCol : 0) + 1; // 1-indexed
    var totalRows = sh.getLastRow();
    var idValues = sh.getRange(1, idColNum, totalRows, 1).getValues();
    var lastDataRow = 1;
    for (var ri = idValues.length - 1; ri >= 1; ri--) {
      if (String(idValues[ri][0]).trim() !== '') { lastDataRow = ri + 1; break; }
    }
    var insertAt = lastDataRow + 1;
    var blank = new Array(headers.length).fill('');
    for (var k2 in owned) blank[k2] = owned[k2];
    sh.getRange(insertAt, 1, 1, headers.length).setValues([blank]);
    return _json({ ok: true, action: 'appended', row: insertAt });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

// ── Sheet → App (edit status / tracking) ──
// يُراقب تعديلات عمود "رقم التتبع" (P) وعمود "الحالة"
// ويرسلها لـ Edge Function بدلاً من REST مباشر (يتجاوز RLS)
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
      if (l === 'الحالة')    stCol = c;
      if (l === 'رقم التتبع') trCol = c;
    }
    var row = e.range.getRow(), col = e.range.getColumn() - 1;
    if (row <= 1 || idCol < 0) return;
    if (col !== stCol && col !== trCol) return;

    var orderId = String(sh.getRange(row, idCol + 1).getValue() || '').trim();
    if (!orderId) return;

    var payload = { token: TOKEN, action: 'update', order_id: orderId };
    if (col === stCol) payload.status = String(sh.getRange(row, stCol + 1).getValue() || '');
    if (col === trCol) payload.tracking_number = String(sh.getRange(row, trCol + 1).getValue() || '');

    UrlFetchApp.fetch(SHEET_TO_APP_URL, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true,
    });
  } catch (err) { }
}

// ── Bulk Import: جلب كل طلبات الجدول وإدراجها في التطبيق ──
// شغّلها مرة وحدة من محرر Apps Script: Run → bulkImportFromSheet
function bulkImportFromSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var allRows = [];

  ['LOWES_TR', 'STRONG_TR'].forEach(function (sheetName) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    var brand = sheetName === 'STRONG_TR' ? 'strong' : 'lowes';
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return;
    var lastCol = sh.getLastColumn();
    var data = sh.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = data[0];

    // بناء خريطة عمود → حقل
    var colMap = {};
    for (var c = 0; c < headers.length; c++) {
      var label = String(headers[c]).trim();
      if (FIELD_MAP[label]) colMap[c] = FIELD_MAP[label];
    }
    // أعمدة الأصناف
    var itemCols = [];
    for (var c = 0; c < headers.length; c++) {
      if (/الصنف/.test(String(headers[c]))) itemCols.push(c);
    }

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var order_id = '';
      for (var c = 0; c < headers.length; c++) {
        if (String(headers[c]).trim() === 'كود الطلب') { order_id = String(row[c] || '').trim(); break; }
      }
      if (!order_id) continue; // تخطّ الصفوف بدون كود طلب

      var record = { brand: brand };
      for (var c in colMap) {
        var val = row[c];
        if (val !== '' && val !== null && val !== undefined) record[colMap[c]] = val;
      }

      // الأصناف
      var items = [];
      for (var i = 0; i < itemCols.length; i += 2) {
        var name = String(row[itemCols[i]] || '').trim();
        var qty  = Number(row[itemCols[i + 1]] || 1);
        if (name) items.push({ name: name, qty: qty });
      }
      if (items.length) record.items = items;

      allRows.push(record);
    }
  });

  if (!allRows.length) {
    SpreadsheetApp.getUi().alert('لا توجد صفوف لاستيرادها');
    return;
  }

  // أرسل على دفعات (100 طلب لكل مرة)
  var total = { inserted: 0, updated: 0, skipped: 0 };
  var batch = 100;
  for (var i = 0; i < allRows.length; i += batch) {
    var chunk = allRows.slice(i, i + batch);
    var res = UrlFetchApp.fetch(SHEET_TO_APP_URL, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ token: TOKEN, action: 'bulk_import', rows: chunk }),
      muteHttpExceptions: true,
    });
    try {
      var out = JSON.parse(res.getContentText());
      total.inserted += out.inserted || 0;
      total.updated  += out.updated  || 0;
      total.skipped  += out.skipped  || 0;
    } catch (e) { total.skipped += chunk.length; }
  }

  SpreadsheetApp.getUi().alert(
    'اكتمل الاستيراد ✅\n' +
    'جديد: ' + total.inserted + '\n' +
    'محدَّث: ' + total.updated + '\n' +
    'تخطّى: ' + total.skipped
  );
}

function _statusKey(ar) {
  ar = String(ar);
  if (/تم التسليم|delivered/i.test(ar)) return 'delivered';
  if (/تسوية|settled/i.test(ar)) return 'settled';
  if (/لم يتم الاستلام|not.?received/i.test(ar)) return 'not_received';
  if (/راجع للمركز|return.?center/i.test(ar)) return 'returning';
  if (/راجع|return/i.test(ar)) return 'returned';
  if (/انتظار|متابعة|wait/i.test(ar)) return 'waiting';
  if (/تحضير.*موتور|motor.?prep/i.test(ar)) return 'motor_prep';
  if (/موتور|motor/i.test(ar)) return 'motor';
  if (/توصيل خاص|special/i.test(ar)) return 'special_delivery';
  if (/مسبق|prepaid/i.test(ar)) return 'prepaid';
  if (/قيد التوصيل|الطريق|on.?way/i.test(ar)) return 'on_way';
  if (/في المركز|center/i.test(ar)) return 'at_center';
  if (/تجهيز/i.test(ar)) return 'preparing';
  if (/جاهز/i.test(ar)) return 'ready';
  if (/شحن|نقل|ship|transit/i.test(ar)) return 'shipped';
  if (/ملغ|cancel|الغاء/i.test(ar)) return 'cancelled';
  if (/وارد|جديد|new/i.test(ar)) return 'pending';
  return null;
}

// Build a sparse map {colIndex: value} for the columns the APP owns. Note:
// tracking_number is intentionally NOT written — column P (رقم التتبع) is filled
// manually by the team, and the reverse trigger reads their value back.
function _buildOwned(width, colOf, itemCols, order) {
  var owned = {};
  function put(key, val) { if (colOf[key] != null && val != null && key !== 'tracking_number') owned[colOf[key]] = val; }
  if (colOf['order_date'] != null && order.order_date) owned[colOf['order_date']] = new Date(order.order_date);
  put('order_id', order.order_id); put('customer_name', order.customer_name);
  put('phone_1', order.phone_1); put('wa_number', order.wa_number);
  put('city', order.city); put('district', order.district); put('address', order.address);
  put('amount', order.amount);
  if (colOf['status_ar'] != null) owned[colOf['status_ar']] = STATUS_AR[order.status] || order.status || '';
  put('handler_name', order.handler_name); put('shipping_company', order.shipping_company);
  put('payment_method', order.payment_method); put('pickup_type', order.pickup_type);
  put('notes', order.notes);
  var items = order.items || [];
  for (var i = 0; i < items.length && i < itemCols.length; i++) {
    owned[itemCols[i]] = items[i].name || '';
    if (itemCols[i] + 1 < width) owned[itemCols[i] + 1] = items[i].qty || 1;
  }
  return owned;
}

// ── Relax ALL dropdown validations to "warning" (allow invalid) ──
// قاعدة المالك الدائمة: أي عمود ذو قائمة منسدلة لازم «تحذير» لا «رفض» وإلا
// يكسر المزامنة (سبب فشل 6S534 بعمود الحالة I + مشكلة العمود T 10 يونيو).
// تحافظ على القوائم كما هي وتغيّر السلوك فقط: رفض (reject) → تحذير (allowInvalid).
// تغطّي كامل التابين (لا أعمدة محددة) فتحمي العمود I والأعمدة المستقبلية.
// ✅ هذه الدالة (بنفس الاسم relaxAllStatusValidation) أُلصقت وشُغّلت على المشروع
// الحيّ 10 يونيو 2026: LOWES_TR=relaxed 2000 cells (عمود I), STRONG_TR=0.
// شغّلها مرة من المحرّر: Run → relaxAllStatusValidation
function relaxAllStatusValidation() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = [];
  ['LOWES_TR', 'STRONG_TR'].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { report.push(name + ': not found'); return; }
    var maxRow = sh.getMaxRows(), maxCol = sh.getMaxColumns();
    var rng = sh.getRange(1, 1, maxRow, maxCol);
    var rules = rng.getDataValidations();
    var changed = 0;
    for (var r = 0; r < rules.length; r++) {
      for (var c = 0; c < rules[r].length; c++) {
        var rule = rules[r][c];
        // rule.copy() يحافظ على نوع القاعدة وقيم القائمة كما هي.
        if (rule && rule.getAllowInvalid() === false) {
          rules[r][c] = rule.copy().setAllowInvalid(true).build();
          changed++;
        }
      }
    }
    if (changed) rng.setDataValidations(rules);
    report.push(name + ': relaxed ' + changed + ' cells');
  });
  Logger.log(report.join(' | '));
  return report.join(' | ');
}

// Reset both clean tabs to the new header (run once after changing HEADER).
// Clears existing rows — the app re-syncs active orders automatically.
function rebuildSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['STRONG_TR', 'LOWES_TR'].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();
    sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight('bold').setBackground('#0f1f3d').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  });
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
