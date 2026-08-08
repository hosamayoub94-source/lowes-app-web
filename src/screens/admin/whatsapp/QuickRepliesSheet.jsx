// =============================================================
// QuickRepliesSheet — قائمة الردود الجاهزة تُدخَل بصندوق الكتابة.
// Sheet من تحت بالموبايل / modal بالنص بالديسكتوب.
// =============================================================
import { BottomSheet } from '@components/ui';

export function QuickRepliesSheet({ open, onClose, replies, onPick }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="ردود جاهزة">
      <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
        {replies.map((q, i) => (
          <button
            key={i}
            onClick={() => onPick(q.text)}
            className="text-xs text-start text-text hover:bg-teal/10 rounded-lg px-2.5 py-2"
          >
            <span className="font-bold">{q.label}:</span> {q.text.slice(0, 50)}…
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

export default QuickRepliesSheet;
