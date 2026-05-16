// =============================================================
// File Module — FileList
//
// Compact table-style list view of files.
// Supports sortable column headers, row selection checkbox,
// and inline actions menu per row.
// =============================================================
import React, { useState } from 'react';
import {
  useSortedFiles,
  useSelectedIds,
  useToggleSelect,
  useSelectAll,
  useClearSelection,
  useSetSortBy,
  useSortBy,
  useSortAsc,
  useFileLoading,
} from '../hooks/useFiles';
import {
  FILE_TYPE_ICON,
  FILE_TYPE_COLORS,
  SORT_BY,
  formatFileSize,
} from '../types/files.types';
import FilePreview    from './FilePreview';
import FileActionsMenu from './FileActionsMenu';

/**
 * @param {object}  props
 * @param {string}  props.userId
 * @param {string}  [props.className]
 */
export default function FileList({ userId, className = '' }) {
  const files        = useSortedFiles();
  const selectedIds  = useSelectedIds();
  const toggleSelect = useToggleSelect();
  const selectAll    = useSelectAll();
  const clearSel     = useClearSelection();
  const setSortBy    = useSetSortBy();
  const sortBy       = useSortBy();
  const sortAsc      = useSortAsc();
  const loading      = useFileLoading();

  const [previewFile, setPreviewFile] = useState(null);
  const [menuFile,    setMenuFile]    = useState(null);

  const allSelected = files.length > 0 && files.every((f) => selectedIds.includes(f.id));

  function handleHeaderSelect() {
    allSelected ? clearSel() : selectAll();
  }

  function handleSort(field) {
    const nextAsc = sortBy === field ? !sortAsc : false;
    setSortBy(field, nextAsc);
  }

  function sortArrow(field) {
    if (sortBy !== field) return '';
    return sortAsc ? ' ↑' : ' ↓';
  }

  if (loading && files.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-muted, #94a3b8)' }}>
        جاري التحميل…
      </div>
    );
  }

  if (!loading && files.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px', direction: 'rtl' }}>
        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📂</div>
        <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text-primary, #1e293b)' }}>
          لا توجد ملفات
        </p>
      </div>
    );
  }

  return (
    <div className={className} style={{ direction: 'rtl', overflowX: 'auto' }}>
      <table style={{
        width:           '100%',
        borderCollapse:  'collapse',
        fontSize:        '0.85rem',
      }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--color-border, #e2e8f0)' }}>
            {/* Select-all */}
            <th style={{ width: '32px', padding: '10px 8px', textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleHeaderSelect}
                aria-label="تحديد الكل"
              />
            </th>

            {/* Name */}
            <th
              style={_th()}
              onClick={() => handleSort(SORT_BY.NAME)}
            >
              الاسم{sortArrow(SORT_BY.NAME)}
            </th>

            {/* Type */}
            <th style={_th(120)}>النوع</th>

            {/* Size */}
            <th
              style={_th(100)}
              onClick={() => handleSort(SORT_BY.SIZE)}
            >
              الحجم{sortArrow(SORT_BY.SIZE)}
            </th>

            {/* Date */}
            <th
              style={_th(140)}
              onClick={() => handleSort(SORT_BY.DATE)}
            >
              تاريخ الرفع{sortArrow(SORT_BY.DATE)}
            </th>

            {/* Actions */}
            <th style={{ width: '40px', padding: '10px 8px' }} />
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              selected={selectedIds.includes(file.id)}
              onToggleSelect={() => toggleSelect(file.id)}
              onPreview={() => setPreviewFile(file)}
              onMenuOpen={() => setMenuFile(file)}
              menuOpen={menuFile?.id === file.id}
              onMenuClose={() => setMenuFile(null)}
              userId={userId}
            />
          ))}
        </tbody>
      </table>

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

function FileRow({ file, selected, onToggleSelect, onPreview, onMenuOpen, menuOpen, onMenuClose, userId }) {
  const accentColor = FILE_TYPE_COLORS[file.file_type] ?? '#94a3b8';
  const dateStr     = file.created_at
    ? new Date(file.created_at).toLocaleDateString('ar-SA', { dateStyle: 'short' })
    : '—';

  return (
    <tr
      style={{
        borderBottom: '1px solid var(--color-border, #e2e8f0)',
        background:   selected ? 'var(--color-primary-subtle, #eff6ff)' : 'transparent',
        transition:   'background 0.1s',
      }}
    >
      {/* Checkbox */}
      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`تحديد ${file.name}`}
        />
      </td>

      {/* Name */}
      <td
        style={{ padding: '10px 8px', cursor: 'pointer', maxWidth: '280px' }}
        onClick={onPreview}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem', color: accentColor, flexShrink: 0 }}>
            {FILE_TYPE_ICON[file.file_type] ?? '📎'}
          </span>
          <span style={{
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
            fontWeight:   500,
            color:        'var(--color-text-primary, #1e293b)',
          }}>
            {file.name}
          </span>
        </div>
      </td>

      {/* Type */}
      <td style={{ padding: '10px 8px', color: 'var(--color-text-muted, #94a3b8)' }}>
        <span style={{
          fontSize:     '0.75rem',
          fontWeight:   600,
          color:        accentColor,
          background:   `${accentColor}18`,
          borderRadius: '4px',
          padding:      '2px 6px',
        }}>
          {(file.file_type ?? '').toUpperCase()}
        </span>
      </td>

      {/* Size */}
      <td style={{ padding: '10px 8px', color: 'var(--color-text-muted, #94a3b8)', whiteSpace: 'nowrap' }}>
        {formatFileSize(file.size_bytes)}
      </td>

      {/* Date */}
      <td style={{ padding: '10px 8px', color: 'var(--color-text-muted, #94a3b8)', whiteSpace: 'nowrap' }}>
        {dateStr}
      </td>

      {/* Actions */}
      <td style={{ padding: '10px 8px', textAlign: 'center', position: 'relative' }}>
        <button
          onClick={onMenuOpen}
          aria-label="خيارات"
          style={{
            background: 'none',
            border:     'none',
            cursor:     'pointer',
            fontSize:   '1.1rem',
            color:      'var(--color-text-muted, #94a3b8)',
            padding:    '2px 6px',
          }}
        >
          ⋮
        </button>
        {menuOpen && (
          <FileActionsMenu
            file={file}
            userId={userId}
            onClose={onMenuClose}
            onPreview={onPreview}
            anchorStyle={{ position: 'absolute', top: '32px', left: '0', zIndex: 20 }}
          />
        )}
      </td>
    </tr>
  );
}

function _th(width) {
  return {
    padding:     '10px 8px',
    textAlign:   'right',
    fontWeight:  600,
    color:       'var(--color-text-secondary, #475569)',
    cursor:      'pointer',
    userSelect:  'none',
    whiteSpace:  'nowrap',
    ...(width ? { width: `${width}px` } : {}),
  };
}
