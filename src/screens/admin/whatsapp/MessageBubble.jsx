// =============================================================
// MessageBubble — فقاعة رسالة وحدة (نص/وسائط/تذييل/تكات القراءة/
// أزرار hover) + أنيميشن دخول للرسالة الجديدة فقط. عرض بحت —
// النص يوصل جاهز مُنسَّق (formatWaBody) من الأب، بلا استيراد خدمات هون.
// =============================================================

// علامات ✓/✓✓ زرقاء بصرية بدل نص الحالة الخام — "متل الواتساب".
// بس للرسائل الصادرة. منقولة هون من الشاشة الأم — مستخدَمة هون حصراً.
export function StatusTicks({ status }) {
  if (!status) return null;
  if (status === 'read') return <span title="قُرئت" className="text-blue-400">✓✓</span>;
  if (status === 'delivered') return <span title="وصلت" className="opacity-70">✓✓</span>;
  if (status === 'sent' || status === 'queued') return <span title={status === 'queued' ? 'قيد الإرسال' : 'أُرسلت'} className="opacity-70">✓</span>;
  if (status === 'failed' || status === 'undelivered') return <span title={status} className="text-red-400">⚠️</span>;
  return <span title={status} className="opacity-70">{status}</span>;
}

export function MessageBubble({ message: m, text, isNew, onReply, onForward, onDelete, isDeleting }) {
  return (
    <div
      className={`group max-w-[80%] rounded-xl px-3 py-2.5 text-sm whitespace-pre-wrap ${isNew ? 'animate-fadeIn' : ''} ${
        m.direction === 'out' ? 'self-end bg-teal text-navy' : 'self-start bg-border/30 text-text'
      }`}
    >
      {m.media_url && (m.media_content_type || '').startsWith('audio/') && (
        <audio controls src={m.media_url} className="max-w-full mb-1" />
      )}
      {m.media_url && (m.media_content_type || '').startsWith('image/') && (
        <img src={m.media_url} alt="" className="max-w-full rounded-lg mb-1" />
      )}
      {m.media_url && !(m.media_content_type || '').startsWith('audio/') && !(m.media_content_type || '').startsWith('image/') && (
        <a href={m.media_url} target="_blank" rel="noreferrer" className="underline text-teal-700 block mb-1">📎 مرفق</a>
      )}
      {text}
      <div className="flex items-center gap-2 text-[10px] opacity-70 mt-1">
        <span className="flex items-center gap-1">
          {new Date(m.created_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
          {m.direction === 'out' && <StatusTicks status={m.status} />}
        </span>
        <button onClick={onReply} title="رد باقتباس" className="opacity-0 group-hover:opacity-100 hover:!opacity-100">↩️</button>
        <button onClick={onForward} title="تحويل الرسالة" className="opacity-0 group-hover:opacity-100 hover:!opacity-100">↪️</button>
        {m.direction === 'out' && (
          <button onClick={onDelete} disabled={isDeleting} title="حذف الرسالة" className="opacity-0 group-hover:opacity-100 hover:!opacity-100 disabled:opacity-30">
            {isDeleting ? '…' : '🗑️'}
          </button>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
