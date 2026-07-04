// =============================================================
// File Module — UploadProgress
//
// Live list of all upload jobs in the queue.
// Shows per-file progress bar, retry count, status badge,
// and an abort button for in-progress jobs.
//
// Only renders when there are active or recent jobs.
// =============================================================
import React from 'react';
import { useUploadJobs } from '../hooks/useFiles';
import useFileStore      from '../store/useFileStore';
import {
  UPLOAD_STATUS,
  UPLOAD_STATUS_LABELS,
  formatFileSize,
}                        from '../types/files.types';

// Clear completed / cancelled jobs from queue
function ClearButton() {
  return (
    <button
      onClick={async () => {
        const { clearCompletedUploads } = await import('../services/uploadService');
        clearCompletedUploads();
        // Refresh uploadJobs in store
        useFileStore.setState({ uploadJobs: [] });
      }}
      className="text-teal"
      style={{
        background: 'none',
        border:     'none',
        cursor:     'pointer',
        fontSize:   '0.78rem',
        padding:    '0',
      }}
    >
      مسح المنتهية
    </button>
  );
}

const STATUS_COLOR = {
  [UPLOAD_STATUS.PENDING]:    '#94a3b8',
  [UPLOAD_STATUS.UPLOADING]:  '#3b82f6',
  [UPLOAD_STATUS.RETRYING]:   '#f59e0b',
  [UPLOAD_STATUS.DONE]:       '#22c55e',
  [UPLOAD_STATUS.ERROR]:      '#ef4444',
  [UPLOAD_STATUS.CANCELLED]:  '#94a3b8',
  [UPLOAD_STATUS.PROCESSING]: '#a855f7',
};

/**
 * @param {object}  props
 * @param {boolean} [props.compact]  Show as a slim bar (no file names)
 * @param {string}  [props.className]
 */
export default function UploadProgress({ compact = false, className = '' }) {
  const jobs = useUploadJobs();
  if (jobs.length === 0) return null;

  const active   = jobs.filter((j) => j.status === UPLOAD_STATUS.UPLOADING || j.status === UPLOAD_STATUS.RETRYING);
  const hasActive = active.length > 0;

  return (
    <div className={className} style={{ direction: 'rtl' }}>
      {/* Header row */}
      <div style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        marginBottom:   '8px',
      }}>
        <span className="text-text" style={{ fontWeight: 600, fontSize: '0.88rem' }}>
          {hasActive ? `جاري الرفع (${active.length})` : 'قائمة الرفع'}
        </span>
        <ClearButton />
      </div>

      {/* Job list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} compact={compact} />
        ))}
      </div>
    </div>
  );
}

function JobRow({ job, compact }) {
  const isActive = job.status === UPLOAD_STATUS.UPLOADING || job.status === UPLOAD_STATUS.RETRYING;
  const color    = STATUS_COLOR[job.status] ?? '#94a3b8';

  return (
    <div className="bg-surface-alt border border-border" style={{
      borderRadius: '8px',
      padding:      compact ? '8px 12px' : '10px 14px',
    }}>
      {/* Top row — file name + badge + abort */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: isActive ? '6px' : '0' }}>
        <span style={{ fontSize: '1rem' }}>{_fileIcon(job.file?.type)}</span>

        {!compact && (
          <span className="text-text" style={{
            flex:         1,
            fontSize:     '0.84rem',
            fontWeight:   500,
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}>
            {job.file?.name ?? 'ملف غير معروف'}
          </span>
        )}

        {!compact && job.file?.size > 0 && (
          <span className="text-muted" style={{ fontSize: '0.75rem', flexShrink: 0 }}>
            {formatFileSize(job.file.size)}
          </span>
        )}

        {/* Status badge */}
        <span style={{
          fontSize:     '0.72rem',
          fontWeight:   600,
          color:        color,
          background:   `${color}18`,
          borderRadius: '4px',
          padding:      '2px 6px',
          flexShrink:   0,
        }}>
          {UPLOAD_STATUS_LABELS[job.status] ?? job.status}
          {job.attempts > 1 ? ` (${job.attempts})` : ''}
        </span>

        {/* Abort button */}
        {isActive && (
          <button
            onClick={() => job.abort?.()}
            title="إلغاء"
            style={{
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              fontSize:   '1rem',
              color:      '#ef4444',
              padding:    '0',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Progress bar */}
      {isActive && (
        <div style={{
          height:       '4px',
          background:   'rgb(var(--color-border) / 0.4)',
          borderRadius: '2px',
          overflow:     'hidden',
        }}>
          <div style={{
            height:     '100%',
            width:      `${job.progress ?? 0}%`,
            background: color,
            borderRadius: '2px',
            transition: 'width 0.3s',
          }} />
        </div>
      )}

      {/* Error message */}
      {job.status === UPLOAD_STATUS.ERROR && job.error && (
        <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#ef4444' }}>
          {job.error}
        </p>
      )}
    </div>
  );
}

function _fileIcon(mimeType = '') {
  if (!mimeType) return '📎';
  if (mimeType.startsWith('image/'))         return '🖼';
  if (mimeType === 'application/pdf')        return '📄';
  if (mimeType.startsWith('video/'))         return '🎬';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return '📊';
  if (mimeType.includes('word') || mimeType.includes('text/')) return '📝';
  if (mimeType.includes('zip') || mimeType.includes('rar'))    return '🗜';
  return '📎';
}
