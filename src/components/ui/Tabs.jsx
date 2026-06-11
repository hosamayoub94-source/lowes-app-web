// =============================================================
// Tabs — مكوّن تابات موحّد لكل الشاشات (ستايل ثابت احترافي).
//   <Tabs tabs={[{key,label,icon?,badge?}]} value={v} onChange={setV} />
// نشِط = تعبئة teal · غير نشِط = سطح + حدّ. RTL + يلتفّ تلقائياً.
// =============================================================

export function Tabs({ tabs = [], value, onChange, size = 'md', className = '' }) {
  const pad = size === 'sm' ? 'px-3 py-1.5 text-[11px]' : 'px-3.5 py-2 text-xs';
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`} role="tablist" dir="rtl">
      {tabs.map((t) => {
        const active = value === t.key;
        const badge = t.badge ?? t.count ?? null;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`shrink-0 ${pad} rounded-xl font-bold transition flex items-center gap-1.5 border ${
              active
                ? 'bg-teal text-navy border-teal shadow-sm'
                : 'bg-surface text-muted border-border hover:text-text hover:border-teal/40'
            }`}
          >
            {t.icon && <span>{t.icon}</span>}
            <span>{t.label}</span>
            {badge ? (
              <span className={`text-[9px] font-bold px-1.5 rounded-full ${active ? "bg-navy/15 text-navy" : "bg-navy text-white"}`}>
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
