// ============================================================
// تتبّع يورتيتشي تلقائي عبر صفحة التتبّع العامة (بلا cargoKey / بلا API account).
// يحلّ شحنات الرفع بـExcel: رقم التتبّع بعمود «رقم التتبع» يكفي.
//
// الاكتشاف (11 يونيو 2026): صفحة yurticikargo.com/tr/online-servisler/gonderi-sorgula
// تستدعي API عاماً بلا مصادقة:
//   GET https://www.yurticikargo.com/service/shipmentstracking?id=<رقم التتبّع>&language=tr
// يرجّع JSON فيه: ShipmentStatus (نص تركي: "TESLİM EDİLDİ"/"TAŞIMA DURUMUNDA"...)
//   + IsDelivered (bool) + Receiver + DeliveryDate/DeliveryCityName/Sender...
// يعمل بأي رقم تتبّع عام (116083…/KP064…) — مستقل عن مشكلة الـcargoKey (التي تمنع
// تتبّع شحنات الـExcel عبر SOAP queryShipment — راجع [[yurtici-integration]]).
//
// المنطق: لكل صف غير نهائي برقم تتبّع بتابي LOWES_TR/STRONG_TR → استعلم →
// حوّل الحالة لعربي → اكتب عمود «الحالة» (I) + ادفع لـsheet-to-app (يحدّث DB +
// يعيد المزامنة للجدول + يسجّل الخط الزمني + يُشعر البائع).
//
// ⚠️ هذا مرجع للمشروع الحيّ — المشروع الفعلي: Dashboard (project id
// "1ub2zm_Ne4NzbJmylw_IgB7Mu8ac_EIUBnVGHbCV-n2jhxbymcEmrkX1O"، حساب
// hosam101hosam10@gmail.com). مؤقّت زمني **كل 10 دقائق** على pollYurticiStatuses
// (أُنشئ عبر واجهة Triggers، لا عبر setupYurticiPublicTrigger). الـ10 دقائق آمنة
// للكوتا (UrlFetch ~20k/يوم) وكافية (حالة الشحن تتغير بضع مرات/يوم).
// حدّ زمني داخلي 290 ثانية يمنع تجاوز حدّ Apps Script (6 دقائق) فيُكمل المرّة التالية.
//
// ⚠️ 25 أيلول 2026 (بلاغ حسام): هالملف بالمشروع الحيّ كان **مختلفاً فعلياً عن
// نسخة الريبو** — يحمل تحسيناً غير موجود بالريبو (حارس YK_APP: يجلب حالة
// الطلب بالتطبيق نفسه قبل الاستعلام عن يورتيتشي، ويتخطّى أي طلب صار حالته
// راجع/ملغي/متسوّى بالتطبيق فعلاً — يمنع «الترفرف» لو الفريق أكّد الحالة
// يدوياً بالتطبيق قبل ما يتحدّث نص يورتيتشي). أُبقي عليه هون واستُبدلت نسخة
// الريبو القديمة به ليصير المصدرين متطابقين نهائياً (كانا انحرفا عن بعض).
// ============================================================
var YK_PUBLIC = 'https://www.yurticikargo.com/service/shipmentstracking';
var YK_SHEET_TO_APP = 'https://fghdumrgimoeqsafdhhh.supabase.co/functions/v1/sheet-to-app';
var YK_APP_ORDERS = 'https://fghdumrgimoeqsafdhhh.supabase.co/rest/v1/orders?select=order_id,status&market=eq.turkey&archived=not.eq.true&deleted_at=is.null&limit=3000';
var YK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTE3OTQsImV4cCI6MjA5MTc2Nzc5NH0.e9DiuJySh4WMp7x5ErVV5LqBFawHUESrlGDRb8N5zPM';
var YK_TOKEN = 'LOWES-TURKEY-2026';
var YK_TABS = ['LOWES_TR', 'STRONG_TR'];

// اسم المُرسِل الثابت الذي يستخدمه حسابنا بيورتيتشي لكل شحنات تركيا (مقنَّع من
// الـAPI العام بنفس الصيغة الحرفية دوماً — تحقّق حيّ 25 أيلول 2026 على 141
// شحنة حقيقية). لو ظهر هالاسم بحقل Receiver فالطرد رجع فعلياً إلينا، لا أنه
// وصل الزبون — نفس منطق YURTICI_OUR_SENDER_MASKED بـtrack-yurtici/index.ts.
var YK_OUR_SENDER_MASKED = 'YO** ŞA**';

function yk_mapStatus(st, delivered, receiver) {
  var t = String(st || '').toLocaleLowerCase('tr');
  var isDeliveredFlag = delivered === true || delivered === 'true' || t.indexOf('teslim edildi') >= 0;
  // الطرد رجع فعلياً إلينا (Receiver بهالحركة = حسابنا) — لا نحسبها تسليماً
  // للزبون. مُثبَت حيّاً 25 أيلول 2026 على 68 طلب حقيقي كانوا مسجَّلين غلط.
  if (isDeliveredFlag && String(receiver || '').trim().indexOf(YK_OUR_SENDER_MASKED) === 0) return 'تم الاسترجاع 🔁';
  // الإرجاع/الفشل/الإلغاء لهما الأولوية على «teslim edildi»: نص رجوع شحنة يذكر
  // غالباً «iade». كان الترتيب القديم يفحص teslim edildi أولاً فيقلب أي رجوع
  // فيه ذكر تسليم (مثلاً للفرع) خطأً «تم التسليم» — إصلاح 25 أيلول 2026 (نفس
  // ترتيب mapStatus/mapPublic بـtrack-yurtici/index.ts، أصلها D-047 23 آب 2026).
  if (t.indexOf('teslim edilemedi') >= 0 || t.indexOf('bulunamad') >= 0 || t.indexOf('adreste yok') >= 0) return 'لم يتم الاستلام 📭';
  if (t.indexOf('iade') >= 0) return 'راجع للمركز ↩️';
  if (t.indexOf('iptal') >= 0) return 'ملغي ❌';
  // «Şubeye Teslim Edildi» (تسليم للفرع) قد يكون محطة وسيطة أثناء رجوع الطرد —
  // لا نعتبرها تسليماً نهائياً لو ما أكّد حقل Receiver ذلك أعلاه.
  if (t.indexOf('şube') >= 0 && t.indexOf('teslim edildi') >= 0) return 'في المركز 🏢';
  if (isDeliveredFlag) return 'تم التسليم ✅';
  if (t.indexOf('dağıt') >= 0 || t.indexOf('dagit') >= 0) return 'قيد التوصيل 🛵';
  if (t.indexOf('şube') >= 0 || t.indexOf('sube') >= 0 || t.indexOf('aktarma') >= 0 || t.indexOf('transfer') >= 0 || t.indexOf('merkez') >= 0) return 'في المركز 🏢';
  if (t.indexOf('taşı') >= 0 || t.indexOf('tasi') >= 0 || t.indexOf('yola') >= 0 || t.indexOf('çık') >= 0 || t.indexOf('cik') >= 0 || t.indexOf('kabul') >= 0) return 'في النقل 🚚';
  return null; // NOP / işlem görmemiş / غير معروف → لا تغيّر
}

// «راجع للمركز» محطة وسيطة تتابعها Yurtiçi (قد تتحوّل لاحقاً لتسليم فعلي أو
// لرجوع مادي فعلي لمخزننا) — ليست نهائية. «تم الاسترجاع» تعني استلمنا الطرد
// فعلياً بمخزننا وهذه هي النهائية (سُمِّيت «راجع» سابقاً — إعادة تسمية 25
// أيلول 2026 بطلب حسام لتفادي الالتباس مع «راجع للمركز»). ⚠️ الفحص القديم
// هون كان يطابق /راجع/ بلا استثناء «للمركز» فيوقف متابعة «راجع للمركز» للأبد
// (نفس عطل D-047 بالريبو 23 آب 2026 — لم يكن مُصلَحاً هون. إصلاح 25 أيلول 2026).
function yk_isTerminal(s) {
  var str = String(s || '');
  if (/تم الاسترجاع|مرتجع/.test(str)) return true;
  return /تم التسليم|ملغ|تسوية/.test(str);
}

function pollYurticiStatuses() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var checked = 0, updated = 0, errors = 0, __start = Date.now();
  // Fetch the app's current statuses so yurtici DEFERS to team-set returns/cancels.
  // (The sheet-cell guard isn't enough: sheet-to-app updates the APP status, not the
  // sheet cell, so an order can be 'returning' in the app while the cell still reads a
  // shipping status — yurtici would then re-assert 'delivered' and cause a flicker.)
  var YK_APP = {};
  // ⚠️ 3 تشرين الأول 2026: بدون الهيدر Accept-Profile: public يطلب PostgREST الـschema الافتراضي
  // للمشروع وهو graphql_public (تحقّق: curl بلا الهيدر → 404 «Could not find the table
  // 'graphql_public.orders'»، ومعه → 200 + 349 طلب). الرد كان كائن خطأ لا مصفوفة فيرمي
  // .forEach وكان الـcatch الفاضي يبلعه → YK_APP فاضية → هذا الحارس (سطر returning/not_received…
  // أدناه) ما اشتغل أبداً. الآن: الهيدر + تسجيل أي فشل بدل إخفائه.
  try {
    var __r = UrlFetchApp.fetch(YK_APP_ORDERS, { headers: { apikey: YK_ANON, Authorization: 'Bearer ' + YK_ANON, 'Accept-Profile': 'public' }, muteHttpExceptions: true });
    var __rows = JSON.parse(__r.getContentText());
    if (!Array.isArray(__rows)) throw new Error('guard fetch http=' + __r.getResponseCode() + ' ' + String(__r.getContentText()).slice(0, 120));
    __rows.forEach(function (o) { if (o.order_id) YK_APP[String(o.order_id).trim()] = o.status; });
  } catch (e) { Logger.log('pollYurtici GUARD DISABLED: ' + e); }
  YK_TABS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 2) return;
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    function col(label) { for (var c = 0; c < headers.length; c++) { if (String(headers[c]).trim() === label) return c + 1; } return 0; }
    var cStatus = col('الحالة'), cTrack = col('رقم التتبع'), cId = col('كود الطلب');
    if (!cStatus || !cTrack || !cId) return;
    var data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (var i = 0; i < data.length; i++) {
      var track = String(data[i][cTrack - 1] || '').trim();
      var orderId = String(data[i][cId - 1] || '').trim();
      var cur = String(data[i][cStatus - 1] || '').trim();
      if (Date.now() - __start > 290000) break; // حدّ زمني: قف قبل حدّ Apps Script (6د) وأكمِل المرّة التالية
      if (!track || !orderId || yk_isTerminal(cur)) continue;
      if (YK_APP[orderId] && /^(returning|returned|not_received|cancelled|settled)$/.test(YK_APP[orderId])) continue; // التطبيق علّمه مرتجع/ملغي من الفريق — لا تُعِده 'مُسلَّم'
      if (/^KP/i.test(track)) continue; // شحنات غير يورتيتشي (KP...) — لا يتعرّف عليها الـAPI، تخطَّ
      checked++;
      try {
        var resp = UrlFetchApp.fetch(YK_PUBLIC + '?id=' + encodeURIComponent(track) + '&language=tr', { muteHttpExceptions: true });
        if (resp.getResponseCode() !== 200) { errors++; continue; }
        var j = JSON.parse(resp.getContentText());
        var ar = yk_mapStatus(j.ShipmentStatus, j.IsDelivered, j.Receiver);
        if (!ar || ar === cur) continue;
        sh.getRange(i + 2, cStatus).setValue(ar);
        UrlFetchApp.fetch(YK_SHEET_TO_APP, {
          method: 'post', contentType: 'application/json',
          headers: { apikey: YK_ANON, Authorization: 'Bearer ' + YK_ANON },
          payload: JSON.stringify({ token: YK_TOKEN, action: 'update', order_id: orderId, status: ar, tracking_number: track }),
          muteHttpExceptions: true,
        });
        updated++;
        Utilities.sleep(120);
      } catch (e) { errors++; }
    }
  });
  Logger.log('pollYurtici: checked=' + checked + ' updated=' + updated + ' errors=' + errors);
  return 'checked=' + checked + ' updated=' + updated + ' errors=' + errors;
}

// تشغيل لمرة واحدة: ادفع كل أرقام التتبّع من الجدول للتطبيق (orders.tracking_number)
// — لازم لمسار «التحديث الفوري عند فتح الشاشة» (track-yurtici العام يقرأ tracking_number
// من DB). بعدها يبقى متزامناً عبر onSheetEdit + المؤقّت. شغّل: Run → backfillTrackingToApp
function backfillTrackingToApp() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pushed = 0, __start = Date.now();
  YK_TABS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 2) return;
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    function col(label) { for (var c = 0; c < headers.length; c++) { if (String(headers[c]).trim() === label) return c + 1; } return 0; }
    var cTrack = col('رقم التتبع'), cId = col('كود الطلب');
    if (!cTrack || !cId) return;
    var data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (var i = 0; i < data.length; i++) {
      if (Date.now() - __start > 290000) break;
      var track = String(data[i][cTrack - 1] || '').trim();
      var orderId = String(data[i][cId - 1] || '').trim();
      if (!track || !orderId) continue;
      UrlFetchApp.fetch(YK_SHEET_TO_APP, {
        method: 'post', contentType: 'application/json',
        headers: { apikey: YK_ANON, Authorization: 'Bearer ' + YK_ANON },
        payload: JSON.stringify({ token: YK_TOKEN, action: 'update', order_id: orderId, tracking_number: track }),
        muteHttpExceptions: true,
      });
      pushed++;
      Utilities.sleep(80);
    }
  });
  Logger.log('backfillTracking: pushed=' + pushed);
  return 'pushed=' + pushed;
}

// بديل برمجي لإنشاء المؤقّت (إن لم يُنشأ عبر واجهة Triggers). كل 10 دقائق.
function setupYurticiPublicTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'pollYurticiStatuses') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('pollYurticiStatuses').timeBased().everyMinutes(10).create();
  return 'trigger created: every 10 minutes';
}
