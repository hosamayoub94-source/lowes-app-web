// =============================================================
// DateDivider — فاصل "اليوم"/"أمس"/تاريخ بين رسائل أيام مختلفة.
// =============================================================
export function DateDivider({ label }) {
  return (
    <div className="self-center text-[10px] font-bold text-muted bg-border/30 rounded-full px-3 py-0.5 my-1">
      {label}
    </div>
  );
}

export default DateDivider;
