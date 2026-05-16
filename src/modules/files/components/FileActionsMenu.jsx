// =============================================================
// File Module — FileActionsMenu
//
// Dropdown context menu for a single file.
// Actions: Preview, Rename, Move (stub), Download, Trash,
//          Restore (trashed files only), Delete permanently.
//
// Closes on outside-click or Escape key.
// Emits Event Bus events after each successful action.
// =============================================================
import React, { useEffect, useRef, useState } from 'react';
import {
  useTrashFile,
  useDeleteFile,
  useRestoreFile,
  useRenameFile,
} from '../hooks/useFiles';
import {
  emitFileTrashed,
  emitFileDeleted,
  emitFileRestored,
  emitFileRenamed,
}                        from '../integrations/fileEventBus';
import { FILE_STATUS }   from '../types/files.types';
import { generateSignedUrl } from '../services/fileService';

/**
 * @param {object}   props
 * @param {object}   props.file          File record
 * @param {string}   props.userId
 * @param {Function} props.onClose
 * @param {Function} [props.onPreview]   Open preview handler
 * @param {object}   [props.anchorStyle] CSS overrides for positioning
 */
export default function FileActionsMenu({
  file,
  userId,
  onClose,
  onPreview,
  anchorStyle = {},
}) {
  const menuRef   = useRef(null);
  const trashFile  = useTrashFile();
  const deleteFile = useDeleteFile();
  const restoreFile = useRestoreFile();
  const renameFile = useRenameFile();

  const [renaming,  setRenaming]  = useState(false);
  const [newName,   setNewName]   = useState(file.name);
  const [busy,      setBusy]      = useState(false);
  const [feedback,  setFeedback]  = useState(null); // { text, ok }

  const isTrashed = file.status === FILE_STATUS.TRASHED;

  // Close on outside click
  useEffect(() => {
    function handle(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handle(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  // ── Action handlers ───────────────────────────────────────

  async function handleTrash() {
    setBusy(true);
    try {
      await trashFile(file.id);
      emitFileTrashed({ userId, fileId: file.id, fileName: file.name });
      onClose();
    } catch (err) {
      setFeedback({ text: err.message, ok: false });
    } finally { setBusy(false); }
  }

  async function handleDelete() {
    if (!window.confirm(`حذف "${file.name}" نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.`)) return;
    setBusy(true);
    try {
      await deleteFile(file.id);
      emitFileDeleted({ userId, fileId: file.id, fileName: file.name });
      onClose();
    } catch (err) {
      setFeedback({ text: err.message, ok: false });
    } finally { setBusy(false); }
  }

  async function handleRestore() {
    setBusy(true);
    try {
      await restoreFile(file.id);
      emitFileRestored({ userId, fileId: file.id, fileName: file.name });
      onClose();
    } catch (err) {
      setFeedback({ text: err.message, ok: false });
    } finally { setBusy(false); }
  }

  async function handleRenameSubmit() {
    const name = newName.trim();
    if (!name || name === file.name) { setRenaming(false); return; }
    setBusy(true);
    try {
      await renameFile(file.id, name);
      emitFileRenamed({ userId, fileId: file.id, oldName: file.name, newName: name });
      setRenaming(false);
      onClose();
    } catch (err) {
      setFeedback({ text: err.message, ok: false });
    } finally { setBusy(false); }
  }

  async function handleDownload() {
    try {
      const url = await generateSignedUrl(file.storage_path);
      const a   = document.createElement('a');
      a.href    = url;
      a.download = file.name;
      a.target   = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      setFeedback({ text: err.message, ok: false });
    }
    onClose();
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position:     'absolute',
        background:   'var(--color-bg, #ffffff)',
        border:       '1px solid var(--color-border, #e2e8f0)',
        borderRadius: '10px',
        boxShadow:    '0 8px 24px rgba(0,0,0,0.12)',
        minWidth:     '170px',
        padding:      '6px',
        zIndex:       100,
        direction:    'rtl',
        ...anchorStyle,
      }}
    >
      {/* Rename inline input */}
      {renaming ? (
        <div style={{ padding: '4px' }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') setRenaming(false);
            }}
            autoFocus
            style={{
              width:        '100%',
              border:       '1px solid var(--color-primary, #3b82f6)',
              borderRadius: '6px',
              padding:      '5px 8px',
              fontSize:     '0.82rem',
              outline:      'none',
              direction:    'rtl',
              boxSizing:    'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <button onClick={handleRenameSubmit} disabled={busy} style={_btn('var(--color-primary, #3b82f6)', '#fff')}>
              حفظ
            </button>
            <button onClick={() => setRenaming(false)} style={_btn('#e2e8f0', '#475569')}>
              إلغاء
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Preview */}
          {onPreview && !isTrashed && (
            <MenuItem icon="👁" label="معاينة" onClick={onPreview} />
          )}

          {/* Download */}
          {!isTrashed && (
            <MenuItem icon="⬇️" label="تنزيل" onClick={handleDownload} />
          )}

          {/* Rename */}
          {!isTrashed && (
            <MenuItem icon="✏️" label="إعادة التسمية" onClick={() => setRenaming(true)} />
          )}

          {isTrashed
            ? <>
                {/* Restore */}
                <MenuItem icon="♻️" label="استعادة" onClick={handleRestore} disabled={busy} />
                {/* Delete permanently */}
                <MenuItem icon="🗑" label="حذف نهائي" onClick={handleDelete} disabled={busy} danger />
              </>
            : (
                /* Trash */
                <MenuItem icon="🗑" label="نقل للمحذوفات" onClick={handleTrash} disabled={busy} />
              )}
        </>
      )}

      {/* Feedback */}
      {feedback && (
        <p style={{
          margin:   '6px 4px 0',
          fontSize: '0.75rem',
          color:    feedback.ok ? '#22c55e' : '#ef4444',
        }}>
          {feedback.text}
        </p>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, disabled = false, danger = false }) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      style={{
        display:     'flex',
        alignItems:  'center',
        gap:         '8px',
        width:       '100%',
        background:  'none',
        border:      'none',
        borderRadius:'6px',
        padding:     '7px 10px',
        cursor:      disabled ? 'not-allowed' : 'pointer',
        fontSize:    '0.83rem',
        color:       danger ? '#ef4444' : 'var(--color-text-primary, #1e293b)',
        opacity:     disabled ? 0.5 : 1,
        textAlign:   'right',
        direction:   'rtl',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = danger ? '#fef2f2' : 'var(--color-surface, #f8fafc)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );
}

function _btn(bg, color) {
  return {
    flex:         1,
    background:   bg,
    border:       'none',
    borderRadius: '6px',
    cursor:       'pointer',
    fontSize:     '0.78rem',
    fontWeight:   600,
    color,
    padding:      '5px 0',
  };
}
