// =============================================================
// swUpdate — تحديث تلقائي بلا "امسح الكاش".
//
// التسجيل الافتراضي لـvite-plugin-pwa (registerSW.js) يسجّل الـservice
// worker مرة وحدة بس عند التحميل — ما بيتحقق من تحديثات لاحقاً، وما
// بيعمل reload لما SW جديد ياخد السيطرة. الـPWA غالباً تضل مفتوحة
// بالموبايل لساعات، فالفريق ما كان يشوف أي نشر جديد إلا لو صفّى
// الكاش يدوياً. هالملف يسدّ الفجوتين:
//   1. controllerchange → SW جديد صار مسيطر (بعد skipWaiting/clientsClaim
//      بـsw.js) → reload تلقائي مرة وحدة.
//   2. فحص دوري (كل 5 دقائق) لتحديث جديد بدل الاعتماد على إعادة فتح
//      التطبيق فقط.
// =============================================================
export function bootServiceWorkerAutoUpdate() {
  if (!('serviceWorker' in navigator)) return;

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  navigator.serviceWorker.ready
    .then((reg) => {
      setInterval(() => reg.update().catch(() => {}), 5 * 60 * 1000);
    })
    .catch(() => {});
}
