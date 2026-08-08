// =============================================================
// ThreadListSection — عنوان قسم لاصق (💬/📢/📦) + صفوفه. يوحّد
// الأقسام الثلاثة المكررة سابقاً بنفس الشاشة. عرض بحت.
// =============================================================
import { ThreadListRow } from './ThreadListRow';

export function ThreadListSection({
  label, threads, openPhone, nameByPhone, ownerByPhone, isManager, deletingPhone, onOpen, onDelete,
}) {
  if (!threads.length) return null;
  return (
    <>
      <div className="px-3 py-1.5 text-[11px] font-bold text-muted bg-border/20 sticky top-0">{label}</div>
      {threads.map((t) => (
        <ThreadListRow
          key={t.phone}
          thread={t}
          isOpen={t.phone === openPhone}
          name={nameByPhone[t.phone]}
          ownerName={isManager ? ownerByPhone[t.phone]?.owner_name : null}
          isDeleting={deletingPhone === t.phone}
          onOpen={() => onOpen(t.phone)}
          onDelete={(e) => onDelete(t.phone, e)}
        />
      ))}
    </>
  );
}

export default ThreadListSection;
