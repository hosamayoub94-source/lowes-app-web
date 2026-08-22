// اختبار منطق شركاء الدوام: الورديات + السماحية + العطلة الأسبوعية
// نسخة مستقلة من الدوال الصافية بـsrc/services/shiftPartnersService.js
// (الملف الأصلي يستورد supabase عبر alias فلا يعمل مباشرة بـnode).
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/services/shiftPartnersService.js', import.meta.url), 'utf8');
// احذف سطر استيراد supabase ثم قيّم الوحدة
const stripped = src.replace(/^import \{ supabase \}.*$/m, '');
const mod = await import('data:text/javascript;base64,' + Buffer.from(stripped, 'utf8').toString('base64'));

const { SHIFT_PLANS, resolveShift, computeDelayMinutes, isWeeklyOffDay, shiftPlanForSize } = mod;

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${label} → ${JSON.stringify(actual)}${ok ? '' : `  (متوقّع ${JSON.stringify(expected)})`}`);
};

const P2 = shiftPlanForSize(2);
const P3 = shiftPlanForSize(3);

console.log('\n── مجموعة من شخصين: 10:00–16:00 · استراحة · 17:00–23:00 ──');
check('09:55 → صباحي',           resolveShift(P2, '09:55').key, 'morning');
check('10:00 → صباحي',           resolveShift(P2, '10:00').key, 'morning');
check('13:00 → صباحي',           resolveShift(P2, '13:00').key, 'morning');
check('16:30 (استراحة) → مسائي', resolveShift(P2, '16:30').key, 'evening');
check('17:00 → مسائي',           resolveShift(P2, '17:00').key, 'evening');
check('21:00 → مسائي',           resolveShift(P2, '21:00').key, 'evening');

console.log('\n── مجموعة من ثلاثة: 10:00–15:00 · 15:00–20:00 · 20:00–01:00 ──');
check('10:05 → صباحي',              resolveShift(P3, '10:05').key, 'morning');
check('14:50 → ظهر (وصول مبكر)',    resolveShift(P3, '14:50').key, 'noon');
check('15:00 → ظهر',                resolveShift(P3, '15:00').key, 'noon');
check('17:30 → ظهر',                resolveShift(P3, '17:30').key, 'noon');
check('19:45 → مسائي (وصول مبكر)',  resolveShift(P3, '19:45').key, 'evening');
check('20:00 → مسائي',              resolveShift(P3, '20:00').key, 'evening');
check('23:30 → مسائي',              resolveShift(P3, '23:30').key, 'evening');
check('00:30 (بعد منتصف الليل) → مسائي', resolveShift(P3, '00:30').key, 'evening');

console.log('\n── سماحية 10 دقائق: بوّابة لا خصم (قرار حسام 22 آب) ──');
check('وردية 10:00 · دخول 10:00',        computeDelayMinutes('10:00', '10:00'), 0);
check('وردية 10:00 · دخول 10:10 (آخر السماحية)', computeDelayMinutes('10:10', '10:00'), 0);
check('وردية 10:00 · دخول 10:11 → 11 د لا 1', computeDelayMinutes('10:11', '10:00'), 11);
check('وردية 10:00 · دخول 10:15 → 15 د لا 5',  computeDelayMinutes('10:15', '10:00'), 15);
check('وردية 10:00 · دخول 10:45 → 45 د',       computeDelayMinutes('10:45', '10:00'), 45);
check('وردية 10:00 · دخول 09:50 (مبكر)',       computeDelayMinutes('09:50', '10:00'), 0);
check('وردية 15:00 · دخول 15:10',              computeDelayMinutes('15:10', '15:00'), 0);
check('وردية 17:00 · دخول 17:10',              computeDelayMinutes('17:10', '17:00'), 0);
check('وردية 17:00 · دخول 17:25 → 25 د',       computeDelayMinutes('17:25', '17:00'), 25);
check('وردية 20:00 · دخول 20:10',              computeDelayMinutes('20:10', '20:00'), 0);
check('وردية 20:00 · دخول 20:40 → 40 د',       computeDelayMinutes('20:40', '20:00'), 40);
check('وردية 20:00 · دخول 00:15 (بعد منتصف الليل) → 255 د', computeDelayMinutes('00:15', '20:00'), 255);

console.log('\n── الوردية المسائية للثلاثة تعبر منتصف الليل ──');
const ev = P3.shifts.find(s => s.key === 'evening');
check('نهايتها 01:00 لا 00:00', ev.end, '01:00');
check('بلا استراحة', P3.breakWindow, null);
check('استراحة الشخصين 16:00–17:00', P2.breakWindow, { start: '16:00', end: '17:00' });

console.log('\n── العطلة الأسبوعية المثبّتة ──');
// 2026-08-21 = جمعة ، 2026-08-22 = سبت ، 2026-08-23 = أحد
check('الجمعة لموظف عطلته الجمعة',   isWeeklyOffDay('الجمعة', '2026-08-21'), true);
check('السبت لموظف عطلته الجمعة',    isWeeklyOffDay('الجمعة', '2026-08-22'), false);
check('السبت لموظف عطلته السبت',     isWeeklyOffDay('السبت',  '2026-08-22'), true);
check('الأحد لموظف عطلته الأحد',     isWeeklyOffDay('الأحد',  '2026-08-23'), true);
check('يقبل صيغة YYYY/MM/DD',        isWeeklyOffDay('السبت',  '2026/08/22'), true);

// قرار حسام (22 آب 2026): لا يوم عطلة افتراضي — لا الجمعة ولا غيرها
console.log('\n── بلا يوم عطلة محدَّد → لا عطلة أسبوعية إطلاقاً (نظام مرن) ──');
check('الجمعة',  isWeeklyOffDay(null, '2026-08-21'), false);
check('السبت',   isWeeklyOffDay(null, '2026-08-22'), false);
check('الأحد',   isWeeklyOffDay('',   '2026-08-23'), false);
check('قيمة غير معروفة', isWeeklyOffDay('يوم غلط', '2026-08-21'), false);

console.log('\n── مجموعات غير مدعومة → لا تغيير على النظام الحالي ──');
check('مجموعة من 1', shiftPlanForSize(1), null);
check('مجموعة من 4', shiftPlanForSize(4), null);
check('resolveShift بلا خطة', resolveShift(null, '10:00'), null);

console.log(`\n${fail === 0 ? '🎉' : '⚠️'}  نجح ${pass} · فشل ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
