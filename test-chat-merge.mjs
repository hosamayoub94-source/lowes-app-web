// تست منطق دمج رسائل المحادثة — يثبت أن الدمج لا يمحو التاريخ المُرحّل
// شغّله: node test-chat-merge.mjs
import { mergeMessagesById, hasMessageChanges } from './src/utils/chatMessages.js';

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗ FAIL:', name); }
}

const t = (s) => `2026-06-${String(s).padStart(2, '0')}T10:00:00Z`;

// السيناريو الجذري: المستخدم رحّل تاريخاً قديماً (مايو) فوق آخر الرسائل،
// ثم رجع التبويب → الخادم يرجّع أحدث 200 فقط (يونيو). يجب ألا يختفي مايو.
const older = [
  { id: 1, content: 'مايو-1', created_at: '2026-05-01T10:00:00Z' },
  { id: 2, content: 'مايو-2', created_at: '2026-05-02T10:00:00Z' },
];
const loaded = [
  ...older,
  { id: 3, content: 'يونيو-3', created_at: t(3) },
  { id: 4, content: 'يونيو-4', created_at: t(4) },
];
const fresh = [
  { id: 3, content: 'يونيو-3', created_at: t(3) },
  { id: 4, content: 'يونيو-4', created_at: t(4) },
  { id: 5, content: 'يونيو-5 (جديدة)', created_at: t(5) },
];

const merged = mergeMessagesById(loaded, fresh);
check('لا تُمحى الرسائل الأقدم (مايو موجود)', merged.some(m => m.id === 1) && merged.some(m => m.id === 2));
check('الرسالة الجديدة (5) أُضيفت', merged.some(m => m.id === 5));
check('لا تكرار بالمعرّفات', new Set(merged.map(m => m.id)).size === merged.length);
check('الترتيب تصاعدي بـ created_at', eq(merged.map(m => m.id), [1, 2, 3, 4, 5]));

// تعديل: fresh تحمل محتوى مُعدّلاً → يجب أن يفوز
const edited = mergeMessagesById(loaded, [{ id: 3, content: 'مُعدّلة', created_at: t(3) }]);
check('نسخة fresh المُعدّلة تفوز', edited.find(m => m.id === 3).content === 'مُعدّلة');

// hasMessageChanges
check('hasMessageChanges: رسالة جديدة = true', hasMessageChanges(loaded, fresh) === true);
check('hasMessageChanges: نفس الشيء = false', hasMessageChanges(loaded, loaded) === false);
check('hasMessageChanges: تعديل محتوى = true',
  hasMessageChanges(loaded, [{ id: 3, content: 'مختلف', created_at: t(3) }]) === true);
check('hasMessageChanges: حذف = true',
  hasMessageChanges(loaded, [{ id: 3, content: 'يونيو-3', created_at: t(3), is_deleted: true }]) === true);

// نقاء: المدخلات لم تتغيّر
const snap = JSON.stringify(loaded);
mergeMessagesById(loaded, fresh);
check('الدالة نقيّة (لم تُعدّل المدخل)', JSON.stringify(loaded) === snap);

console.log(`\n${fail === 0 ? '✅' : '❌'} نجح ${pass} / فشل ${fail}`);
process.exit(fail === 0 ? 0 : 1);
