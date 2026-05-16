// =============================================================
// File Module — Dev Monitor
//
// Floating panel (bottom-left) for development only.
// Shows:
//   • Store state snapshot (files, folders, selection, stats)
//   • Upload queue + job statuses
//   • Quick actions: clear mock data, reload files
//
// Hidden in production (USE_MOCK === false && NODE_ENV === production).
// =============================================================
import React, { useState } from 'react';
import useFileStore         from '../store/useFileStore';
import { clearMockFiles, USE_MOCK } from '../services/fileService';
import { formatFileSize }   from '../types/files.types';

const DEV_USER_ID = 'user_current';

function _DevFileMonitorNull() { return null; }

function _DevFileMonitor() {
  const [open, setOpen] = useState(false);
  const [tab,  setTab]  = useState('files'); // 'files' | 'uploads' | 'stats'

  const files         = useFileStore((s) => s.files);
  const folders       = useFileStore((s) => s.folders);
  const selectedIds   = useFileStore((s) => s.selectedIds);
  const uploadJobs    = useFileStore((s) => s.uploadJobs);
  const storageStats  = useFileStore((s) => s.storageStats);
  const loading       = useFileStore((s) => s.loading);
  const error         = useFileStore((s) => s.error);
  const loadFiles     = useFileStore((s) => s.loadFiles);
  const currentFolder = useFileStore((s) => s.currentFolderId);

  function handleClear() {
    clearMockFiles();
    setTimeout(() => loadFiles(DEV_USER_ID, null), 100); // re-seed and reload
  }

  return (
    <div
      style={{
        position:     'fixed',
        bottom:       '16px',
        left:         '16px',
        zIndex:       9999,
        fontFamily:   'monospace',
        fontSize:     '11px',
        direction:    'ltr',
      }}
    >
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background:   '#1e293b',
          color:        '#f1f5f9',
          border:       'none',
          borderRadius: '8px',
          padding:      '6px 12px',
          cursor:       'pointer',
          fontSize:     '11px',
          fontFamily:   'monospace',
          display:      'flex',
          alignItems:   'center',
          gap:          '6px',
        }}
      >
        📁 File Dev {loading ? '⏳' : ''} {error ? '❌' : ''}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position:     'absolute',
            bottom:       '36px',
            left:         '0',
            background:   '#0f172a',
            color:        '#e2e8f0',
            border:       '1px solid #334155',
            borderRadius: '12px',
            width:        '420px',
            maxHeight:    '500px',
            display:      'flex',
            flexDirection:'column',
            overflow:     'hidden',
            boxShadow:    '0 12px 40px rgba(0,0,0,0.4)',
          }}
        >
          {/* Header */}
          <div style={{
            padding:        '10px 14px',
            borderBottom:   '1px solid #1e293b',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontWeight: 700, color: '#60a5fa' }}>📁 File Monitor (DEV)</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['files', 'uploads', 'stats'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background:   tab === t ? '#1d4ed8' : '#1e293b',
                    border:       'none',
                    borderRadius: '4px',
                    color:        tab === t ? '#fff' : '#94a3b8',
                    padding:      '3px 8px',
                    cursor:       'pointer',
                    fontSize:     '10px',
                    fontFamily:   'monospace',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>

            {/* Files tab */}
            {tab === 'files' && (
              <div>
                <div style={{ color: '#94a3b8', marginBottom: '6px' }}>
                  folder: {currentFolder ?? 'root'} | files: {files.length} | folders: {folders.length} | selected: {selectedIds.length}
                </div>
                {files.slice(0, 20).map((f) => (
                  <div key={f.id} style={{
                    borderBottom:  '1px solid #1e293b',
                    padding:       '5px 0',
                    display:       'flex',
                    gap:           '8px',
                    alignItems:    'flex-start',
                  }}>
                    <span style={{ color: '#60a5fa', flexShrink: 0 }}>{f.file_type?.slice(0, 4)}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e2e8f0' }}>
                      {f.name}
                    </span>
                    <span style={{ color: '#94a3b8', flexShrink: 0 }}>{formatFileSize(f.size_bytes)}</span>
                    <span style={{
                      color:      f.status === 'active' ? '#4ade80' : '#f87171',
                      flexShrink: 0,
                    }}>
                      {f.status}
                    </span>
                  </div>
                ))}
                {files.length === 0 && (
                  <div style={{ color: '#475569' }}>No files in current view.</div>
                )}
              </div>
            )}

            {/* Uploads tab */}
            {tab === 'uploads' && (
              <div>
                <div style={{ color: '#94a3b8', marginBottom: '6px' }}>
                  total jobs: {uploadJobs.length}
                </div>
                {uploadJobs.map((j) => (
                  <div key={j.id} style={{
                    borderBottom: '1px solid #1e293b',
                    padding:      '5px 0',
                  }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{
                        color: j.status === 'done' ? '#4ade80' : j.status === 'error' ? '#f87171' : '#60a5fa',
                        flexShrink: 0,
                      }}>
                        {j.status}
                      </span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e2e8f0' }}>
                        {j.file?.name ?? j.id}
                      </span>
                      <span style={{ color: '#94a3b8', flexShrink: 0 }}>{j.progress ?? 0}%</span>
                    </div>
                    {j.error && (
                      <div style={{ color: '#f87171', marginTop: '2px' }}>{j.error}</div>
                    )}
                  </div>
                ))}
                {uploadJobs.length === 0 && (
                  <div style={{ color: '#475569' }}>No upload jobs.</div>
                )}
              </div>
            )}

            {/* Stats tab */}
            {tab === 'stats' && storageStats && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {[
                  ['Total bytes',    formatFileSize(storageStats.totalBytes)],
                  ['Quota',          formatFileSize(storageStats.quotaBytes)],
                  ['File count',     storageStats.fileCount],
                  ...Object.entries(storageStats.byType ?? {}).map(([t, b]) => [t, formatFileSize(b)]),
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ color: '#94a3b8', minWidth: '110px', flexShrink: 0 }}>{k}</span>
                    <span style={{ color: '#e2e8f0' }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div style={{
            borderTop: '1px solid #1e293b',
            padding:   '8px 14px',
            display:   'flex',
            gap:       '8px',
          }}>
            <ActionBtn label="Reload" onClick={() => loadFiles(DEV_USER_ID, currentFolder)} />
            <ActionBtn label="Clear Mock" onClick={handleClear} danger />
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({ label, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        background:   danger ? '#7f1d1d' : '#1e293b',
        color:        danger ? '#fca5a5' : '#94a3b8',
        border:       '1px solid ' + (danger ? '#991b1b' : '#334155'),
        borderRadius: '4px',
        padding:      '4px 10px',
        cursor:       'pointer',
        fontSize:     '10px',
        fontFamily:   'monospace',
      }}
    >
      {label}
    </button>
  );
}

// ── Conditional export ────────────────────────────────────────
const isDevMode = USE_MOCK || import.meta.env.DEV;
const DevFileMonitor = isDevMode ? _DevFileMonitor : _DevFileMonitorNull;
export default DevFileMonitor;
