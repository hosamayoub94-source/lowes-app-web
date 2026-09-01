// =============================================================
// swUpdate — تحديث تلقائي بلا "امسح الكاش"، وبلا Reload مفاجئ.
//
// التسجيل الافتراضي لـvite-plugin-pwa (registerSW.js) يسجّل الـservice
// worker مرة وحدة بس عند التحميل — ما بيتحقق من تحديثات لاحقاً، وما
// بيعمل reload لما SW جديد ياخد السيطرة. الـPWA غالباً تضل مفتوحة
// بالموبايل لساعات، فالفريق ما كان يشوف أي نشر جديد إلا لو صفّى
// الكاش يدوياً. هالملف يسدّ الفجوتين:
//   1. فحص دوري (كل 30 دقيقة) لتحديث جديد بدل الاعتماد على إعادة فتح
//      التطبيق فقط.
//   2. controllerchange → SW جديد صار مسيطر (بعد skipWaiting/clientsClaim
//      بـsw.js) → ما نعمل reload فوري (كان يقطع شغل المستخدم منتصف
//      عملية). بدالها: نطلق حدث 'sw-update-ready' يسمح لواجهة صغيرة
//      (SWUpdateBanner) تعرض "يتوفر تحديث" بزر اختياري، والـreload
//      الفعلي بيصير فقط:
//        - المستخدم ضغط الزر (applyPendingSWUpdate)، أو
//        - المستخدم صار خامل (بلا أي تفاعل) لمدة IDLE_AUTO_APPLY_MS —
//          حتى ما تضل نسخة قديمة عالقة إذا حدا نسي التبويب مفتوح.
// =============================================================

const CHECK_INTERVAL_MS     = 30 * 60 * 1000; // فحص تحديث جديد كل 30 دقيقة
const IDLE_AUTO_APPLY_MS    = 5 * 60 * 1000;   // تحديث تلقائي بعد 5 دقائق خمول فقط
const IDLE_POLL_MS          = 15 * 1000;

let _pendingReload  = false;
let _idleCheckHandle = null;
let _lastActivity    = Date.now();
let _idleListenersArmed = false;

function _applyUpdate() {
  window.location.reload();
}

function _armIdleAutoApply() {
  if (_idleListenersArmed) return;
  _idleListenersArmed = true;

  const resetIdle = () => { _lastActivity = Date.now(); };
  ['mousedown', 'keydown', 'touchstart', 'scroll'].forEach((evt) =>
    window.addEventListener(evt, resetIdle, { passive: true })
  );

  _idleCheckHandle = setInterval(() => {
    if (!_pendingReload) return;
    if (Date.now() - _lastActivity >= IDLE_AUTO_APPLY_MS) {
      clearInterval(_idleCheckHandle);
      _applyUpdate();
    }
  }, IDLE_POLL_MS);
}

// يُستدعى من واجهة المستخدم (زر "تحديث الآن") لتطبيق التحديث فوراً.
export function applyPendingSWUpdate() {
  if (_pendingReload) _applyUpdate();
}

export function bootServiceWorkerAutoUpdate() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_pendingReload) return;
    _pendingReload = true;
    window.dispatchEvent(new CustomEvent('sw-update-ready'));
    _armIdleAutoApply();
  });

  navigator.serviceWorker.ready
    .then((reg) => {
      setInterval(() => reg.update().catch(() => {}), CHECK_INTERVAL_MS);
    })
    .catch(() => {});
}
