// =============================================================
// ThreadListRow — صف محادثة وحدة بالقائمة الجانبية. عرض بحت،
// بلا أي state أو استدعاء بيانات — كل شي جاي props.
// =============================================================
import { Avatar } from '@components/ui';
import { StatusTicks } from './MessageBubble';

// تاريخ مختصر بجانب الساعة — "اليوم"/"أمس"/يوم-شهر لأي أقدم. طلب مالك
// 12 أغسطس 2026: الساعة وحدها ما بتكفي لمعرفة أي يوم كانت المحادثة، خصوصاً
// بقائمة تخلط محادثات من أيام مختلفة (نفس فكرة dayLabel بالمحادثة المفتوحة).
function dateLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'اليوم';
  if (sameDay(d, yesterday)) return 'أمس';
  return d.toLocaleDateString('ar', { day: 'numeric', month: 'short' });
}

export function ThreadListRow({
  thread, isOpen, name, ownerName, isDeleting, isSeen, onOpen, onDelete,
}) {
  const time = thread.created_at
    ? new Date(thread.created_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })
    : '';
  const date = thread.created_at ? dateLabel(thread.created_at) : '';
  return (
    <div
      onClick={onOpen}
      className={`group px-3 py-2 border-b border-border/40 cursor-pointer flex items-center gap-2.5 transition-colors ${isOpen ? 'bg-teal/10' : 'hover:bg-surface-alt'}`}
    >
      <Avatar name={name || thread.phone} size="sm" />
      {thread.direction === 'in' && (
        isSeen
          ? <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="انفتحت — تمت رؤيتها" />
          : <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="بانتظار رد" />
      )}
      <div className="flex-1 min-w-0">
        {name ? (
          <>
            <div className="font-bold text-sm text-text truncate">{name}</div>
            <div className="text-[10px] text-muted" dir="ltr">{thread.phone}</div>
          </>
        ) : (
          <div className="font-bold text-sm text-text" dir="ltr">{thread.phone}</div>
        )}
        <div className="text-xs text-muted truncate flex items-center gap-1">
          {thread.direction === 'out' ? 'أنتم: ' : ''}
          {thread.preview}
          {thread.direction === 'out' && <StatusTicks status={thread.status} />}
        </div>
        {ownerName && (
          <div className="text-[10px] text-teal-700 truncate">👤 {ownerName}</div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[10px] text-muted">{date}</span>
        <span className="text-[10px] text-muted">{time}</span>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          title="حذف المحادثة"
          className="text-muted hover:text-red-500 opacity-60 hover:opacity-100 text-sm disabled:opacity-30"
        >
          {isDeleting ? '…' : '🗑️'}
        </button>
      </div>
    </div>
  );
}

export default ThreadListRow;
