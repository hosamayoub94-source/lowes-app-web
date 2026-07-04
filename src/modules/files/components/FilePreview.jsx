// =============================================================
// File Module — FilePreview
//
// Modal/panel that previews a file in-browser:
//   • Images  — <img> tag with signed URL
//   • PDF     — <iframe> embed
//   • Video   — <video> with controls
//   • Others  — name + size + download prompt
//
// Limits preview to MAX_PREVIEW_SIZE_BYTES; large files show
// a "too large to preview" fallback with a download link.
// Fetches the signed URL lazily on mount.
// =============================================================
import React, { useEffect, useState, useCallback } from 'react';
import {
  FILE_TYPE,
  MAX_PREVIEW_SIZE_BYTES,
  formatFileSize,
  FILE_TYPE_LABELS,
  FILE_TYPE_ICON,
}                          from '../types/files.types';
import { generateSignedUrl } from '../services/fileService';

/**
 * @param {object}   props
 * @param {object}   props.file          File record from the store
 * @param {Function} props.onClose       Called when the user dismisses
 * @param {boolean}  [props.open]        Controlled open state (default true)
 */
export default function FilePreview({ file, onClose, open = true }) {
  const [url,     setUrl]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const tooBig = (file?.size_bytes ?? 0) > MAX_PREVIEW_SIZE_BYTES;

  // Fetch signed URL
  const fetchUrl = useCallback(async () => {
    if (!file?.storage_path || tooBig) return;
    setLoading(true);
    setError(null);
    try {
      const signed = await generateSignedUrl(file.storage_path);
      setUrl(signed);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [file?.storage_path, tooBig]);

  useEffect(() => {
    if (open && file) fetchUrl();
    return () => { setUrl(null); setError(null); };
  }, [open, file?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !file) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:   'fixed',
          inset:      0,
          background: 'rgba(0,0,0,0.55)',
          zIndex:     1000,
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`معاينة: ${file.name}`}
        className="bg-surface"
        style={{
          position:     'fixed',
          top:          '50%',
          left:         '50%',
          transform:    'translate(-50%, -50%)',
          zIndex:       1001,
          borderRadius: '16px',
          boxShadow:    '0 20px 60px rgba(0,0,0,0.25)',
          width:        'min(90vw, 900px)',
          maxHeight:    '85vh',
          display:      'flex',
          flexDirection:'column',
          direction:    'rtl',
          overflow:     'hidden',
        }}
      >
        {/* Header */}
        <div className="border-b border-border" style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '14px 20px',
          flexShrink:     0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>{FILE_TYPE_ICON[file.file_type] ?? '📎'}</span>
            <div>
              <p className="text-text" style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>
                {file.name}
              </p>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.75rem' }}>
                {FILE_TYPE_LABELS[file.file_type] ?? 'ملف'} · {formatFileSize(file.size_bytes)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="إغلاق المعاينة"
            className="text-muted"
            style={{
              background:   'none',
              border:       'none',
              cursor:       'pointer',
              fontSize:     '1.25rem',
              padding:      '4px',
              lineHeight:   1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loading && <Spinner />}

          {!loading && error && (
            <ErrorState message={error} onRetry={fetchUrl} />
          )}

          {!loading && !error && tooBig && (
            <TooBigState file={file} url={url} />
          )}

          {!loading && !error && !tooBig && url && (
            <PreviewBody file={file} url={url} />
          )}

          {!loading && !error && !tooBig && !url && (
            <FallbackState file={file} />
          )}
        </div>
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────

function PreviewBody({ file, url }) {
  const type = file.file_type;

  if (type === FILE_TYPE.IMAGE) {
    return (
      <img
        src={url}
        alt={file.name}
        style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: '8px', objectFit: 'contain' }}
      />
    );
  }

  if (type === FILE_TYPE.PDF) {
    return (
      <iframe
        src={url}
        title={file.name}
        style={{ width: '100%', height: '60vh', border: 'none', borderRadius: '8px' }}
      />
    );
  }

  if (type === FILE_TYPE.VIDEO) {
    return (
      <video
        src={url}
        controls
        style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: '8px' }}
      />
    );
  }

  return <FallbackState file={file} url={url} />;
}

function FallbackState({ file, url }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px' }}>
      <div style={{ fontSize: '3rem', marginBottom: '12px' }}>{FILE_TYPE_ICON[file.file_type] ?? '📎'}</div>
      <p className="text-text" style={{ margin: '0 0 4px', fontWeight: 600 }}>
        {file.name}
      </p>
      <p className="text-muted" style={{ margin: '0 0 16px', fontSize: '0.82rem' }}>
        لا تتوفر معاينة لهذا النوع من الملفات
      </p>
      {url && (
        <a
          href={url}
          download={file.name}
          target="_blank"
          rel="noreferrer"
          className="bg-teal text-white"
          style={{
            display:      'inline-block',
            padding:      '8px 20px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize:     '0.88rem',
            fontWeight:   600,
          }}
        >
          تنزيل الملف
        </a>
      )}
    </div>
  );
}

function TooBigState({ file, url }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px' }}>
      <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📦</div>
      <p className="text-text" style={{ margin: '0 0 4px', fontWeight: 600 }}>
        الملف كبير جداً للمعاينة
      </p>
      <p className="text-muted" style={{ margin: '0 0 16px', fontSize: '0.82rem' }}>
        الحجم: {formatFileSize(file.size_bytes)} — الحد الأقصى للمعاينة: {formatFileSize(MAX_PREVIEW_SIZE_BYTES)}
      </p>
      {url && (
        <a
          href={url}
          download={file.name}
          target="_blank"
          rel="noreferrer"
          className="bg-teal text-white"
          style={{
            display:      'inline-block',
            padding:      '8px 20px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize:     '0.88rem',
            fontWeight:   600,
          }}
        >
          تنزيل الملف
        </a>
      )}
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⚠️</div>
      <p style={{ margin: '0 0 12px', color: '#ef4444', fontWeight: 600 }}>فشل تحميل المعاينة</p>
      <p className="text-muted" style={{ margin: '0 0 16px', fontSize: '0.82rem' }}>{message}</p>
      <button
        onClick={onRetry}
        className="bg-teal text-white"
        style={{
          padding:      '8px 20px',
          border:       'none',
          borderRadius: '8px',
          cursor:       'pointer',
          fontWeight:   600,
        }}
      >
        إعادة المحاولة
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ textAlign: 'center', padding: '40px' }}>
      <div style={{
        width:       '36px',
        height:      '36px',
        border:      '4px solid rgb(var(--color-border))',
        borderTop:   '4px solid rgb(var(--color-teal))',
        borderRadius:'50%',
        animation:   'spin 0.8s linear infinite',
        margin:      '0 auto',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
