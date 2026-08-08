// =============================================================
// NewChatBar — زر "+ محادثة جديدة" + صف إدخال رقم الهاتف. عرض بحت.
// =============================================================
import { Button } from '@components/ui';

export function NewChatBar({ open, onToggle, phone, onPhoneChange, onStart }) {
  return (
    <>
      <Button variant="secondary" size="sm" onClick={onToggle}>＋ محادثة جديدة</Button>
      {open && (
        <div className="flex gap-2 bg-surface border border-border/60 rounded-xl p-2 mt-2">
          <input
            className="flex-1 border border-border rounded-lg px-2 py-1.5 text-sm bg-surface text-text"
            placeholder="رقم بكود الدولة (مثال: 905551234567)"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onStart(); }}
            dir="ltr"
          />
          <Button variant="teal" size="sm" onClick={onStart}>بدء</Button>
        </div>
      )}
    </>
  );
}

export default NewChatBar;
