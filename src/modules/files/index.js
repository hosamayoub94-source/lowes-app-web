// =============================================================
// File Module — Public API
//
// Import only from here in other modules / pages.
// Internal service / store details stay private.
// =============================================================

// ── Types & constants ─────────────────────────────────────────
export {
  FILE_TYPE,
  FILE_STATUS,
  FILE_PERMISSION,
  FILE_ACTION,
  UPLOAD_STATUS,
  VIEW_MODE,
  SORT_BY,
  resolveFileType,
  formatFileSize,
  FILE_TYPE_ICON,
  FILE_TYPE_LABELS,
  FILE_TYPE_COLORS,
  UPLOAD_STATUS_LABELS,
  STORAGE_BUCKET,
  MAX_FILE_SIZE_BYTES,
  CHUNK_SIZE_BYTES,
  MAX_PREVIEW_SIZE_BYTES,
} from './types/files.types';

// ── Services (used by advanced consumers) ────────────────────
export {
  uploadFile,
  trashFile,
  deleteFile,
  restoreFile,
  renameFile,
  moveFile,
  createFolder,
  deleteFolder,
  fetchFiles,
  fetchFolders,
  fetchAllFolders,
  fetchRecentFiles,
  fetchTrashedFiles,
  fetchStorageStats,
  shareFile,
  generateSignedUrl,
  clearMockFiles,
  USE_MOCK,
} from './services/fileService';

export {
  enqueueUpload,
  enqueueUploads,
  getUploadQueue,
  getActiveUploads,
  clearCompletedUploads,
  getUploadStats,
  setUploadQueueListener,
} from './services/uploadService';

// ── Store ─────────────────────────────────────────────────────
export { default as useFileStore } from './store/useFileStore';

// ── Hooks ─────────────────────────────────────────────────────
export {
  useFiles,
  useFolders,
  useCurrentFolderId,
  useSelectedIds,
  useViewMode,
  useSortBy,
  useSortAsc,
  useFileSearch,
  useFileLoading,
  useFileError,
  useUploadJobs,
  useStorageStats,
  useSortedFiles,
  useSelectedFiles,
  useCurrentFolder,
  useBreadcrumb,
  useSelectionCount,
  useHasSelection,
  useActiveUploads,
  useActiveUploadCount,
  useUploadErrorCount,
  useSetCurrentFolder,
  useSetViewMode,
  useSetSortBy,
  useSetSearch,
  useToggleSelect,
  useSelectAll,
  useClearSelection,
  useUploadFiles,
  useTrashFile,
  useDeleteFile,
  useRestoreFile,
  useRenameFile,
  useMoveFile,
  useCreateFolder,
  useClearFileError,
  useRefreshFiles,
  useFileInit,
  useSearchRefresh,
  useFilePolling,
} from './hooks/useFiles';

// ── Event bus integration ─────────────────────────────────────
export {
  bootFileIntegration,
  teardownFileIntegration,
  emitFileUploaded,
  emitFileUploadFailed,
  emitFileTrashed,
  emitFileDeleted,
  emitFileRestored,
  emitFileShared,
  emitFileRenamed,
  emitFileMoved,
  emitFolderCreated,
} from './integrations/fileEventBus';

// ── UI Components ─────────────────────────────────────────────
export { default as FileUploader }    from './components/FileUploader';
export { default as UploadProgress }  from './components/UploadProgress';
export { default as FilePreview }     from './components/FilePreview';
export { default as FileGrid }        from './components/FileGrid';
export { default as FileList }        from './components/FileList';
export { default as FolderTree }      from './components/FolderTree';
export { default as FileActionsMenu } from './components/FileActionsMenu';

// ── Pages ─────────────────────────────────────────────────────
export { default as FileManagerDashboard } from './pages/FileManagerDashboard';

// ── Dev ───────────────────────────────────────────────────────
export { default as DevFileMonitor } from './monitor/DevFileMonitor';
