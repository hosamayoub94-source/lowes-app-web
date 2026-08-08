// =============================================================
// ReassignSheet — اختيار موظف/ة جديدة كمسؤولة عن المحادثة. Sheet
// من تحت بالموبايل / modal بالنص بالديسكتوب (مجاناً من BottomSheet).
// =============================================================
import { BottomSheet, Spinner } from '@components/ui';

export function ReassignSheet({ open, onClose, employees, currentOwnerId, reassigning, onPick }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="تحويل المحادثة لموظف/ة تانية">
      <div className="flex flex-wrap gap-1.5">
        {employees.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted py-4"><Spinner size="sm" /> جارٍ تحميل الموظفين…</div>
        ) : employees.map((emp) => (
          <button
            key={emp.id}
            onClick={() => onPick(emp)}
            disabled={reassigning}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition disabled:opacity-40 ${
              currentOwnerId === emp.id ? 'border-teal bg-teal text-navy' : 'border-border/60 text-text hover:bg-teal/10'
            }`}
          >
            {emp.employee_name}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

export default ReassignSheet;
