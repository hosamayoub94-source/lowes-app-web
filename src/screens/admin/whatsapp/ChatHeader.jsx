// =============================================================
// ChatHeader — هيدر المحادثة المفتوحة: رجوع (موبايل) + هوية
// العميل + أزرار إعادة إسناد/بحث/تحويل/حذف. عرض بحت.
// =============================================================
import { Avatar, Button } from '@components/ui';

export function ChatHeader({
  phone, name, isManager, ownerName, msgSearchOpen, isDeleting,
  onBack, onToggleReassign, onToggleSearch, onToggleTransfer, onDelete,
}) {
  // رابط فتح نفس الرقم مباشرة بتطبيق واتساب الحقيقي على جهاز الموظف —
  // "بدي لمن العميل يصير عميل حقيقي أقدر آخذه على واتسي مباشر" (طلب مالك
  // 8 أغسطس 2026): تسهيل الانتقال من محادثة إدارية هون لمتابعة شخصية مباشرة
  // بواتساب العادي، بلا كتابة الرقم يدوياً.
  const waDirectLink = `https://wa.me/${String(phone || '').replace(/[^\d]/g, '')}`;
  return (
    <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/40 shrink-0 gap-2 flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        {/* زر رجوع دائري بأيقونة سهم (بدل النص "‹ رجوع" السابق) — أوضح
            كهدف لمس عالموبايل ومتناسق مع باقي أزرار الهيدر الدائرية. */}
        <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden shrink-0" title="رجوع لقائمة المحادثات">
          →
        </Button>
        <div className="flex items-center gap-2 min-w-0">
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
        <Button as="a" href={waDirectLink} target="_blank" rel="noreferrer" variant="ghost" size="sm" title="فتح نفس الرقم بتطبيق واتساب مباشر">
          📲 واتساب مباشر
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
