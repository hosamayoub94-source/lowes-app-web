// =============================================================
// Composer — صف الإدخال كامل (أزرار سريعة/صورة/ملف/صوت/إلغاء
// تسجيل/نص/إرسال). أزرار الإجراءات تصير شريط قابل للتمرير أفقياً
// على الشاشات الضيقة (<640px) بدل ما تكسر/تلتف — نفس نمط الشرائح
// الموجود أصلاً بشاشات تانية بالتطبيق. عرض بحت.
// =============================================================
import { Button } from '@components/ui';

export function Composer({
  draft, onDraftChange, onSend, sending, recording,
  onToggleQuick, onPickImage, onPickFile, onToggleRecording, onCancelRecording,
  imageInputRef, fileInputRef, onImageChosen, onFileChosen,
}) {
  return (
    <div className="flex gap-2 items-center">
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onImageChosen} />
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChosen} />

      {/* شريط أزرار الإجراءات — قابل للتمرير أفقياً على الموبايل عشان ما ينكسر
          مهما زاد عدد الأزرار (إلغاء تسجيل يظهر شرطياً). */}
      <div className="flex gap-2 overflow-x-auto sm:overflow-visible no-scrollbar shrink-0 max-w-[45%] sm:max-w-none">
        <Button variant="outline" size="icon" onClick={onToggleQuick} disabled={sending || recording} title="ردود جاهزة" className="shrink-0">
          ⚡
        </Button>
        <Button variant="outline" size="icon" onClick={onPickImage} disabled={sending || recording} title="إرسال صورة" className="shrink-0">
          📷
        </Button>
        <Button variant="outline" size="icon" onClick={onPickFile} disabled={sending || recording} title="إرسال ملف (PDF/Word/إلخ)" className="shrink-0">
          📎
        </Button>
        {recording && (
          <Button variant="danger" size="icon" onClick={onCancelRecording} disabled={sending} title="إلغاء التسجيل بلا إرسال" className="shrink-0 !bg-transparent !text-red-500 !border-red-500">
            🗑️
          </Button>
        )}
        <Button
          variant={recording ? 'danger' : 'outline'}
          size="icon"
          onClick={onToggleRecording}
          disabled={sending}
          title={recording ? 'إيقاف وإرسال التسجيل' : 'تسجيل رسالة صوتية'}
          className={`shrink-0 ${recording ? 'animate-pulse' : ''}`}
        >
          {recording ? '⏹️' : '🎙️'}
        </Button>
      </div>

      <input
        className="flex-1 min-w-0 border border-border rounded-lg px-3 py-2 text-sm bg-surface text-text"
        placeholder="اكتب رد…"
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            onSend();
          }
        }}
        disabled={sending || recording}
      />
      <Button variant="teal" size="md" onClick={onSend} disabled={recording || !draft.trim()} loading={sending} className="shrink-0">
        إرسال
      </Button>
    </div>
  );
}

export default Composer;
