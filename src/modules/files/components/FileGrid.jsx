// =============================================================
// File Module — FileGrid
//
// Responsive card grid of files. Each card shows thumbnail /
// type icon, file name, size, and a selection checkbox.
// Clicking a card opens FilePreview; checkbox toggles selection.
// =============================================================
import React, { useState } from 'react';
import {
  useSortedFiles,
  useSelectedIds,
  useToggleSelect,
  useFileLoading,
} from '../hooks/useFiles';
import {
  FILE_TYPE_ICON,
  FILE_TYPE_COLORS,
  formatFileSize,
} from '../types/files.types';
import FilePreview    from './FilePreview';
import FileActionsMenu from './FileActionsMenu';

/**
 * @param {object}   props
 * @param {string}   props.userId
 * @param {string}   [props.className]
 */
export default function FileGrid({ userId, className = '' }) {
  const files        = useSortedFiles();
  const selectedIds  = useSelectedIds();
  const toggleSelect = useToggleSelect();
  const loading      = useFileLoading();

  const [previewFile, setPreviewFile] = useState(null);

  if (loading && files.length === 0) {
    return (
      <div className="text-muted" style={{ textAlign: 'center', padding: '48px' }}>
        جاري التحميل…
      </div>
    );
  }

  if (!loading && files.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px', direction: 'rtl' }}>
        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📂</div>
        <p className="text-text" style={{ margin: 0, fontWeight: 600 }}>
          لا توجد ملفات
        </p>
        <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.83rem' }}>
          ارفع ملفات لتظهر هنا
        </p>
      </div>
    );
  }

  return (
    <div className={className} style={{ direction: 'rtl' }}>
      <div style={{
        display:               'grid',
        gridTemplateColumns:   'repeat(auto-fill, minmax(160px, 1fr))',
        gap:                   '14px',
      }}>
        {files.map((file) => (
          <FileCard
            key={file.id}
            file={file}
            selected={selectedIds.includes(file.id)}
            onToggleSelect={() => toggleSelect(file.id)}
            onPreview={() => setPreviewFile(file)}
            userId={userId}
          />
        ))}
      </div>

      {/* Preview modal */}
      {previewFile && (
        <FilePreview
          file={previewFile}
          open={!!previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}

// ── File card ─────────────────────────────────────────────────

function FileCard({ file, selected, onToggleSelect, onPreview, userId }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const accentColor = FILE_TYPE_COLORS[file.file_type] ?? '#94a3b8';

  return (
    <div
      style={{
        position:     'relative',
        background:   selected
          ? 'rgb(var(--color-teal) / 0.1)'
          : 'rgb(var(--color-surface-alt))',
        border:       `2px solid ${selected ? 'rgb(var(--color-teal))' : 'rgb(var(--color-border))'}`,
        borderRadius: '12px',
        padding:      '16px 12px 12px',
        cursor:       'pointer',
        transition:   'box-shadow 0.15s, border-color 0.15s',
        userSelect:   'none',
        textAlign:    'center',
      }}
      onClick={onPreview}
    >
      {/* Selection checkbox */}
      <div
        onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        style={{
          position:     'absolute',
          top:          '8px',
          right:        '8px',
          width:        '18px',
          height:       '18px',
          borderRadius: '4px',
          border:       `2px solid ${selected ? 'rgb(var(--color-teal))' : 'rgb(var(--color-border))'}`,
          background:   selected ? 'rgb(var(--color-teal))' : 'rgb(var(--color-surface))',
          display:      'flex',
          alignItems:   'center',
          justifyContent:'center',
          fontSize:     '11px',
          color:        '#fff',
          flexShrink:   0,
        }}
      >
        {selected ? '✓' : ''}
      </div>

      {/* Actions menu trigger */}
      <div
        onClick={(e) => { e.stopPropagation(); setMenuOpen(true); }}
        style={{
          position:  'absolute',
          top:       '8px',
          left:      '8px',
          width:     '22px',
          height:    '22px',
          display:   'flex',
          alignItems:'center',
          justifyContent:'center',
          borderRadius: '4px',
          color:     'rgb(var(--color-muted))',
          fontSize:  '14px',
        }}
      >
        ⋮
      </div>

      {/* File icon */}
      <div style={{
        fontSize:     '2.8rem',
        marginBottom: '10px',
        color:        accentColor,
      }}>
        {FILE_TYPE_ICON[file.file_type] ?? '📎'}
      </div>

      {/* Name */}
      <p className="text-text" style={{
        margin:       0,
        fontSize:     '0.8rem',
        fontWeight:   600,
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
        width:        '100%',
      }}>
        {file.name}
      </p>

      {/* Size */}
      <p className="text-muted" style={{
        margin:   '3px 0 0',
        fontSize: '0.72rem',
      }}>
        {formatFileSize(file.size_bytes)}
      </p>

      {/* Actions menu */}
      {menuOpen && (
        <FileActionsMenu
          file={file}
          userId={userId}
          onClose={() => setMenuOpen(false)}
          onPreview={() => { setMenuOpen(false); onPreview(); }}
          anchorStyle={{ position: 'absolute', top: '32px', left: '8px', zIndex: 20 }}
        />
      )}
    </div>
  );
}
