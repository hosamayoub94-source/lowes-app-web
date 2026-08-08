// =============================================================
// QuoteReplyBar — شريط "↩️ رد على…" فوق صندوق الكتابة. عرض بحت.
// =============================================================
export function QuoteReplyBar({ snippet, onCancel }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5 bg-border/10 border-r-4 border-teal rounded-lg px-2.5 py-1.5">
      <span className="text-[11px] text-muted truncate">↩️ رد على: {snippet}</span>
      <button onClick={onCancel} className="text-muted hover:text-red-500 shrink-0">✕</button>
    </div>
  );
}

export default QuoteReplyBar;
