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

    var row = existingRow || (HEADER_ROW + 1 + existingVals.length); // تحديث أو إضافة
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
      if (m) itemCols.push({ n: parseInt(m[1], 10), col: c2 + 1 });
    }
    itemCols.sort(function (a, b) { return a.n - b.n; });
    var items = Array.isArray(o.items) ? o.items : [];
    for (var k = 0; k < items.length && k < itemCols.length; k++) {
      var ic = itemCols[k].col;
      rowVals[ic - 1]     = items[k].name || '';   // الاسم
      if (ic < lastCol) rowVals[ic]     = items[k].qty || '';  // الكمية بالعمود التالي
    }

    if (existingRow) {
      // تحديث — اكتب فقط الأعمدة التي يملكها التطبيق (احفظ التعديلات اليدوية)
      var APP_OWNED_SY = [col('name'), col('number'), col('wanumber','wa'), col('city'), col('address'),
                          col('status'), cOrderId, col('salesperson'), col('note'),
                          col('shippingmethod','shipping'), col('payment')];
      var colCurrency = [_colToNum(COL_SYP), _colToNum(COL_USD), _colToNum(COL_TRY)];
      APP_OWNED_SY.concat(colCurrency).forEach(function(c) {
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
      return _json({ ok: true, action: 'updated', row: existingRow });
    } else {
      sh.getRange(row, 1, 1, lastCol).setValues([rowVals]);
      return _json({ ok: true, action: 'appended', row: row });
    }

  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function doGet() { return _json({ ok: true, service: 'lowes-sales-sync', ts: new Date() }); }

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
