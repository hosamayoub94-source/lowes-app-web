// تست منطق formatGuidesForPrompt (نسخة مطابقة لِما في ai-assistant/index.ts)
function formatGuidesForPrompt(guides) {
  if (!guides || !guides.length) return '(لا يوجد دليل مُحمّل حالياً.)';
  return guides.map((g) => {
    const steps = (g.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n');
    return `### ${g.icon || ''} ${g.title}\n${g.why ? g.why + '\n' : ''}${steps}`;
  }).join('\n\n');
}
let p = 0, f = 0;
const ok = (n, c) => { c ? (p++, console.log('  ✓', n)) : (f++, console.error('  ✗', n)); };
const out = formatGuidesForPrompt([
  { icon: '🇸🇾', title: 'طلبات سوريا', why: 'تنزل للجدول', steps: ['افتح الشاشة', 'احفظ'] },
  { icon: '💰', title: 'المحاسبة', steps: ['+ قيد'] },
]);
ok('فيه العنوان', out.includes('طلبات سوريا'));
ok('خطوات مرقّمة', out.includes('1. افتح الشاشة') && out.includes('2. احفظ'));
ok('لماذا يظهر', out.includes('تنزل للجدول'));
ok('دليل بلا why يعمل', out.includes('1. + قيد'));
ok('فارغ يرجّع رسالة بديلة', formatGuidesForPrompt([]) === '(لا يوجد دليل مُحمّل حالياً.)');
console.log(`\n${f === 0 ? '✅' : '❌'} pass ${p} / fail ${f}`);
process.exit(f === 0 ? 0 : 1);
