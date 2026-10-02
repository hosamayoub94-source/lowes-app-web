// =============================================================
// ThreadTabs — تبويبات قائمة المحادثات (محادثات / تتبّع الطلبات / حملات)
// + رقاقات حالة التتبّع. عرض بحت، بلا state أو استدعاء بيانات.
//
// 2 تشرين الأول 2026 — بلاغ مالك: القائمة كانت قسماً واحداً طويلاً يخلط
// المحادثات (ردود العملاء) مع الحملات (~880 محادثة) ثم التتبّع الآلي بآخرها،
// فرسائل التتبّع المُرسَلة كانت "مدفونة" وما تنشاف. كل قسم صار تبويباً مستقلاً
// بعدّاد، وتبويب المحادثات يعرض شارة حمراء بعدد ما ينتظر رداً.
// =============================================================

export function ThreadTabs({ tabs, active, onChange }) {
  return (
    <div role="tablist" className="p-1.5 border-b border-border/40 shrink-0 grid grid-cols-3 gap-1 bg-surface-alt/40">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            className={`relative rounded-lg px-1 py-1.5 text-center leading-tight transition border ${isActive ? 'bg-navy text-white border-navy shadow-sm' : 'bg-surface text-muted border-border/50 hover:border-navy/40'}`}
          >
            <div className="text-[11px] font-bold truncate">{t.icon} {t.label}</div>
            <div className={`text-[10px] tabular-nums ${isActive ? 'text-white/80' : 'text-muted'}`}>{t.count}</div>
            {t.badge > 0 && (
              <span
                title="بانتظار رد"
                className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center"
              >
                {t.badge > 99 ? '99+' : t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// رقاقات تصفية رسائل التتبّع حسب نوع آخر إشعار (شحن/توصيل/تسليم/…) — بتظهر
// فقط الأنواع الموجودة فعلاً (عدّاد > 0) كي ما تزدحم الشاشة.
const TRACKING_STATUS_META = [
  { key: 'received',     icon: '🧾', label: 'استلام الطلب' },
  { key: 'shipped',      icon: '🚚', label: 'تم الشحن' },
  { key: 'at_center',    icon: '🏢', label: 'بالمركز' },
  { key: 'on_way',       icon: '🛵', label: 'بالطريق' },
  { key: 'delivered',    icon: '✅', label: 'تم التسليم' },
  { key: 'unboxing',     icon: '🎥', label: 'فيديو الفتح' },
  { key: 'not_received', icon: '📭', label: 'لم يُستلم' },
  { key: 'returning',    icon: '↩️', label: 'راجع' },
  { key: 'cancelled',    icon: '❌', label: 'ملغي' },
];

export function TrackingStatusChips({ counts, active, onChange, total }) {
  const present = TRACKING_STATUS_META.filter((m) => (counts[m.key] || 0) > 0);
  if (present.length === 0) return null;
  return (
    <div className="px-2 py-1.5 border-b border-border/40 shrink-0 flex flex-wrap gap-1">
      <button
        onClick={() => onChange(null)}
        className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 border ${!active ? 'border-navy bg-navy text-white' : 'border-border/60 text-muted'}`}
      >
        الكل {total}
      </button>
      {present.map((m) => (
        <button
          key={m.key}
          onClick={() => onChange(active === m.key ? null : m.key)}
          className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 border ${active === m.key ? 'border-navy bg-navy text-white' : 'border-border/60 text-muted hover:border-navy/40'}`}
        >
          {m.icon} {m.label} {counts[m.key]}
        </button>
      ))}
    </div>
  );
}

export default ThreadTabs;
