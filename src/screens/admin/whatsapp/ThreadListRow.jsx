// =============================================================
// ThreadListRow — صف محادثة وحدة بالقائمة الجانبية. عرض بحت،
// بلا أي state أو استدعاء بيانات — كل شي جاي props.
// =============================================================
import { Avatar } from '@components/ui';

export function ThreadListRow({
  thread, isOpen, name, ownerName, isDeleting, onOpen, onDelete,
}) {
  return (
    <div
      onClick={onOpen}
      className={`group px-3 py-2 border-b border-border/40 cursor-pointer flex items-center gap-2.5 transition-colors ${isOpen ? 'bg-teal/10' : 'hover:bg-surface-alt'}`}
    >
      <Avatar name={name || thread.phone} size="sm" />
      {thread.direction === 'in' && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="بانتظار رد" />}
      <div className="flex-1 min-w-0">
        {name ? (
          <>
            <div className="font-bold text-sm text-text truncate">{name}</div>
            <div className="text-[10px] text-muted" dir="ltr">{thread.phone}</div>
          </>
        ) : (
          <div className="font-bold text-sm text-text" dir="ltr">{thread.phone}</div>
        )}
        <div className="text-xs text-muted truncate">
          {thread.direction === 'out' ? 'أنتم: ' : ''}
          {thread.preview}
        </div>
        {ownerName && (
          <div className="text-[10px] text-teal-700 truncate">👤 {ownerName}</div>
        )}
      </div>
      <button
        onClick={onDelete}
        disabled={isDeleting}
        title="حذف المحادثة"
        className="text-muted hover:text-red-500 opacity-60 hover:opacity-100 text-sm shrink-0 disabled:opacity-30"
      >
        {isDeleting ? '…' : '🗑️'}
      </button>
    </div>
  );
}

export default ThreadListRow;
