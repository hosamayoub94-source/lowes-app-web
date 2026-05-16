// =============================================================
// File Module — Zustand Store
//
// Single source of truth for:
//   • Files + folders in the current view
//   • Selection, view mode, sort, and search state
//   • Active upload jobs (wired to uploadService queue)
//   • Storage usage statistics
//   • Realtime subscription management
//
// Design rules:
//   - Store holds plain data, zero business logic.
//   - All writes go through the service layer first, then
//     the store action mirrors the result.
//   - Upload progress is pushed in via setUploadQueueListener —
//     the store never imports uploadService at module level to
//     avoid circular dependencies.
//   - Realtime patches files[] in place without full refetch.
// =============================================================
import { create }               from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { supabase }              from '@services/supabase';
import {
  fetchFiles,
  fetchFolders,
  fetchAllFolders,
  fetchStorageStats,
  trashFile    as svcTrashFile,
  deleteFile   as svcDeleteFile,
  restoreFile  as svcRestoreFile,
  renameFile   as svcRenameFile,
  moveFile     as svcMoveFile,
  createFolder as svcCreateFolder,
  USE_MOCK,
} from '../services/fileService';
import {
  VIEW_MODE,
  SORT_BY,
  FILE_STATUS,
} from '../types/files.types';

// ── Store ─────────────────────────────────────────────────────

const useFileStore = create()(
  subscribeWithSelector((set, get) => ({

    // ── State ─────────────────────────────────────────────────

    /** Files array for the current folder view */
    files: [],

    /** All folders for the current user (flat list for tree / breadcrumb) */
    folders: [],

    /** ID of the folder currently being browsed (null = root) */
    currentFolderId: null,

    /** Set of selected file IDs */
    selectedIds: [],

    /** 'grid' | 'list' */
    viewMode: VIEW_MODE.GRID,

    /** Sort field (from SORT_BY constants) */
    sortBy: SORT_BY.DATE,

    /** Sort direction */
    sortAsc: false,

    /** Search string applied to file names */
    search: '',

    /** True while any async operation is running */
    loading: false,

    /** Error message string or null */
    error: null,

    /** Live upload job snapshots (pushed from uploadService) */
    uploadJobs: [],

    /** Storage usage for current user */
    storageStats: null,

    /** Current user ID (set when store is initialised) */
    _userId: null,

    /** Realtime channel reference (Supabase only) */
    _realtimeChannel: null,

    // ── Internal helpers ──────────────────────────────────────

    /** Patch a single file in files[] by id. Creates if not present. */
    _patchFile(incoming) {
      set((state) => {
        const idx = state.files.findIndex((f) => f.id === incoming.id);
        if (idx === -1) {
          // New file (inserted via realtime) — add if it belongs here
          if (incoming.folder_id === state.currentFolderId &&
              incoming.status    === FILE_STATUS.ACTIVE) {
            return { files: [incoming, ...state.files] };
          }
          return {};
        }
        const next = [...state.files];
        next[idx]  = { ...next[idx], ...incoming };
        return { files: next };
      });
    },

    /** Remove a file from files[] by id. */
    _removeFile(fileId) {
      set((state) => ({ files: state.files.filter((f) => f.id !== fileId) }));
    },

    // ── Navigation ────────────────────────────────────────────

    /**
     * Navigate into a folder (or back to root with null).
     * Automatically loads files for the new location.
     *
     * @param {string|null} folderId
     */
    async setCurrentFolder(folderId) {
      set({ currentFolderId: folderId, selectedIds: [], search: '' });
      const userId = get()._userId;
      if (userId) await get().loadFiles(userId, folderId);
    },

    setViewMode(mode)    { set({ viewMode: mode }); },
    setSortBy(field, asc = false) { set({ sortBy: field, sortAsc: asc }); },
    setSearch(str)       { set({ search: str }); },
    clearError()         { set({ error: null }); },

    // ── Selection ─────────────────────────────────────────────

    /** Toggle a single file's selection. */
    toggleSelect(fileId) {
      set((state) => {
        const has = state.selectedIds.includes(fileId);
        return {
          selectedIds: has
            ? state.selectedIds.filter((id) => id !== fileId)
            : [...state.selectedIds, fileId],
        };
      });
    },

    /** Select all files in the current view. */
    selectAll() {
      set((state) => ({ selectedIds: state.files.map((f) => f.id) }));
    },

    /** Clear the entire selection. */
    clearSelection() {
      set({ selectedIds: [] });
    },

    // ── Load data ─────────────────────────────────────────────

    /**
     * Load files for a specific folder (or root), plus all folders tree.
     *
     * @param {string}      userId
     * @param {string|null} [folderId]  defaults to currentFolderId
     */
    async loadFiles(userId, folderId) {
      const folder = folderId !== undefined ? folderId : get().currentFolderId;
      set({ loading: true, error: null, _userId: userId });

      try {
        const { search } = get();
        const [files, folders, storageStats] = await Promise.all([
          fetchFiles({ userId, folderId: folder, search }),
          fetchAllFolders(userId),
          fetchStorageStats(userId),
        ]);
        set({ files, folders, storageStats, loading: false });
      } catch (err) {
        set({ error: err.message, loading: false });
      }
    },

    /** Refresh only the files list (no folder/stats reload). */
    async refreshFiles() {
      const { _userId, currentFolderId, search } = get();
      if (!_userId) return;
      try {
        const files = await fetchFiles({ userId: _userId, folderId: currentFolderId, search });
        set({ files });
      } catch (err) {
        set({ error: err.message });
      }
    },

    /** Refresh storage stats. */
    async refreshStats() {
      const userId = get()._userId;
      if (!userId) return;
      try {
        const storageStats = await fetchStorageStats(userId);
        set({ storageStats });
      } catch { /* non-critical */ }
    },

    // ── Upload ────────────────────────────────────────────────

    /**
     * Enqueue one or more files for upload.
     * Dynamically imports uploadService to avoid circular deps.
     *
     * @param {File[]}  files
     * @param {object}  [opts]   forwarded to enqueueUploads
     * @returns {Promise<UploadJob[]>}
     */
    async uploadFiles(files, opts = {}) {
      const userId   = get()._userId;
      const folderId = get().currentFolderId;

      const { enqueueUploads, setUploadQueueListener } = await import('../services/uploadService');

      // Wire listener once — idempotent because we overwrite each time
      setUploadQueueListener((jobs) => {
        set({ uploadJobs: jobs });
        // When a job completes, patch the new file record into the current view
        jobs
          .filter((j) => j.status === 'done' && j.result)
          .forEach((j) => {
            if (j.result.folder_id === get().currentFolderId) {
              get()._patchFile(j.result);
            }
          });
      });

      return enqueueUploads(files, { userId, folderId, ...opts });
    },

    // ── File mutations ────────────────────────────────────────

    /**
     * Move a file to trash.
     * @param {string} fileId
     */
    async trashFile(fileId) {
      const userId = get()._userId;
      set({ loading: true, error: null });
      try {
        await svcTrashFile(fileId, userId);
        get()._removeFile(fileId);
        set({ loading: false, selectedIds: get().selectedIds.filter((id) => id !== fileId) });
      } catch (err) {
        set({ error: err.message, loading: false });
        throw err;
      }
    },

    /**
     * Permanently delete a file.
     * @param {string} fileId
     */
    async deleteFile(fileId) {
      const userId = get()._userId;
      set({ loading: true, error: null });
      try {
        await svcDeleteFile(fileId, userId);
        get()._removeFile(fileId);
        set({ loading: false, selectedIds: get().selectedIds.filter((id) => id !== fileId) });
      } catch (err) {
        set({ error: err.message, loading: false });
        throw err;
      }
    },

    /**
     * Restore a trashed file.
     * @param {string} fileId
     */
    async restoreFile(fileId) {
      const userId = get()._userId;
      set({ loading: true, error: null });
      try {
        const updated = await svcRestoreFile(fileId, userId);
        get()._patchFile(updated);
        set({ loading: false });
        return updated;
      } catch (err) {
        set({ error: err.message, loading: false });
        throw err;
      }
    },

    /**
     * Rename a file.
     * @param {string} fileId
     * @param {string} newName
     */
    async renameFile(fileId, newName) {
      const userId = get()._userId;
      set({ loading: true, error: null });
      try {
        const updated = await svcRenameFile(fileId, newName, userId);
        get()._patchFile(updated);
        set({ loading: false });
        return updated;
      } catch (err) {
        set({ error: err.message, loading: false });
        throw err;
      }
    },

    /**
     * Move a file to a different folder.
     * @param {string}      fileId
     * @param {string|null} targetFolderId
     */
    async moveFile(fileId, targetFolderId) {
      const userId = get()._userId;
      set({ loading: true, error: null });
      try {
        const updated = await svcMoveFile(fileId, targetFolderId, userId);
        // Remove from current view if it moved away
        if (updated.folder_id !== get().currentFolderId) {
          get()._removeFile(fileId);
        } else {
          get()._patchFile(updated);
        }
        set({ loading: false });
        return updated;
      } catch (err) {
        set({ error: err.message, loading: false });
        throw err;
      }
    },

    // ── Folder mutations ──────────────────────────────────────

    /**
     * Create a new folder inside the current folder.
     * @param {string} name
     */
    async createFolder(name) {
      const userId   = get()._userId;
      const parentId = get().currentFolderId;
      set({ loading: true, error: null });
      try {
        const folder = await svcCreateFolder(name, parentId, userId);
        set((state) => ({ folders: [...state.folders, folder], loading: false }));
        return folder;
      } catch (err) {
        set({ error: err.message, loading: false });
        throw err;
      }
    },

    // ── Realtime ──────────────────────────────────────────────

    /**
     * Subscribe to Supabase realtime for files table.
     * Patches the store on INSERT / UPDATE / DELETE.
     * No-op in mock mode.
     *
     * @param {string} userId  Filter events to owner's files.
     */
    subscribeRealtime(userId) {
      if (USE_MOCK) return;
      if (get()._realtimeChannel) return; // already subscribed

      const channel = supabase
        .channel('files_realtime')
        .on(
          'postgres_changes',
          {
            event:  '*',
            schema: 'public',
            table:  'files',
            filter: `owner_id=eq.${userId}`,
          },
          (payload) => {
            const { eventType, new: newRow, old: oldRow } = payload;

            if (eventType === 'DELETE') {
              get()._removeFile(oldRow.id);
              return;
            }

            const record = newRow;
            if (!record) return;

            // Remove from view if trashed/deleted
            if (record.status !== FILE_STATUS.ACTIVE) {
              get()._removeFile(record.id);
              return;
            }

            get()._patchFile(record);
          },
        )
        .subscribe();

      set({ _realtimeChannel: channel });
    },

    /** Unsubscribe and clean up the realtime channel. */
    unsubscribeRealtime() {
      const ch = get()._realtimeChannel;
      if (ch) {
        supabase.removeChannel(ch);
        set({ _realtimeChannel: null });
      }
    },

    // ── Computed selectors (used by hooks) ────────────────────

    /** Returns the full file objects for all selectedIds. */
    getSelectedFiles() {
      const { files, selectedIds } = get();
      return files.filter((f) => selectedIds.includes(f.id));
    },

    /** Returns the folder object for currentFolderId (or null for root). */
    getCurrentFolder() {
      const { folders, currentFolderId } = get();
      if (!currentFolderId) return null;
      return folders.find((f) => f.id === currentFolderId) ?? null;
    },

    /**
     * Returns breadcrumb path from root to currentFolderId.
     * Each item: { id, name }
     *
     * @returns {{ id: string|null, name: string }[]}
     */
    getBreadcrumb() {
      const { folders, currentFolderId } = get();
      if (!currentFolderId) return [];

      const crumbs = [];
      let current  = folders.find((f) => f.id === currentFolderId);
      while (current) {
        crumbs.unshift({ id: current.id, name: current.name });
        current = current.parent_id
          ? folders.find((f) => f.id === current.parent_id)
          : null;
      }
      return crumbs;
    },

    /** Files sorted + filtered (client-side for current view). */
    getSortedFiles() {
      const { files, sortBy, sortAsc } = get();
      return [...files].sort((a, b) => {
        let aVal = a[sortBy] ?? '';
        let bVal = b[sortBy] ?? '';
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();
        if (aVal < bVal) return sortAsc ? -1 : 1;
        if (aVal > bVal) return sortAsc ?  1 : -1;
        return 0;
      });
    },
  })),
);

export default useFileStore;
