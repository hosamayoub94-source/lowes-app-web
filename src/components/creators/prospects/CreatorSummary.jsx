// ملخص أعلى الصفحة — يجيب فوراً: كم حساب؟ كم ينتظر مراجعة؟ كم جاهز؟ كم ناقص؟ كل رقم زر يفتح القائمة المقابلة.
// الأرقام دائماً على كل الحسابات الحيّة (لا على الصفحة المفلترة).
const TILES = [
  { key: 'all', count: 'total', ar: 'كل الحسابات', cls: 'text-gray-900' },
  { key: 'saved', count: 'saved', ar: 'المفضلين', cls: 'text-amber-600' },
  { key: 'review', count: 'to_review', ar: 'يحتاج مراجعة', cls: 'text-amber-700' },
  { key: 'ready', count: 'ready', ar: 'جاهز للتواصل', cls: 'text-emerald-700' },
  { key: 'ugc', count: 'ugc', ar: 'UGC', cls: 'text-gray-900' },
  { key: 'skincare', count: 'skincare', ar: 'Skincare', cls: 'text-gray-900' },
  { key: 'incomplete', count: 'incomplete', ar: 'بيانات ناقصة', cls: 'text-orange-700' },
  { key: 'rejected', count: 'rejected', ar: 'مستبعد', cls: 'text-red-700' },
];

export default function CreatorSummary({ summary, view, onView }) {
  return (
    <div className="grid grid-cols-4 lg:grid-cols-8 gap-1.5" role="group" aria-label="ملخص صناع المحتوى">
      {TILES.map((t) => {
        const n = summary ? summary[t.count] : null;
        const on = view === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onView(t.key)}
            aria-pressed={on}
            className={`rounded-xl border px-1.5 py-2 text-center transition ${on ? 'border-gray-900 bg-gray-900 text-white' : 'bg-white hover:bg-gray-50'}`}
          >
            <div className={`text-lg font-black leading-tight ${on ? 'text-white' : t.cls}`} dir="ltr">{n == null ? '…' : n}</div>
            <div className={`text-[10px] leading-tight ${on ? 'text-gray-200' : 'text-gray-500'}`}>{t.ar}</div>
          </button>
        );
      })}
    </div>
  );
}
