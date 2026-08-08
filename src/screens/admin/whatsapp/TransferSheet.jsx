// =============================================================
// TransferSheet — نقل كامل تاريخ المحادثة لرقم آخر. Sheet من تحت
// بالموبايل / modal بالنص بالديسكتوب.
// =============================================================
import { BottomSheet, Button } from '@components/ui';

export function TransferSheet({ open, onClose, phone, onPhoneChange, onConfirm }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="نقل المحادثة لرقم آخر">
      <div className="flex gap-2">
        <input
          autoFocus
          className="flex-1 border border-border rounded-lg px-2 py-1.5 text-sm bg-surface text-text"
          placeholder="الرقم الجديد (بكود الدولة)"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); }}
          dir="ltr"
        />
        <Button variant="teal" size="md" onClick={onConfirm}>نقل</Button>
      </div>
    </BottomSheet>
  );
}

export default TransferSheet;
