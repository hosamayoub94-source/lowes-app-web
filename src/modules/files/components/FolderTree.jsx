// =============================================================
// File Module — FolderTree
//
// Sidebar navigation tree of folders.
// Shows root + all nested folders with expand/collapse.
// Highlights the current folder.
// Includes a "New Folder" inline creation form.
// =============================================================
import React, { useState, useMemo } from 'react';
import {
  useFolders,
  useCurrentFolderId,
  useSetCurrentFolder,
  useCreateFolder,
} from '../hooks/useFiles';

/**
 * @param {object}   props
 * @param {string}   [props.className]
 */
export default function FolderTree({ className = '' }) {
  const folders          = useFolders();
  const currentFolderId  = useCurrentFolderId();
  const setCurrentFolder = useSetCurrentFolder();
  const createFolder     = useCreateFolder();

  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState('');
  const [loading,  setLoading]  = useState(false);

  // Build tree: { ...folder, children: [] }
  const tree = useMemo(() => _buildTree(folders), [folders]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setLoading(true);
    try {
      await createFolder(name);
      setCreating(false);
      setNewName('');
    } catch { /* error shown by store */ }
    finally { setLoading(false); }
  }

  return (
    <nav className={className} style={{ direction: 'rtl', userSelect: 'none' }}>
      {/* Root */}
      <FolderItem
        label="كل الملفات"
        icon="🏠"
        folderId={null}
        currentFolderId={currentFolderId}
        onClick={() => setCurrentFolder(null)}
      />

      {/* Tree */}
      {tree.map((node) => (
        <FolderNode
          key={node.id}
          node={node}
          currentFolderId={currentFolderId}
          setCurrentFolder={setCurrentFolder}
          depth={0}
        />
      ))}

      {/* Trash shortcut (non-navigational, just a hint slot) */}
      <FolderItem
        label="سلة المحذوفات"
        icon="🗑"
        folderId="__trash__"
        currentFolderId={currentFolderId}
        onClick={() => setCurrentFolder('__trash__')}
        muted
      />

      {/* New folder form */}
      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border, #e2e8f0)' }}>
        {creating ? (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '2px 0' }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
              placeholder="اسم المجلد"
              autoFocus
              style={{
                flex:         1,
                border:       '1px solid var(--color-primary, #3b82f6)',
                borderRadius: '6px',
                padding:      '5px 8px',
                fontSize:     '0.82rem',
                outline:      'none',
                direction:    'rtl',
              }}
            />
            <button
              onClick={handleCreate}
              disabled={loading || !newName.trim()}
              style={_actionBtn('var(--color-primary, #3b82f6)', '#fff')}
            >
              {loading ? '…' : '✓'}
            </button>
            <button onClick={() => setCreating(false)} style={_actionBtn('#e2e8f0', '#475569')}>
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            style={{
              background:  'none',
              border:      'none',
              cursor:      'pointer',
              fontSize:    '0.82rem',
              color:       'var(--color-primary, #3b82f6)',
              padding:     '4px 0',
              display:     'flex',
              alignItems:  'center',
              gap:         '6px',
            }}
          >
            <span>+</span> مجلد جديد
          </button>
        )}
      </div>
    </nav>
  );
}

// ── Tree node (recursive) ─────────────────────────────────────

function FolderNode({ node, currentFolderId, setCurrentFolder, depth }) {
  const [open, setOpen] = useState(true);
  const hasChildren     = node.children?.length > 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {/* Expand toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            background: 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default',
            padding: '0 2px', fontSize: '0.7rem',
            color: hasChildren ? 'var(--color-text-muted, #94a3b8)' : 'transparent',
            flexShrink: 0,
          }}
        >
          {hasChildren ? (open ? '▾' : '▸') : '·'}
        </button>

        <FolderItem
          label={node.name}
          icon={node.color ? '📁' : '📁'}
          folderId={node.id}
          currentFolderId={currentFolderId}
          onClick={() => setCurrentFolder(node.id)}
          accentColor={node.color}
          style={{ flex: 1, paddingRight: `${depth * 12}px` }}
        />
      </div>

      {/* Children */}
      {open && hasChildren && (
        <div style={{ paddingRight: '12px' }}>
          {node.children.map((child) => (
            <FolderNode
              key={child.id}
              node={child}
              currentFolderId={currentFolderId}
              setCurrentFolder={setCurrentFolder}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Single folder item row ────────────────────────────────────

function FolderItem({ label, icon, folderId, currentFolderId, onClick, accentColor, muted = false, style = {} }) {
  const active = folderId === currentFolderId;

  return (
    <button
      onClick={onClick}
      style={{
        display:     'flex',
        alignItems:  'center',
        gap:         '8px',
        width:       '100%',
        background:  active ? 'var(--color-primary-subtle, #eff6ff)' : 'none',
        border:      'none',
        borderRadius:'8px',
        padding:     '7px 10px',
        cursor:      'pointer',
        fontSize:    '0.85rem',
        fontWeight:  active ? 700 : 400,
        color:       muted
          ? 'var(--color-text-muted, #94a3b8)'
          : active
            ? 'var(--color-primary, #3b82f6)'
            : 'var(--color-text-primary, #1e293b)',
        textAlign:   'right',
        direction:   'rtl',
        transition:  'background 0.1s',
        ...style,
      }}
    >
      <span style={{ fontSize: '1rem', color: accentColor ?? 'inherit', flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function _buildTree(folders) {
  const map  = {};
  const roots = [];

  folders.forEach((f) => { map[f.id] = { ...f, children: [] }; });
  folders.forEach((f) => {
    if (f.parent_id && map[f.parent_id]) {
      map[f.parent_id].children.push(map[f.id]);
    } else {
      roots.push(map[f.id]);
    }
  });

  return roots.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

function _actionBtn(bg, color) {
  return {
    background:   bg,
    border:       'none',
    borderRadius: '5px',
    cursor:       'pointer',
    fontSize:     '0.82rem',
    color,
    padding:      '5px 8px',
    flexShrink:   0,
  };
}
