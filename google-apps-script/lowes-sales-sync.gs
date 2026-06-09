/**
 * ============================================================
 * LOWES Sales — Order Sync (Google Apps Script Web App)
 * يستقبل طلباً من تطبيق لويز ويضيف صفاً في ورقة "LOWES Sales".
 *
 * 0-error design:
 *  - يطابق الأعمدة المعنونة بأسمائها من صف العناوين الحيّ (مش الترتيب).
 *  - أعمدة العملات (£ سوري / $ دولار / ₺ تركي) بمواقع ثابتة (قابلة للضبط).
 *  - يتحقق من Order ID قبل الإضافة → لا تكرار عند إعادة الإرسال.
 *  - يرجّع JSON {ok,row} أو {ok:false,error}.
 *
 * النشر:
 *  Extensions → Apps Script → الصق هذا الكود → احفظ →
 *  Deploy → New deployment → Type: Web app →
 *  Execute as: Me · Who has access: Anyone →
 *  Deploy → انسخ "Web app URL" وأرسله للمطوّر.
 * ============================================================
 */

// ⚙️ إعدادات — عدّلها مرة واحدة إن لزم
var SHEET_ID     = '1YIEv5EwLq3wz1KlObquLVtd0ep9sk4ZHq9dueEO-vcw'; // جدول LOWES SY
var SHEET_NAME   = 'LOWES Sales';
var SECRET_TOKEN = 'LOWES-SYRIA-2026';  // كلمة سر مشتركة مع الـ Edge Function
// مواقع احتياطية لأعمدة العملات إذا فشل الاكتشاف التلقائي (£ سوري · $ دولار · ₺ تركي)
var FALLBACK_SYP = 'G', FALLBACK_USD = 'H', FALLBACK_TRY = 'I';

// أسماء الحالات بالعربي — جدول سوريا (مختصرة ومناسبة للسياق السوري)
var STATUS_AR_SY = {
  pending:       'وارد جديد 🆕',
  preparing:     'تعبئة وتجهيز 📦',
  ready:         'جاهز للشحن 🚀',
  motor:         'مع الموتور 🏍️',
  at_center:     'في المركز 🏢',
  shipped:       'تم الشحن 🚚',
  on_way:        'في الطريق 🛵',
  delivered:     'تم التسليم ✅',
  waiting:       'بالانتظار ⏳',
  not_received:  'لم يتم الاستلام 📭',
  returning:     'راجع للمخزن ↩️',
  returned:      'مرتجع 🔁',
  settled:       'تمت التسوية 🤝',
  cancelled:     'ملغي ❌',
};

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if (body.token !== SECRET_TOKEN) return _json({ ok: false, error: 'unauthorized' });
    var o = body.order || {};

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) return _json({ ok: false, error: 'sheet_not_found' });

    var lastCol = sh.getLastColumn();

    // 🔎 اكتشاف صف العناوين تلقائياً (الصف اللي فيه "Order ID")
    var HEADER_ROW = 0;
    var scan = sh.getRange(1, 1, Math.min(20, sh.getLastRow()), lastCol).getValues();
    for (var sr = 0; sr < scan.length && !HEADER_ROW; sr++) {
      for (var sc = 0; sc < scan[sr].length; sc++) {
        if (String(scan[sr][sc]).replace(/[^a-zA-Z]/g, '').toLowerCase() === 'orderid') { HEADER_ROW = sr + 1; break; }
      }
    }
    if (!HEADER_ROW) HEADER_ROW = 4; // احتياطي
    var headers = sh.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];

    // currency columns (verified from the sheet): SYP / USD / TRY
    var COL_SYP = FALLBACK_SYP, COL_USD = FALLBACK_USD, COL_TRY = FALLBACK_TRY;

    // خريطة العناوين → فهرس العمود (1-based)
    var idx = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).replace(/[^a-zA-Z]/g, '').trim().toLowerCase();
      if (h) idx[h] = c + 1;
    }
    function col(/*...names*/) {
      for (var i = 0; i < arguments.length; i++) {
        var key = String(arguments[i]).replace(/[^a-zA-Z]/g, '').trim().toLowerCase();
        if (idx[key]) return idx[key];
      }
      return 0;
    }

    var cOrderId = col('orderid', 'orderİd');
    if (!cOrderId) return _json({ ok: false, error: 'no_order_id_column' });

    // upsert حسب Order ID (تحديث إذا موجود، إضافة إذا جديد)
    var existingVals = sh.getRange(HEADER_ROW + 1, cOrderId, Math.max(1, sh.getLastRow() - HEADER_ROW), 1).getValues();
    var existingRow = 0;
    for (var r = 0; r < existingVals.length; r++) {
      if (String(existingVals[r][0]).trim() === String(o.orderId).trim() && o.orderId) {
        existingRow = HEADER_ROW + 1 + r;
        break;
      }
    }

    // الإضافة الذكية: بعد آخر صف فيه Order ID فعلاً — يتجاهل الصفوف الفارغة/الصيغ
    // تحت آخر طلب (وإلا ينزل الطلب بسطر بعيد). متوافق مع منطق جدول تركيا.
    var lastDataIdx = -1;
    for (var li = existingVals.length - 1; li >= 0; li--) {
      if (String(existingVals[li][0]).trim() !== '') { lastDataIdx = li; break; }
    }
    var row = existingRow || (HEADER_ROW + 1 + lastDataIdx + 1); // تحديث أو إضافة بعد آخر طلب حقيقي
    var rowVals = new Array(lastCol).fill('');

    function set(c, v) { if (c && v !== undefined && v !== null) rowVals[c - 1] = v; }
    function setLetter(letter, v) { if (v) rowVals[_colToNum(letter) - 1] = v; }

    // الأعمدة المعنونة
    set(col('name'),          o.customerName || '');
    set(col('number'),        o.phone || '');
    set(col('wanumber', 'wa'),o.wa || '');
    set(col('city'),          o.city || '');
    set(col('address'),       o.address || '');
    set(col('status'),        STATUS_AR_SY[o.status] || o.status || '');
    set(cOrderId,             o.orderId || '');
    set(col('salesperson'),   o.salesperson || '');
    set(col('note'),          o.note || '');
    set(col('shippingmethod', 'shipping'), o.shippingMethod || '');
    set(col('payment'),       o.payment || '');
    // الوقت (العمود الأول عادة)
    if (!rowVals[0]) rowVals[0] = o.timestamp || new Date();

    // المبلغ حسب العملة (£ سوري / $ دولار / ₺ تركي)
    var amt = Number(o.amount || 0);
    if (amt) {
      if (o.currency === 'USD')      setLetter(COL_USD, amt);
      else if (o.currency === 'TRY') setLetter(COL_TRY, amt);
      else                            setLetter(COL_SYP, amt); // SYP افتراضي
    }

    // المنتجات → أعمدة Item N (الاسم) + العمود التالي (الكمية)
    var itemCols = [];
    for (var c2 = 0; c2 < headers.length; c2++) {
      var hv = String(headers[c2]);
      var m = hv.match(/item\s*(\d+)/i);
      if (m) itemCols.push({ n: parseInt(m[1], 10), col: c2 + 1 });          // "Item N" إنجليزي
      else if (/الصنف|صنف/.test(hv)) itemCols.push({ n: 1000 + c2, col: c2 + 1 }); // "الصنف ..." عربي (ترتيب الظهور)
    }
    itemCols.sort(function (a, b) { return a.n - b.n; });
    var items = Array.isArray(o.items) ? o.items : [];
    var itemsWritten = 0; // كم منتج انكتب فعلاً (لكشف «✓ متزامن» الكاذب)
    for (var k = 0; k < items.length && k < itemCols.length; k++) {
      var ic = itemCols[k].col;
      rowVals[ic - 1]     = items[k].name || '';   // الاسم
      if (ic < lastCol) rowVals[ic]     = items[k].qty || '';  // الكمية بالعمود التالي
      if (String(items[k].name || '').trim()) itemsWritten++;
    }

    // 💳 الدفع الجزئي → العمود K (المتبقّي للتحصيل) + العمود O (ملاحظة: دفع العميل X)
    var COL_REMAINING = 'K', COL_PAYNOTE = 'O';
    var paidAmt   = Number(o.paidAmount || 0);
    var remaining = Number(o.remaining || 0);
    var isPartial = o.paymentStatus === 'partial' || paidAmt > 0;
    if (isPartial) {
      rowVals[_colToNum(COL_REMAINING) - 1] = remaining;                 // K = المتبقّي (قد يكون 0)
      // O = ملاحظة الدفع، مدموجة مع ملاحظة العميل إن وُجدت (لا تُدهَس).
      var custNote = String(o.note || '').trim();
      var payNote  = 'دفع العميل ' + paidAmt;
      rowVals[_colToNum(COL_PAYNOTE) - 1] = custNote ? (custNote + ' · ' + payNote) : payNote;
    }

    if (existingRow) {
      // تحديث — اكتب فقط الأعمدة التي يملكها التطبيق (احفظ التعديلات اليدوية)
      var APP_OWNED_SY = [col('name'), col('number'), col('wanumber','wa'), col('city'), col('address'),
                          col('status'), cOrderId, col('salesperson'), col('note'),
                          col('shippingmethod','shipping'), col('payment')];
      var colCurrency = [_colToNum(COL_SYP), _colToNum(COL_USD), _colToNum(COL_TRY)];
      // أعمدة الدفع الجزئي (K المتبقّي + O ملاحظة الدفع) تُكتب فقط عند وجود دفع جزئي
      var colPartial = isPartial ? [_colToNum(COL_REMAINING), _colToNum(COL_PAYNOTE)] : [];
      APP_OWNED_SY.concat(colCurrency).concat(colPartial).forEach(function(c) {
        if (c > 0) sh.getRange(existingRow, c).setValue(rowVals[c - 1]);
      });
      // أعمدة المنتجات
      itemCols.forEach(function(ic) {
        var k = itemCols.indexOf(ic);
        if (k < items.length) {
          sh.getRange(existingRow, ic.col).setValue(items[k].name || '');
          if (ic.col < lastCol) sh.getRange(existingRow, ic.col + 1).setValue(items[k].qty || '');
        }
      });
      return _json({ ok: true, action: 'updated', row: existingRow, itemsSent: items.length, itemsWritten: itemsWritten });
    } else {
      sh.getRange(row, 1, 1, lastCol).setValues([rowVals]);
      return _json({ ok: true, action: 'appended', row: row, itemsSent: items.length, itemsWritten: itemsWritten });
    }

  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function doGet() { return _json({ ok: true, service: 'lowes-sales-sync', ts: new Date() }); }

// ============================================================
// المزامنة العكسية: جدول سوريا → التطبيق (متل تركيا)
// عند تعديل عمود الحالة أو رقم التتبع يدوياً، يُرسل للـ Edge Function sheet-to-app.
// ملاحظة: يحتاج installable trigger (On edit) لأنه يستخدم UrlFetchApp.
// تعديلات Apps Script البرمجية (sync-back) لا تُشغّل هذا الـ trigger → لا حلقة.
// ============================================================
var APP_SHEET_TO_APP_URL = 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/sheet-to-app';
// مفتاح anon العام — مطلوب كـ auth header من بوابة Supabase (حتى مع no-verify-jwt).
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3OTQsImV4cCI6MjA5MTc2Nzc5NH0.e9DiuJySh4WMp7x5ErVV5LqBFawHUESrlGDRb8N5zPM';

function onSheetEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (sh.getName() !== SHEET_NAME) return;

    var lastCol = sh.getLastColumn();
    // اكتشاف صف العناوين (نفس منطق doPost)
    var HEADER_ROW = 0;
    var scan = sh.getRange(1, 1, Math.min(20, sh.getLastRow()), lastCol).getValues();
    for (var sr = 0; sr < scan.length && !HEADER_ROW; sr++) {
      for (var sc = 0; sc < scan[sr].length; sc++) {
        if (String(scan[sr][sc]).replace(/[^a-zA-Z]/g, '').toLowerCase() === 'orderid') { HEADER_ROW = sr + 1; break; }
      }
    }
    if (!HEADER_ROW) HEADER_ROW = 4;

    var row = e.range.getRow();
    if (row <= HEADER_ROW) return; // تعديل على صف العناوين أو فوقه

    var headers = sh.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
    var idx = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).replace(/[^a-zA-Z]/g, '').trim().toLowerCase();
      if (h) idx[h] = c + 1;
    }
    function col() {
      for (var i = 0; i < arguments.length; i++) {
        var k = String(arguments[i]).replace(/[^a-zA-Z]/g, '').trim().toLowerCase();
        if (idx[k]) return idx[k];
      }
      return 0;
    }

    var cOrderId = col('orderid', 'orderİd');
    var cStatus  = col('status');
    var cTrack   = col('trackingnumber', 'tracking', 'trackno', 'track');
    var editedCol = e.range.getColumn();

    // نتفاعل فقط مع تعديل الحالة أو رقم التتبع
    if (editedCol !== cStatus && editedCol !== cTrack) return;
    if (!cOrderId) return;

    var orderId = String(sh.getRange(row, cOrderId).getValue()).trim();
    if (!orderId) return;

    var payload = { token: SECRET_TOKEN, action: 'update', order_id: orderId };
    if (cStatus) payload.status = String(sh.getRange(row, cStatus).getValue()).trim();
    if (cTrack)  payload.tracking_number = String(sh.getRange(row, cTrack).getValue()).trim();

    UrlFetchApp.fetch(APP_SHEET_TO_APP_URL, {
      method: 'post', contentType: 'application/json',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
      payload: JSON.stringify(payload), muteHttpExceptions: true,
    });
  } catch (err) { /* best-effort — لا توقف الجدول */ }
}

// تشغيل مرة واحدة لإنشاء installable trigger (سكربت مستقل openById — لا يظهر
// خيار «من جدول البيانات» بالواجهة، فننشئه برمجياً). شُغّل وفُوّض حيّاً 8 يونيو 2026.
function createEditTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){ if (t.getHandlerFunction()==='onSheetEdit') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(SHEET_ID).onEdit().create();
  return 'trigger created';
}

// ============================================================
// 🔁 ترحيل لمرة واحدة: توحيد أسماء المنتجات العربية الشاذّة → الإنجليزي القياسي
// السبب: لوحة الجرد (صف 4) والأرشيف يطابقان أسماء المنتجات الإنجليزية في صف 1
// عبر SUMPRODUCT — فأي اسم عربي في أعمدة Item يُحتسب صفراً (يكسر الجرد).
// شغّلها مرّة من محرّر Apps Script (Run → migrateItemsToEnglish).
// آمنة وقابلة للإعادة (idempotent): الأسماء الإنجليزية لا تطابق المفاتيح العربية فتُترك.
// تعمل على أعمدة "Item N" فقط — لا تلمس بقية الأعمدة.
// ============================================================
var AR_TO_EN_PRODUCTS = {
  'تونر تنقية البشرة و تضييق المسام': 'PORE TIHGTENNING & PURIFINE TONER',
  'تونر حليب الارز': 'Rice Milk Toner',
  'جل شد الجسم و السيليوليت': 'FIRMING GEL',
  'جيل مقشر الوجه': 'Facial peeling gel',
  'ديرما رول 0.5mm': 'Derma rolle 0.5 mm',
  'ديرما رول 1mm': 'Derma rolle 1mm',
  'رول مساج الوجه': 'ROLLER & GUA SHA',
  'ريتينال شوت': 'Retinal Shot',
  'زيت الروزماري': 'Rosemary Oil',
  'سيروم الارز': 'Rice Serum',
  'سيروم الترطيب المكثف': 'Intensive Hydration Serum',
  'سيروم الريتينول': 'RETINOL SERUM',
  'سيروم العناية بالثدي': 'BREAST CARE SERUM',
  'سيروم الكولاجين': 'Collagen Serum',
  'سيروم اللحية': 'BEARD SERUM',
  'سيروم الهالات و انتفاخ العين': 'UNDER EYE SERUM',
  'سيروم فيتامين سي': 'VITAMIN C SERUM',
  'سيروم مصحح البقع الداكنة': 'Dark Spot Corrector Serum',
  'سيروم مضاد لحب الشباب': 'ANTI ACNE SERUM',
  'شامبو الروزماري': 'ROSEMARY SHAMPOO',
  'غسول البشرة الدهنية والحساسة': 'Cleanser for oily and sensitive skin',
  'غسول البشرة العادية و الجافة': 'Cleanser for normal and dry skin',
  'كريم الارز': 'RICE MILK SPOT CREAM',
  'كريم الترطيب المكثف': 'MOISTURIZING CREAM',
  'كريم العناية بالثدي': 'BREAST CARE CREAM',
  'كريم العناية بالقدمين': 'FOOT CARE CREAM',
  'كريم تفتيح البشرة': 'WHITENING CREAM',
  'ماء الروزماري للشعر و البشرة': 'ROSEMARY WATER',
  'ماسك الكولاجين المائي': 'COLLAGEN HYDRO BOMB MASK',
  'مشط السيليكون': 'SHOWER COMB',
  'واقي الشمس المضاد للبقع': 'ANTI BLEMISH SUNSCREEN',
  'واقي الشمس الوردي بالكالامين': 'Sunscreen Pink Up Tone'
};

function _normKey(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' '); }

function migrateItemsToEnglish() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('sheet_not_found');

  var lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();

  // اكتشاف صف العناوين (نفس منطق doPost)
  var HEADER_ROW = 0;
  var scan = sh.getRange(1, 1, Math.min(20, lastRow), lastCol).getValues();
  for (var sr = 0; sr < scan.length && !HEADER_ROW; sr++) {
    for (var sc = 0; sc < scan[sr].length; sc++) {
      if (String(scan[sr][sc]).replace(/[^a-zA-Z]/g, '').toLowerCase() === 'orderid') { HEADER_ROW = sr + 1; break; }
    }
  }
  if (!HEADER_ROW) HEADER_ROW = 4;

  // أعمدة Item N
  var headers = sh.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
  var itemCols = [];
  for (var c = 0; c < headers.length; c++) {
    var hv = String(headers[c]);
    if (/item\s*\d+/i.test(hv) || /الصنف|صنف/.test(hv)) itemCols.push(c + 1); // عربي أو إنجليزي
  }
  if (!itemCols.length) return 'no_item_columns';

  var firstDataRow = HEADER_ROW + 1;
  var nRows = lastRow - HEADER_ROW;
  if (nRows <= 0) return 'no_data';

  var changed = 0;
  for (var ci = 0; ci < itemCols.length; ci++) {
    var col = itemCols[ci];
    var rng = sh.getRange(firstDataRow, col, nRows, 1);
    var vals = rng.getValues();
    var dirty = false;
    for (var r = 0; r < vals.length; r++) {
      var en = AR_TO_EN_PRODUCTS[_normKey(vals[r][0])];
      if (en && en !== vals[r][0]) { vals[r][0] = en; dirty = true; changed++; }
    }
    if (dirty) rng.setValues(vals);
  }
  return 'migrated ' + changed + ' cells';
}

function _colToNum(letter) {
  var n = 0; letter = String(letter).toUpperCase();
  for (var i = 0; i < letter.length; i++) n = n * 26 + (letter.charCodeAt(i) - 64);
  return n;
}
function _numToCol(num) {
  var s = ''; while (num > 0) { var m = (num - 1) % 26; s = String.fromCharCode(65 + m) + s; num = Math.floor((num - 1) / 26); }
  return s;
}
function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
