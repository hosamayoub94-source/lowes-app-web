// =============================================================
// TaskAttachments — upload, list, and remove task file attachments.
// Uploads to Supabase Storage bucket "task-attachments".
// Stores metadata in tasks.attachments (JSONB array).
// =============================================================

import { useRef, useState, useCallback } from 'react';
import { cn } from '@utils/classNames';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
  'image/', 'video/', 'application/pdf',
  'application/zip', 'application/x-rar-compressed', 'application/x-zip-compressed',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml',
  'text/',
];

// ── File type helpers ─────────────────────────────────────────
function getFileMeta(filename, mimeType = '') {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg','jpeg','png','gif','webp','svg','avif'].includes(ext)) return { icon: '🖼️', label: 'صورة', color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' };
  if (['mp4','mov','avi','mkv','webm'].includes(ext)) return { icon: '🎬', label: 'فيديو', color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/30' };
  if (['pdf'].includes(ext)) return { icon: '📄', label: 'PDF', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950/30' };
  if (['zip','rar','7z','tar','gz'].includes(ext)) return { icon: '📦', label: 'ضغط', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30' };
  if (['doc','docx'].includes(ext)) return { icon: '📝', label: 'Word', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' };
  if (['xls','xlsx','csv'].includes(ext)) return { icon: '📊', label: 'Excel', color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-950/30' };
  if (['ppt','pptx'].includes(ext)) return { icon: '📽️', label: 'PPT', color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/30' };
  return { icon: '📎', label: 'ملف', color: 'text-muted', bg: 'bg-surface-alt' };
}

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── Single attachment row ────────────────────────────────────
function AttachmentRow({ att, onRemove, removing }) {
  const meta = getFileMeta(att.name || '', att.mime || '');
  return (
    <div className={cn(
      'flex items-center gap-3 p-2.5 rounded-xl border border-border',
      'bg-surface hover:border-teal/30 transition-colors group',
    )}>
      {/* Icon / preview */}
      <div className={cn('w-10 h-10 rounded-lg grid place-items-center text-xl shrink-0', meta.bg)}>
        {att.url && ['jpg','jpeg','png','gif','webp','avif'].includes(att.name?.split('.').pop()?.toLowerCase()) ? (
          <img src={att.url} alt={att.name} className="w-full h-full object-cover rounded-lg" onError={(e) => { e.target.style.display = 'none'; }} />
        ) : (
          <span>{meta.icon}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-text truncate">{att.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn('text-[10px] font-medium', meta.color)}>{meta.label}</span>
          {att.size && <span className="text-[10px] text-muted">{typeof att.size === 'number' ? formatSize(att.size) : att.size}</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {att.url && (
          <a
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            download={att.name}
            className="w-7 h-7 rounded-lg hover:bg-teal/10 grid place-items-center text-muted hover:text-teal transition-colors"
            title="تنزيل"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </a>
        )}
        <button
          type="button"
          onClick={() => onRemove(att.id)}
          disabled={removing === att.id}
          className="w-7 h-7 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 grid place-items-center text-muted hover:text-red-500 transition-colors disabled:opacity-40"
          title="حذف"
        >
          {removing === att.id ? (
            <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" opacity="0.25"/><path d="M21 12a9 9 0 0 1-9 9" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Drop zone ─────────────────────────────────────────────────
function DropZone({ onFiles, uploading }) {
  const [hover, setHover] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setHover(false);
    const files = [...e.dataTransfer.files];
    if (files.length) onFiles(files);
  };

  const handleFileInput = (e) => {
    const files = [...e.target.files];
    if (files.length) onFiles(files);
    e.target.value = '';
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={handleDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={cn(
        'flex flex-col items-center gap-2 py-5 px-4 rounded-xl border-2 border-dashed cursor-pointer',
        'transition-all duration-150 select-none',
        hover ? 'border-teal bg-teal/5 scale-[1.01]' : 'border-border hover:border-teal/40 hover:bg-surface-alt/50',
        uploading && 'opacity-50 cursor-wait',
      )}
    >
      <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFileInput} />
      {uploading ? (
        <>
          <svg className="animate-spin text-teal" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" opacity="0.25"/><path d="M21 12a9 9 0 0 1-9 9" />
          </svg>
          <span className="text-xs text-muted">جارٍ الرفع...</span>
        </>
      ) : (
        <>
          <div className={cn('w-10 h-10 rounded-xl grid place-items-center text-xl transition-colors', hover ? 'bg-teal/10' : 'bg-surface-alt')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden className={hover ? 'text-teal' : 'text-muted'}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-text">اسحب وأفلت الملفات هنا</p>
            <p className="text-[10px] text-muted mt-0.5">أو انقر للاختيار · حتى 10 ميجابايت لكل ملف</p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────
export function TaskAttachments({ attachments = [], onUpload, onRemove, taskId }) {
  const [uploading, setUploading]   = useState(false);
  const [removing, setRemoving]     = useState(null); // attachment id being removed
  const [uploadError, setUploadError] = useState(null);

  const handleFiles = useCallback(async (files) => {
    setUploadError(null);

    // Validate
    const valid = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        setUploadError(`"${file.name}" أكبر من 10 ميجابايت`);
        continue;
      }
      const allowed = ALLOWED_TYPES.some(t => file.type.startsWith(t));
      if (!allowed && file.type) {
        setUploadError(`نوع الملف "${file.type}" غير مدعوم`);
        continue;
      }
      valid.push(file);
    }

    if (!valid.length) return;
    setUploading(true);
    try {
      for (const file of valid) {
        await onUpload?.(taskId, file);
      }
    } catch (err) {
      setUploadError(err?.message || 'فشل رفع الملف');
    } finally {
      setUploading(false);
    }
  }, [onUpload, taskId]);

  const handleRemove = useCallback(async (attachmentId) => {
    setRemoving(attachmentId);
    try {
      await onRemove?.(taskId, attachmentId);
    } catch { /* store shows error */ }
    finally { setRemoving(null); }
  }, [onRemove, taskId]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <span className="text-teal" aria-hidden>📎</span>
        <h3 className="text-sm font-bold text-text">المرفقات</h3>
        {attachments.length > 0 && (
          <span className="text-xs font-bold text-muted bg-surface-alt px-2 py-0.5 rounded-full ms-auto">
            {attachments.length}
          </span>
        )}
      </div>

      {/* Error banner */}
      {uploadError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-bg border border-red/30 text-red-fg text-xs">
          <span>⚠️</span>
          <span className="flex-1">{uploadError}</span>
          <button type="button" onClick={() => setUploadError(null)} className="hover:underline">✕</button>
        </div>
      )}

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((att) => (
            <AttachmentRow
              key={att.id || att.path || att.name}
              att={att}
              onRemove={handleRemove}
              removing={removing}
            />
          ))}
        </div>
      )}

      {/* Drop zone */}
      {onUpload && (
        <DropZone onFiles={handleFiles} uploading={uploading} />
      )}

      {!onUpload && attachments.length === 0 && (
        <p className="text-xs text-muted text-center py-4">لا توجد مرفقات</p>
      )}
    </div>
  );
}

export default TaskAttachments;
