// =============================================================
// TrackingBanner — بانر رسائل تتبّع ذكية (يظهر بس لمحادثات التتبّع
// الآلي). كل زر بـ`items` يعبّي صندوق الرد، ما بيرسل مباشرة —
// الأب يبني القائمة ويمرّرها جاهزة. عرض بحت.
// =============================================================
export function TrackingBanner({ open, onToggle, orderId, items }) {
  return (
    <div className="mb-2 bg-teal/10 border border-teal/30 rounded-lg p-2">
      <button onClick={onToggle} className="w-full flex items-center justify-between text-xs font-bold text-teal-700">
        <span>🏷️ رسائل تتبّع ذكية {orderId ? `— طلبها الأخير #${orderId}` : ''}</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((it) => (
            <button
              key={it.key}
              onClick={it.onClick}
              className={it.primary
                ? 'text-[11px] font-bold px-2 py-1 rounded-lg bg-teal text-navy hover:opacity-90 transition'
                : 'text-[11px] font-bold px-2 py-1 rounded-lg border border-teal/40 text-teal-700 hover:bg-teal/10 transition'}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default TrackingBanner;
