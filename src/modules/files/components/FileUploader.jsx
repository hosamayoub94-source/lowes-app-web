// =============================================================
// File Module — FileUploader
//
// Drag-and-drop + click-to-select file upload area.
// Validates size limits, shows visual drop-active state,
// and delegates to useFileStore.uploadFiles().
//
// Emits Event Bus events per file on success / failure.
// =============================================================
import React, { useRef, useState, useCallback } from 'react';
import { useUploadFiles }          from '../hooks/useFiles';
import {
  MAX_FILE_SIZE_BYTES,
  formatFileSize,
}                                   from '../types/files.types';
import {
  emitFileUploaded,
  emitFileUploadFailed,
}                                   from '../integrations/fileEventBus';

/**
 * @param {object}   props
 * @param {string}   props.userId
 * @param {string}   [props.folderId]
 * @param {Function} [props.onComplete]   Called with uploaded UploadJob[] on finish
 * @param {boolean}  [props.multiple]     Allow multiple files (default true)
 * @param {string}   [props.accept]       MIME filter e.g. "image/*"
 * @param {string}   [props.className]
 */
export default function FileUploader({
  userId,
  folderId,
  onComplete,
  multiple = true,
  accept,
  className = '',
}) {
  const uploadFiles = useUploadFiles();
  const inputRef    = useRef(null);

  const [dragging,  setDragging]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors,    setErrors]    = useState([]);

  // ── Validate files before uploading ──────────────────────
  function _validate(files) {
    const valid = [];
    const errs  = [];
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE_BYTES) {
        errs.push(`"${f.name}" أكبر من الحد المسموح (${formatFileSize(MAX_FILE_SIZE_BYTES)})`);
      } else {
        valid.push(f);
      }
    }
    return { valid, errs };
  }

  // ── Upload handler ────────────────────────────────────────
  const handleFiles = useCallback(async (rawFiles) => {
    if (!rawFiles || rawFiles.length === 0) return;
    const { valid, errs } = _validate(Array.from(rawFiles));
    setErrors(errs);
    if (valid.length === 0) return;

    setUploading(true);
    try {
      const jobs = await uploadFiles(valid, { userId, folderId });

      // Wait for all jobs to settle (done / error)
      const settled = await Promise.allSettled(
        jobs.map((job) =>
          new Promise((resolve) => {
            const check = setInterval(() => {
              if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
                clearInterval(check);
                resolve(job);
              }
            }, 200);
          }),
        ),
      );

      // Emit events per job
      settled.forEach((s) => {
        const job = s.value;
        if (!job) return;
        if (job.status === 'done' && job.result) {
          emitFileUploaded({
            userId,
            fileId:   job.result.id,
            fileName: job.file.name,
            folderId: job.result.folder_id,
            sizeBytes: job.file.size,
          });
        } else if (job.status === 'error') {
          emitFileUploadFailed({ userId, fileName: job.file.name, errorMessage: job.error });
        }
      });

      if (onComplete) onComplete(jobs);
    } catch (err) {
      setErrors((prev) => [...prev, err.message]);
    } finally {
      setUploading(false);
    }
  }, [userId, folderId, uploadFiles, onComplete]);

  // ── Drag events ───────────────────────────────────────────
  function onDragOver(e)  { e.preventDefault(); setDragging(true); }
  function onDragLeave()  { setDragging(false); }
  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }
  function onInputChange(e) { handleFiles(e.target.files); }
  function openPicker()     { inputRef.current?.click(); }

  // ── Styles ────────────────────────────────────────────────
  const borderColor = dragging
    ? 'var(--color-primary, #3b82f6)'
    : 'var(--color-border, #e2e8f0)';

  const bgColor = dragging
    ? 'var(--color-primary-subtle, #eff6ff)'
    : 'var(--color-surface, #f8fafc)';

  return (
    <div className={className} style={{ direction: 'rtl' }}>
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="منطقة رفع الملفات"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={openPicker}
        onKeyDown={(e) => e.key === 'Enter' && openPicker()}
        style={{
          border:        `2px dashed ${borderColor}`,
          borderRadius:  '12px',
          background:    bgColor,
          padding:       '36px 24px',
          textAlign:     'center',
          cursor:        uploading ? 'not-allowed' : 'pointer',
          transition:    'all 0.2s',
          userSelect:    'none',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          style={{ display: 'none' }}
          onChange={onInputChange}
          disabled={uploading}
        />

        {/* Icon */}
        <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>
          {uploading ? '⏳' : dragging ? '📂' : '📁'}
        </div>

        {/* Label */}
        <p style={{
          margin:    0,
          fontSize:  '1rem',
          fontWeight: 600,
          color:     'var(--color-text-primary, #1e293b)',
        }}>
          {uploading
            ? 'جاري الرفع…'
            : dragging
              ? 'أفلت الملفات هنا'
              : 'اسحب الملفات أو انقر للاختيار'}
        </p>

        <p style={{
          margin:    '4px 0 0',
          fontSize:  '0.8rem',
          color:     'var(--color-text-muted, #94a3b8)',
        }}>
          الحد الأقصى لكل ملف: {formatFileSize(MAX_FILE_SIZE_BYTES)}
        </p>
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <ul style={{
          margin:     '8px 0 0',
          paddingRight: '20px',
          color:      'var(--color-danger, #ef4444)',
          fontSize:   '0.82rem',
        }}>
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
