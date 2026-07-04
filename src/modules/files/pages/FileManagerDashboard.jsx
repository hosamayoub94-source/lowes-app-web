// =============================================================
// File Module — FileManagerDashboard
//
// Full-page file manager layout:
//   Sidebar   : FolderTree + storage usage gauge
//   Toolbar   : breadcrumb, search, view toggle, upload button
//   Content   : FileGrid or FileList (toggled via viewMode)
//   Footer    : UploadProgress (when jobs are active)
//
// Boots the file store + realtime on mount.
// =============================================================
import React, { useState, useMemo } from 'react';
import FolderTree     from '../components/FolderTree';
import FileGrid       from '../components/FileGrid';
import FileList       from '../components/FileList';
import FileUploader   from '../components/FileUploader';
import UploadProgress from '../components/UploadProgress';
import {
  useFileInit,
  useViewMode,
  useSetViewMode,
  useSetSearch,
  useFileSearch,
  useBreadcrumb,
  useCurrentFolderId,
  useSetCurrentFolder,
  useStorageStats,
  useUploadJobs,
  useSelectedFiles,
  useHasSelection,
  useClearSelection,
  useTrashFile,
} from '../hooks/useFiles';
import { VIEW_MODE, formatFileSize } from '../types/files.types';
import { useAuth } from '@hooks/useAuth';

export default function FileManagerDashboard() {
  const { id: authId, name: authName } = useAuth();
  // المستخدم الفعلي (كان مربوطاً بمستخدم وهمي 'user_current' فيتشارك الجميع ملفاته).
  const DEMO_USER = { id: authId || 'anon', name: authName || 'أنت' };
  useFileInit(DEMO_USER.id);

  const viewMode         = useViewMode();
  const setViewMode      = useSetViewMode();
  const search           = useFileSearch();
  const setSearch        = useSetSearch();
  const breadcrumb       = useBreadcrumb();
  const currentFolderId  = useCurrentFolderId();
  const setCurrentFolder = useSetCurrentFolder();
  const storageStats     = useStorageStats();
  const uploadJobs       = useUploadJobs();
  const selectedFiles    = useSelectedFiles();
  const hasSelection     = useHasSelection();
  const clearSelection   = useClearSelection();
  const trashFile        = useTrashFile();

  const [uploaderOpen, setUploaderOpen] = useState(false);

  const hasActiveUploads = uploadJobs.some(
    (j) => j.status === 'uploading' || j.status === 'retrying',
  );

  // Storage usage percent
  const storagePercent = useMemo(() => {
    if (!storageStats?.quotaBytes || !storageStats.totalBytes) return 0;
    return Math.min(100, Math.round((storageStats.totalBytes / storageStats.quotaBytes) * 100));
  }, [storageStats]);

  // Bulk trash selected files
  async function handleBulkTrash() {
    if (!window.confirm(`نقل ${selectedFiles.length} ملفات للمحذوفات؟`)) return;
    for (const f of selectedFiles) {
      await trashFile(f.id).catch(() => {});
    }
    clearSelection();
  }

  return (
    <div dir="rtl" className="bg-surface-alt" style={{
      display:    'flex',
      flexDirection: 'column',
      minHeight:  '100vh',
    }}>

      {/* ── Page header ────────────────────────────────────── */}
      <header className="bg-surface border-b border-border" style={{
        padding:      '16px 24px',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'space-between',
        flexShrink:   0,
      }}>
        <h1 className="text-text" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
          إدارة الملفات
        </h1>

        {/* Upload button */}
        <button
          onClick={() => setUploaderOpen((v) => !v)}
          className="bg-teal text-white"
          style={{
            border:       'none',
            borderRadius: '8px',
            padding:      '9px 20px',
            fontWeight:   700,
            fontSize:     '0.88rem',
            cursor:       'pointer',
            display:      'flex',
            alignItems:   'center',
            gap:          '6px',
          }}
        >
          <span>↑</span> رفع ملفات
        </button>
      </header>

      {/* ── Body ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ────────────────────────────────────────── */}
        <aside className="bg-surface border-l border-border" style={{
          width:        '220px',
          flexShrink:   0,
          padding:      '16px 12px',
          display:      'flex',
          flexDirection:'column',
          gap:          '8px',
          overflowY:    'auto',
        }}>
          <FolderTree />

          {/* Storage gauge */}
          {storageStats && (
            <div className="border-t border-border" style={{
              marginTop:    'auto',
              paddingTop:   '16px',
            }}>
              <p className="text-muted" style={{ margin: '0 0 6px', fontSize: '0.75rem', fontWeight: 600 }}>
                التخزين
              </p>
              <div className="bg-surface-alt" style={{
                height:       '6px',
                borderRadius: '3px',
                overflow:     'hidden',
                marginBottom: '4px',
              }}>
                <div style={{
                  height:     '100%',
                  width:      `${storagePercent}%`,
                  background: storagePercent >= 90
                    ? '#ef4444'
                    : storagePercent >= 70
                      ? '#f59e0b'
                      : 'rgb(var(--color-teal))',
                  borderRadius: '3px',
                  transition: 'width 0.3s',
                }} />
              </div>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.72rem' }}>
                {formatFileSize(storageStats.totalBytes)} / {formatFileSize(storageStats.quotaBytes)} ({storagePercent}%)
              </p>
            </div>
          )}
        </aside>

        {/* ── Main content ────────────────────────────────────── */}
        <main style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Upload area (collapsible) */}
          {uploaderOpen && (
            <FileUploader
              userId={DEMO_USER.id}
              folderId={currentFolderId}
              onComplete={() => setUploaderOpen(false)}
            />
          )}

          {/* Toolbar */}
          <div style={{
            display:        'flex',
            alignItems:     'center',
            gap:            '12px',
            flexWrap:       'wrap',
          }}>
            {/* Breadcrumb */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
              <button
                onClick={() => setCurrentFolder(null)}
                style={_breadBtn(currentFolderId === null)}
              >
                الرئيسية
              </button>
              {breadcrumb.map((crumb, i) => (
                <React.Fragment key={crumb.id}>
                  <span className="text-muted" style={{ fontSize: '0.8rem' }}>›</span>
                  <button
                    onClick={() => setCurrentFolder(crumb.id)}
                    style={_breadBtn(i === breadcrumb.length - 1)}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </nav>

            {/* Search */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <span className="text-muted" style={{
                position: 'absolute',
                top: '50%', right: '10px',
                transform: 'translateY(-50%)',
                fontSize: '0.9rem',
                pointerEvents: 'none',
              }}>🔍</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في الملفات…"
                className="border border-border bg-surface text-text"
                style={{
                  borderRadius: '8px',
                  padding:      '7px 32px 7px 12px',
                  fontSize:     '0.83rem',
                  outline:      'none',
                  width:        '200px',
                  direction:    'rtl',
                }}
              />
            </div>

            {/* View toggle */}
            <div className="border border-border" style={{
              display:      'flex',
              borderRadius: '8px',
              overflow:     'hidden',
              flexShrink:   0,
            }}>
              {[
                { mode: VIEW_MODE.GRID, icon: '⊞', label: 'شبكة' },
                { mode: VIEW_MODE.LIST, icon: '☰', label: 'قائمة' },
              ].map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  title={label}
                  className={viewMode === mode ? 'bg-teal/10 text-teal' : 'text-muted'}
                  style={{
                    background:  viewMode === mode ? undefined : 'transparent',
                    border:      'none',
                    padding:     '7px 12px',
                    cursor:      'pointer',
                    fontSize:    '1rem',
                    transition:  'background 0.15s',
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>

            {/* Bulk actions */}
            {hasSelection && (
              <button
                onClick={handleBulkTrash}
                className="bg-red-bg text-red-fg"
                style={{
                  border:       'none',
                  borderRadius: '8px',
                  padding:      '7px 14px',
                  fontWeight:   600,
                  fontSize:     '0.83rem',
                  cursor:       'pointer',
                  flexShrink:   0,
                }}
              >
                🗑 حذف المحدد ({selectedFiles.length})
              </button>
            )}
          </div>

          {/* File view */}
          {viewMode === VIEW_MODE.GRID
            ? <FileGrid userId={DEMO_USER.id} />
            : <FileList userId={DEMO_USER.id} />
          }
        </main>
      </div>

      {/* ── Upload progress footer ───────────────────────────── */}
      {(uploadJobs.length > 0) && (
        <footer className="bg-surface border-t border-border" style={{
          padding:      '12px 24px',
          flexShrink:   0,
          maxHeight:    '220px',
          overflowY:    'auto',
        }}>
          <UploadProgress />
        </footer>
      )}
    </div>
  );
}

function _breadBtn(active) {
  return {
    background:  'none',
    border:      'none',
    cursor:      active ? 'default' : 'pointer',
    fontSize:    '0.83rem',
    fontWeight:  active ? 700 : 400,
    color:       active
      ? 'rgb(var(--color-text))'
      : 'rgb(var(--color-teal))',
    padding:     '2px 4px',
  };
}
