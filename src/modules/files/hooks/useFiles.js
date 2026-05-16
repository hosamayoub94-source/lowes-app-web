// =============================================================
// File Module — React Hooks
//
// Thin selectors over useFileStore so components subscribe
// only to the slice they need, minimising re-renders.
// =============================================================
import { useEffect, useCallback } from 'react';
import useFileStore from '../store/useFileStore';

// ── Primitive state selectors ─────────────────────────────────

/** All files in the current view (raw, unsorted). */
export function useFiles()            { return useFileStore((s) => s.files); }

/** All folders (flat tree). */
export function useFolders()          { return useFileStore((s) => s.folders); }

/** Currently browsed folder ID (null = root). */
export function useCurrentFolderId()  { return useFileStore((s) => s.currentFolderId); }

/** Array of selected file IDs. */
export function useSelectedIds()      { return useFileStore((s) => s.selectedIds); }

/** Current view mode ('grid' | 'list'). */
export function useViewMode()         { return useFileStore((s) => s.viewMode); }

/** Current sort field. */
export function useSortBy()           { return useFileStore((s) => s.sortBy); }

/** Current sort direction. */
export function useSortAsc()          { return useFileStore((s) => s.sortAsc); }

/** Current search string. */
export function useFileSearch()       { return useFileStore((s) => s.search); }

/** True while any async operation is in flight. */
export function useFileLoading()      { return useFileStore((s) => s.loading); }

/** Error string or null. */
export function useFileError()        { return useFileStore((s) => s.error); }

/** Live upload job snapshots. */
export function useUploadJobs()       { return useFileStore((s) => s.uploadJobs); }

/** Storage usage stats for current user. */
export function useStorageStats()     { return useFileStore((s) => s.storageStats); }

// ── Computed / derived ────────────────────────────────────────

/** Files sorted by current sortBy / sortAsc settings. */
export function useSortedFiles() {
  return useFileStore((s) => s.getSortedFiles());
}

/** Full file objects for selected IDs. */
export function useSelectedFiles() {
  return useFileStore((s) => s.getSelectedFiles());
}

/** Folder object for the current folder (null at root). */
export function useCurrentFolder() {
  return useFileStore((s) => s.getCurrentFolder());
}

/**
 * Breadcrumb path from root to currentFolderId.
 * @returns {{ id: string|null, name: string }[]}
 */
export function useBreadcrumb() {
  return useFileStore((s) => s.getBreadcrumb());
}

/** Number of currently selected files. */
export function useSelectionCount() {
  return useFileStore((s) => s.selectedIds.length);
}

/** True if any files are selected. */
export function useHasSelection() {
  return useFileStore((s) => s.selectedIds.length > 0);
}

/** Active upload jobs (status: uploading | retrying). */
export function useActiveUploads() {
  return useFileStore((s) =>
    s.uploadJobs.filter(
      (j) => j.status === 'uploading' || j.status === 'retrying',
    ),
  );
}

/** Count of uploads in progress. */
export function useActiveUploadCount() {
  return useFileStore((s) =>
    s.uploadJobs.filter(
      (j) => j.status === 'uploading' || j.status === 'retrying',
    ).length,
  );
}

/** Count of errored upload jobs. */
export function useUploadErrorCount() {
  return useFileStore((s) =>
    s.uploadJobs.filter((j) => j.status === 'error').length,
  );
}

// ── Action hooks ──────────────────────────────────────────────

export function useSetCurrentFolder()  { return useFileStore((s) => s.setCurrentFolder); }
export function useSetViewMode()       { return useFileStore((s) => s.setViewMode); }
export function useSetSortBy()         { return useFileStore((s) => s.setSortBy); }
export function useSetSearch()         { return useFileStore((s) => s.setSearch); }
export function useToggleSelect()      { return useFileStore((s) => s.toggleSelect); }
export function useSelectAll()         { return useFileStore((s) => s.selectAll); }
export function useClearSelection()    { return useFileStore((s) => s.clearSelection); }
export function useUploadFiles()       { return useFileStore((s) => s.uploadFiles); }
export function useTrashFile()         { return useFileStore((s) => s.trashFile); }
export function useDeleteFile()        { return useFileStore((s) => s.deleteFile); }
export function useRestoreFile()       { return useFileStore((s) => s.restoreFile); }
export function useRenameFile()        { return useFileStore((s) => s.renameFile); }
export function useMoveFile()          { return useFileStore((s) => s.moveFile); }
export function useCreateFolder()      { return useFileStore((s) => s.createFolder); }
export function useClearFileError()    { return useFileStore((s) => s.clearError); }
export function useRefreshFiles()      { return useFileStore((s) => s.refreshFiles); }

// ── Compound initialisation hook ──────────────────────────────

/**
 * Initialise the file store for the current user:
 *   1. Load files + folders + stats for the current folder
 *   2. Subscribe to Supabase realtime
 *   3. Unsubscribe on unmount
 *
 * Call once at the top-level FileManagerDashboard / FilesPage.
 *
 * @param {string|null} userId         Authenticated user ID (or null while loading auth)
 * @param {string|null} [initialFolder] Optional folder to start in
 */
export function useFileInit(userId, initialFolder = null) {
  const loadFiles           = useFileStore((s) => s.loadFiles);
  const subscribeRealtime   = useFileStore((s) => s.subscribeRealtime);
  const unsubscribeRealtime = useFileStore((s) => s.unsubscribeRealtime);
  const setCurrentFolder    = useFileStore((s) => s.setCurrentFolder);

  useEffect(() => {
    if (!userId) return;

    // Set initial folder without triggering auto-load (store handles it in loadFiles)
    if (initialFolder !== null) {
      useFileStore.setState({ currentFolderId: initialFolder });
    }

    loadFiles(userId, initialFolder);
    subscribeRealtime(userId);

    return () => {
      unsubscribeRealtime();
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Refresh the current folder's files whenever `search` changes.
 * Debounced to 300 ms to avoid hammering the API on each keystroke.
 *
 * @param {number} [debounceMs]  Defaults to 300
 */
export function useSearchRefresh(debounceMs = 300) {
  const search      = useFileStore((s) => s.search);
  const refreshFiles = useFileStore((s) => s.refreshFiles);

  useEffect(() => {
    const id = setTimeout(refreshFiles, debounceMs);
    return () => clearTimeout(id);
  }, [search, debounceMs]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Periodic refresh of the file list (useful for polling in mock mode
 * or supplementing realtime).
 *
 * @param {number} [intervalMs]  Defaults to 30 000 (30 seconds)
 * @returns {Function}  Manual refresh trigger
 */
export function useFilePolling(intervalMs = 30_000) {
  const refreshFiles = useFileStore((s) => s.refreshFiles);
  const refresh      = useCallback(() => refreshFiles(), [refreshFiles]);

  useEffect(() => {
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return refresh;
}
