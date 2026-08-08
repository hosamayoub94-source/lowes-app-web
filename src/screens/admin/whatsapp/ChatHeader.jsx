// =============================================================
// ChatHeader — هيدر المحادثة المفتوحة: رجوع (موبايل) + هوية
// العميل + أزرار إعادة إسناد/بحث/تحويل/حذف. عرض بحت.
// =============================================================
import { Avatar, Button } from '@components/ui';

export function ChatHeader({
  phone, name, isManager, ownerName, msgSearchOpen, isDeleting,
  onBack, onToggleReassign, onToggleSearch, onToggleTransfer, onDelete,
}) {
  return (
    <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/40 shrink-0 gap-2 flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={onBack} className="md:hidden text-xs font-bold text-teal-700 shrink-0">
          ‹ رجوع
        </button>
        <div className="hidden md:flex items-center gap-2 min-w-0">
          <Avatar name={name || phone} size="sm" />
          {name ? (
            <div className="min-w-0">
              <div className="font-bold text-sm text-text truncate">{name}</div>
              <div className="text-[10px] text-muted" dir="ltr">{phone}</div>
            </div>
          ) : (
            <div className="font-bold text-sm text-text" dir="ltr">{phone}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {isManager && (
          <Button variant="ghost" size="sm" onClick={onToggleReassign} title="تحويل هاي المحادثة لموظف/ة تانية">
            👤 {ownerName ? `عند ${ownerName} — تغيير` : 'بلا مسؤول — تعيين'}
          </Button>
        )}
        <Button variant={msgSearchOpen ? 'teal' : 'ghost'} size="icon" onClick={onToggleSearch} title="بحث داخل المحادثة">
          🔍
        </Button>
        <Button variant="ghost" size="sm" onClick={onToggleTransfer} title="نقل المحادثة لرقم آخر">
          🔀 نقل
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} disabled={isDeleting} title="حذف المحادثة">
          {isDeleting ? '…' : '🗑️ حذف'}
        </Button>
      </div>
    </div>
  );
}

export default ChatHeader;
