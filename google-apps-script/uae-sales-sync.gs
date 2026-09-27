/**
 * UAE Sales Sync — app ↔ Google Sheet «تنزيل طلبات UEA» (27 أيلول 2026).
 * Sheet: 1VmwcxCZD6t3TqrCBsNO7jAIVEJNTFTin9UVjVtypigk
 *   تاب الطلبات النشطة: «شحنات الامارات»  (صف العناوين = الصف اللي فيه «كود الطلب»، حالياً 5)
 *   تاب الأرشيف:        «تسليمات الامارات»
 *
 * مبني على turkey-sales-sync.gs مع فروقات الجدول الإماراتي:
 *  - العناوين مو بالصف 1 (فوقها صفوف جرد: أسماء المنتجات بالصف 1 + عدّادات بالصف 4)
 *    → يُكتشف صف العناوين تلقائياً.
 *  - أعمدة معادلات («بعد التوصيل»، «المجموع») → الكتابة خلية-خلية للأعمدة المملوكة
 *    للتطبيق فقط، ولا يُكتب الصف كاملاً (كان سيمسح المعادلات). صف جديد بلا معادلة
 *    ينسخ معادلة الصف اللي فوقه.
 *  - أسماء المنتجات تُطابَق مع أسماء أعمدة الجرد (الصف 1) لتبقى عدّادات الجرد صحيحة.
 *  - طلب جديد ينزل بأول صف بعد آخر صف فيه «الإسم» (الصفوف المحجوزة مسبقاً بأكواد
 *    uae 9/ xx بلا اسم تُستخدم ويُكتب فوق كودها كود التطبيق UL-n).
 *
 * التركيب (مرة واحدة، من محرر Apps Script المرتبط بالجدول):
 *  1. الصق الكود → Save.
 *  2. Run → relaxUaeValidation (موافقة الصلاحيات أول مرة).
 *  3. Run → createUaeTriggers  (تريغر تعديل الحالة → التطبيق).
 *  4. Deploy → New deployment → Web app → Execute as: Me · Access: Anyone → انسخ رابط /exec
 *     وضعه بسرّ Supabase: UAE_SHEET_SYNC_URL (والتوكن UAE_SHEET_SYNC_TOKEN = TOKEN أدناه).
 *  ⚠️ أي تعديل لاحق على doPost يحتاج: Manage deployments → ✏️ → New version → Deploy.
 */

var TOKEN            = 'LOWES-UAE-2026';
var SHEET_ID         = '1VmwcxCZD6t3TqrCBsNO7jAIVEJNTFTin9UVjVtypigk';
var ACTIVE_TAB       = 'شحنات الامارات';
var ARCHIVE_TAB      = 'تسليمات الامارات';
var TZ               = 'Asia/Dubai';
var SUPA_URL         = 'https://fghdumrgimoeqsafdhhh.supabase.co';
var SHEET_TO_APP_URL = SUPA_URL + '/functions/v1/sheet-to-app';

// عنوان العمود بالجدول → حقل الطلب.
var FIELD_MAP = {
  'التاريخ': 'order_date', 'الإسم': 'customer_name', 'الاسم': 'customer_name',
  'رقم الواتساب': 'phone_1', 'رقم 2': 'phone_2',
  'الامارة': 'city', 'الإمارة': 'city', 'المنطقة': 'district', 'العنوان': 'address',
  'السعر': 'amount', 'الحالة': 'status_ar', 'صاحب الطلب': 'handler_name',
  'كود الطلب': 'order_id', 'ملاحظة': 'notes', 'نوع الدفع': 'payment_method',
  'مكان الاستلام': 'pickup_type',
};

// قيم عمود الحالة بالجدول (بلا إيموجي — نفس القائمة المنسدلة الحالية).
var STATUS_AR = {
  pending: 'وارد جديد', preparing: 'في التجهيز', ready: 'جاهز', shipped: 'في النقل',
  at_center: 'في المركز', on_way: 'قيد التوصيل', delivered: 'تم التسليم',
  waiting: 'بالانتظار', not_received: 'لم يتم الاستلام', returning: 'راجع للمركز',
  returned: 'تم الاسترجاع', settled: 'تمت التسوية', cancelled: 'ملغي',
  prepaid: 'مسبق الدفع', motor: 'في النقل', motor_prep: 'في التجهيز', special_delivery: 'في النقل',
};

// أسماء البائعات كما بالقائمة المنسدلة «صاحب الطلب» (مطابقة بأول اسم).
var SELLER_ALIAS = { arwa: 'ِARWA', raghad: 'RAGHAD M', reem: 'reem' };

// أسماء التطبيق اللي تختلف عن أسماء أعمدة الجرد (بعد التطبيع).
var ITEM_ALIAS = { rosemaryoil: 'rosemaryserum', facialpeelinggel: 'facepeeling', facewash: 'cleanserfornormalanddryskin' };

// ─────────────────────────── App → Sheet ───────────────────────────
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== TOKEN) return _json({ ok: false, error: 'bad token' });
    lock.waitLock(20000);

    var order = body.order || {};
    var oid = String(order.order_id || '').trim();
    if (!oid) return _json({ ok: false, error: 'missing order_id' });

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName(ACTIVE_TAB);
    if (!sh) return _json({ ok: false, error: 'tab not found: ' + ACTIVE_TAB });

    var layout = _layout(sh);
    if (!layout) return _json({ ok: false, error: 'header row (كود الطلب) not found' });

    var data = sh.getRange(1, 1, Math.max(sh.getLastRow(), layout.headerRow), layout.width).getValues();
    var idc = layout.colOf.order_id;

    // 1) تحديث صف موجود بنفس الكود
    for (var r = layout.headerRow; r < data.length; r++) {
      if (String(data[r][idc]).trim() === oid) {
        _writeOwned(sh, r + 1, layout, order, false);
        return _json({ ok: true, action: 'updated', row: r + 1 });
      }
    }

    // 2) حارس التكرار: الطلب منقول لتاب الأرشيف → لا تُلحقه من جديد
    if (_inArchive(ss, oid)) return _json({ ok: true, skipped: 'in_delivered_tab' });

    // 3) حالة نهائية وغير موجود بالتاب النشط → لا صفوف وهمية
    var TERMINAL = { delivered: 1, settled: 1, returned: 1 };
    if (TERMINAL[order.status]) return _json({ ok: true, skipped: 'terminal_not_in_sheet' });

    // 4) إلحاق: أول صف بعد آخر صف فيه «الإسم»
    var nc = layout.colOf.customer_name;
    var last = layout.headerRow; // 1-indexed row of header
    for (var r2 = data.length - 1; r2 >= layout.headerRow; r2--) {
      if (String(data[r2][nc]).trim() !== '') { last = r2 + 1; break; }
    }
    var insertAt = last + 1;
    if (insertAt > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 20);
    _writeOwned(sh, insertAt, layout, order, true);
    return _json({ ok: true, action: 'appended', row: insertAt });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) { }
  }
}

// يكتشف صف العناوين + فهارس الأعمدة + أعمدة الأصناف + أسماء الجرد.
function _layout(sh) {
  var width = sh.getLastColumn();
  var top = sh.getRange(1, 1, Math.min(15, sh.getLastRow()), width).getValues();
  var hr = -1;
  for (var r = 0; r < top.length; r++) {
    for (var c = 0; c < width; c++) if (String(top[r][c]).trim() === 'كود الطلب') { hr = r; break; }
    if (hr >= 0) break;
  }
  if (hr < 0) return null;
  var headers = top[hr];
  var colOf = {}, itemCols = [], labels = [];
  for (var c2 = 0; c2 < headers.length; c2++) {
    var label = String(headers[c2]).trim();
    labels.push(label);
    var f = FIELD_MAP[label];
    if (f && colOf[f] == null) colOf[f] = c2;
    if (/^الصنف/.test(label)) itemCols.push(c2);
  }
  // أسماء المنتجات (أعمدة الجرد): الصف 1 إنجليزي، والصف 3 عربي بنفس العمود.
  var canon = {};
  for (var c3 = 0; c3 < width; c3++) {
    var en = String(top[0][c3] || '').trim();
    if (!en || /^العمود/.test(en)) continue;
    canon[_normItem(en)] = en;
    var ar = hr > 2 ? String(top[2][c3] || '').trim() : '';
    if (ar) canon[_normItem(ar)] = en;
  }
  return { headerRow: hr + 1, width: width, colOf: colOf, itemCols: itemCols, labels: labels, canon: canon };
}

function _normItem(s) {
  var n = String(s || '').toLowerCase().replace(/roller/g, 'rolle').replace(/[^a-z0-9.؀-ۿ]/g, '');
  return ITEM_ALIAS[n] || n;
}

function _sheetItemName(layout, name) {
  var n = _normItem(name);
  return layout.canon[n] || name;
}

function _sellerName(name) {
  var first = String(name || '').trim().split(/\s+/)[0].toLowerCase();
  return SELLER_ALIAS[first] || name || '';
}

// يكتب الأعمدة المملوكة للتطبيق خلية-خلية (لا يلمس المعادلات/الأعمدة اليدوية).
function _writeOwned(sh, rowNum, layout, order, isNew) {
  var co = layout.colOf, owned = {};
  function put(key, val) { if (co[key] != null && val != null && val !== '') owned[co[key]] = val; }
  if (isNew && co.order_date != null) {
    var d = order.order_date ? new Date(order.order_date) : new Date();
    owned[co.order_date] = Utilities.formatDate(isNaN(d) ? new Date() : d, TZ, 'yyyy/MM/dd');
  }
  put('order_id', order.order_id);
  put('customer_name', order.customer_name);
  put('phone_1', order.phone_1);
  put('phone_2', order.phone_2);
  put('city', order.city);
  put('district', order.district);
  put('address', order.address);
  put('amount', order.amount);
  if (co.status_ar != null) owned[co.status_ar] = STATUS_AR[order.status] || order.status || '';
  if (co.handler_name != null && order.handler_name) owned[co.handler_name] = _sellerName(order.handler_name);
  put('payment_method', order.payment_method);
  put('pickup_type', order.pickup_type);
  put('notes', order.notes);

  // الأصناف: تُكتب كاملة (مع تفريغ الخانات الزائدة عند تقليص الطلب)
  var items = order.items || [];
  for (var i = 0; i < layout.itemCols.length; i++) {
    var ic = layout.itemCols[i];
    var it = items[i];
    owned[ic] = it ? _sheetItemName(layout, it.name) : '';
    if (ic + 1 < layout.width && layout.labels[ic + 1] === 'العدد') owned[ic + 1] = it ? (Number(it.qty) || 1) : '';
  }

  _relaxRow(sh, rowNum, layout.width);
  // كتابة مجمّعة للخلايا المتجاورة فقط (أسرع) — بلا لمس أي عمود غير مملوك بينها.
  var keys = Object.keys(owned).map(Number).sort(function (a, b) { return a - b; });
  var i2 = 0;
  while (i2 < keys.length) {
    var start = keys[i2], run = [owned[start]];
    while (i2 + 1 < keys.length && keys[i2 + 1] === keys[i2] + 1) { i2++; run.push(owned[keys[i2]]); }
    sh.getRange(rowNum, start + 1, 1, run.length).setValues([run]);
    i2++;
  }

  // صف جديد: انسخ معادلات الصف اللي فوقه للأعمدة غير المملوكة الفارغة (بعد التوصيل/المجموع)
  if (isNew && rowNum - 1 > layout.headerRow) {
    var above = sh.getRange(rowNum - 1, 1, 1, layout.width).getFormulasR1C1()[0];
    var cur = sh.getRange(rowNum, 1, 1, layout.width).getFormulasR1C1()[0];
    var vals = sh.getRange(rowNum, 1, 1, layout.width).getValues()[0];
    for (var c = 0; c < layout.width; c++) {
      if (owned[c] !== undefined) continue;
      if (above[c] && !cur[c] && (vals[c] === '' || vals[c] === null)) sh.getRange(rowNum, c + 1).setFormulaR1C1(above[c]);
    }
  }
}

function _inArchive(ss, oid) {
  var ash = ss.getSheetByName(ARCHIVE_TAB);
  if (!ash || ash.getLastRow() < 1) return false;
  var width = ash.getLastColumn();
  var idc = 11; // الافتراضي: العمود L (نفس ترتيب أعمدة تاب الشحنات)
  var top = ash.getRange(1, 1, Math.min(15, ash.getLastRow()), width).getValues();
  for (var r = 0; r < top.length; r++) {
    for (var c = 0; c < width; c++) if (String(top[r][c]).trim() === 'كود الطلب') { idc = c; r = top.length; break; }
  }
  var ids = ash.getRange(1, idc + 1, ash.getLastRow(), 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === oid) return true;
  return false;
}

// قاعدة المالك: أي قائمة منسدلة = «تحذير» لا «رفض» وإلا تنكسر المزامنة.
function _relaxRow(sh, rowNum, width) {
  try {
    var rng = sh.getRange(rowNum, 1, 1, width);
    var rules = rng.getDataValidations(), changed = false;
    for (var c = 0; c < rules[0].length; c++) {
      var rule = rules[0][c];
      if (rule && rule.getAllowInvalid && rule.getAllowInvalid() === false) {
        rules[0][c] = rule.copy().setAllowInvalid(true).build();
        changed = true;
      }
    }
    if (changed) rng.setDataValidations(rules);
  } catch (e) { /* best-effort */ }
}

// ─────────────────────────── Sheet → App ───────────────────────────
// تعديل عمود «الحالة» بتاب الشحنات → يُرسل للتطبيق (sheet-to-app).
function onUaeSheetEdit(e) {
  try {
    var sh = e.range.getSheet();
    if (sh.getName() !== ACTIVE_TAB) return;
    var layout = _layout(sh);
    if (!layout) return;
    var co = layout.colOf;
    var row = e.range.getRow(), col = e.range.getColumn() - 1;
    if (row <= layout.headerRow || col !== co.status_ar) return;
    var vals = sh.getRange(row, 1, 1, layout.width).getValues()[0];
    var oid = String(vals[co.order_id] || '').trim();
    var name = String(vals[co.customer_name] || '').trim();
    if (!oid || !name) return; // صف محجوز فاضي

    var items = [];
    for (var i = 0; i < layout.itemCols.length; i++) {
      var ic = layout.itemCols[i], nm = String(vals[ic] || '').trim();
      if (nm) items.push({ name: nm, qty: Number(vals[ic + 1]) || 1 });
    }
    var payload = {
      token: TOKEN, action: 'update', market: 'uae', currency: 'AED',
      order_id: oid, status: String(vals[co.status_ar] || ''),
      // لإنشاء الطلب بالتطبيق إن لم يكن موجوداً (طلب أُضيف يدوياً بالجدول)
      customer_name: name, phone_1: String(vals[co.phone_1] || ''), phone_2: String(vals[co.phone_2] || ''),
      city: String(vals[co.city] || ''), district: String(vals[co.district] || ''),
      address: String(vals[co.address] || ''), amount: Number(vals[co.amount]) || 0,
      handler_name: String(vals[co.handler_name] || ''), payment_method: String(vals[co.payment_method] || ''),
      pickup_type: String(vals[co.pickup_type] || ''), notes: String(vals[co.notes] || ''), items: items,
    };
    var d = vals[co.order_date];
    if (d instanceof Date) payload.order_date = d.toISOString();
    UrlFetchApp.fetch(SHEET_TO_APP_URL, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true,
    });
  } catch (err) { }
}

// ─────────────────────────── Setup helpers ───────────────────────────
function createUaeTriggers() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onUaeSheetEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onUaeSheetEdit').forSpreadsheet(ss).onEdit().create();
  return 'ok';
}

function relaxUaeValidation() {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ACTIVE_TAB);
  var rng = sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns());
  var rules = rng.getDataValidations(), changed = 0;
  for (var r = 0; r < rules.length; r++) for (var c = 0; c < rules[r].length; c++) {
    var rule = rules[r][c];
    if (rule && rule.getAllowInvalid() === false) { rules[r][c] = rule.copy().setAllowInvalid(true).build(); changed++; }
  }
  if (changed) rng.setDataValidations(rules);
  Logger.log('relaxed ' + changed + ' cells');
  return changed;
}

function _json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
