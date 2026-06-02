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
var SHEET_NAME   = 'LOWES Sales';
var SECRET_TOKEN = 'LOWES-SYRIA-2026';  // كلمة سر مشتركة مع الـ Edge Function
// مواقع احتياطية لأعمدة العملات إذا فشل الاكتشاف التلقائي (£ سوري · $ دولار · ₺ تركي)
var FALLBACK_SYP = 'G', FALLBACK_USD = 'H', FALLBACK_TRY = 'I';

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if (body.token !== SECRET_TOKEN) return _json({ ok: false, error: 'unauthorized' });
    var o = body.order || {};

    var ss = SpreadsheetApp.getActiveSpreadsheet();
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

    // 🔎 اكتشاف أعمدة العملات تلقائياً من بيانات الطلبات (£/$/₺)
    var COL_SYP = FALLBACK_SYP, COL_USD = FALLBACK_USD, COL_TRY = FALLBACK_TRY;
    var nData = Math.max(0, sh.getLastRow() - HEADER_ROW);
    if (nData > 0) {
      var sample = sh.getRange(HEADER_ROW + 1, 1, Math.min(30, nData), lastCol).getValues();
      var found = {};
      for (var dc = 0; dc < lastCol; dc++) {
        for (var dr = 0; dr < sample.length; dr++) {
          var v = String(sample[dr][dc]);
          if (!found.syp && v.indexOf('£') >= 0) { found.syp = _numToCol(dc + 1); }
          if (!found.usd && v.indexOf('$') >= 0) { found.usd = _numToCol(dc + 1); }
          if (!found.try && v.indexOf('₺') >= 0) { found.try = _numToCol(dc + 1); }
        }
      }
      if (found.syp) COL_SYP = found.syp;
      if (found.usd) COL_USD = found.usd;
      if (found.try) COL_TRY = found.try;
    }

    // خريطة العناوين → فهرس العمود (1-based)
    var idx = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).replace(/[^؀-ۿa-zA-Z]/g, '').trim().toLowerCase();
      if (h) idx[h] = c + 1;
    }
    function col(/*...names*/) {
      for (var i = 0; i < arguments.length; i++) {
        var key = String(arguments[i]).replace(/[^؀-ۿa-zA-Z]/g, '').trim().toLowerCase();
        if (idx[key]) return idx[key];
      }
      return 0;
    }

    var cOrderId = col('orderid', 'orderİd');
    if (!cOrderId) return _json({ ok: false, error: 'no_order_id_column' });

    // منع التكرار حسب Order ID
    var existing = sh.getRange(HEADER_ROW + 1, cOrderId, Math.max(1, sh.getLastRow() - HEADER_ROW), 1).getValues();
    for (var r = 0; r < existing.length; r++) {
      if (String(existing[r][0]).trim() === String(o.orderId).trim() && o.orderId) {
        return _json({ ok: true, duplicate: true, row: HEADER_ROW + 1 + r });
      }
    }

    var row = HEADER_ROW + 1 + existing.length;            // أول صف فارغ بعد البيانات
    var rowVals = new Array(lastCol).fill('');

    function set(c, v) { if (c && v !== undefined && v !== null) rowVals[c - 1] = v; }
    function setLetter(letter, v) { if (v) rowVals[_colToNum(letter) - 1] = v; }

    // الأعمدة المعنونة
    set(col('name'),          o.customerName || '');
    set(col('number'),        o.phone || '');
    set(col('wanumber', 'wa'),o.wa || '');
    set(col('city'),          o.city || '');
    set(col('address'),       o.address || '');
    set(col('status'),        o.status || '');
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

    sh.getRange(row, 1, 1, lastCol).setValues([rowVals]);
    return _json({ ok: true, row: row });

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
