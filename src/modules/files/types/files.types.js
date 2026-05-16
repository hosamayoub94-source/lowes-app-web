// =============================================================
// File Module — Types, Constants, Configuration
// Single source of truth. Zero runtime imports.
// =============================================================

// ── File types ────────────────────────────────────────────────
export const FILE_TYPE = Object.freeze({
  IMAGE:       'image',
  PDF:         'pdf',
  DOCUMENT:    'document',
  SPREADSHEET: 'spreadsheet',
  VIDEO:       'video',
  ARCHIVE:     'archive',
  OTHER:       'other',
});

// ── File status ───────────────────────────────────────────────
export const FILE_STATUS = Object.freeze({
  ACTIVE:   'active',
  TRASHED:  'trashed',
  DELETED:  'deleted',
});

// ── Share permissions ─────────────────────────────────────────
export const FILE_PERMISSION = Object.freeze({
  READ:  'read',
  EDIT:  'edit',
  ADMIN: 'admin',
});

// ── Activity actions ─────────────────────────────────────────
export const FILE_ACTION = Object.freeze({
  UPLOADED:   'uploaded',
  DOWNLOADED: 'downloaded',
  DELETED:    'deleted',
  RESTORED:   'restored',
  SHARED:     'shared',
  RENAMED:    'renamed',
  MOVED:      'moved',
  PREVIEWED:  'previewed',
  VERSIONED:  'versioned',
  TRASHED:    'trashed',
  CREATED_FOLDER: 'created_folder',
});

// ── Upload status ─────────────────────────────────────────────
export const UPLOAD_STATUS = Object.freeze({
  PENDING:    'pending',
  UPLOADING:  'uploading',
  PROCESSING: 'processing',
  DONE:       'done',
  ERROR:      'error',
  RETRYING:   'retrying',
  CANCELLED:  'cancelled',
});

// ── View modes ────────────────────────────────────────────────
export const VIEW_MODE = Object.freeze({
  GRID: 'grid',
  LIST: 'list',
});

// ── Sort options ──────────────────────────────────────────────
export const SORT_BY = Object.freeze({
  NAME:       'name',
  DATE:       'created_at',
  MODIFIED:   'updated_at',
  SIZE:       'size_bytes',
  TYPE:       'file_type',
});

// ── MIME type → FILE_TYPE mapping ────────────────────────────
export function resolveFileType(mimeType = '') {
  if (!mimeType) return FILE_TYPE.OTHER;
  if (mimeType.startsWith('image/'))                                       return FILE_TYPE.IMAGE;
  if (mimeType === 'application/pdf')                                      return FILE_TYPE.PDF;
  if (mimeType.includes('word') || mimeType.includes('text/'))            return FILE_TYPE.DOCUMENT;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') ||
      mimeType.includes('csv'))                                            return FILE_TYPE.SPREADSHEET;
  if (mimeType.startsWith('video/'))                                       return FILE_TYPE.VIDEO;
  if (mimeType.includes('zip') || mimeType.includes('rar') ||
      mimeType.includes('tar') || mimeType.includes('7z'))                return FILE_TYPE.ARCHIVE;
  return FILE_TYPE.OTHER;
}

// ── File type → icon emoji ────────────────────────────────────
export const FILE_TYPE_ICON = {
  [FILE_TYPE.IMAGE]:       '🖼',
  [FILE_TYPE.PDF]:         '📄',
  [FILE_TYPE.DOCUMENT]:    '📝',
  [FILE_TYPE.SPREADSHEET]: '📊',
  [FILE_TYPE.VIDEO]:       '🎬',
  [FILE_TYPE.ARCHIVE]:     '🗜',
  [FILE_TYPE.OTHER]:       '📎',
};

// ── File type → Arabic label ──────────────────────────────────
export const FILE_TYPE_LABELS = {
  [FILE_TYPE.IMAGE]:       'صورة',
  [FILE_TYPE.PDF]:         'PDF',
  [FILE_TYPE.DOCUMENT]:    'مستند',
  [FILE_TYPE.SPREADSHEET]: 'جدول بيانات',
  [FILE_TYPE.VIDEO]:       'فيديو',
  [FILE_TYPE.ARCHIVE]:     'مضغوط',
  [FILE_TYPE.OTHER]:       'ملف',
};

// ── File type → color ─────────────────────────────────────────
export const FILE_TYPE_COLORS = {
  [FILE_TYPE.IMAGE]:       '#ec4899',
  [FILE_TYPE.PDF]:         '#ef4444',
  [FILE_TYPE.DOCUMENT]:    '#3b82f6',
  [FILE_TYPE.SPREADSHEET]: '#22c55e',
  [FILE_TYPE.VIDEO]:       '#a855f7',
  [FILE_TYPE.ARCHIVE]:     '#f59e0b',
  [FILE_TYPE.OTHER]:       '#94a3b8',
};

// ── Upload status labels ─────────────────────────────────────
export const UPLOAD_STATUS_LABELS = {
  [UPLOAD_STATUS.PENDING]:    'في الانتظار',
  [UPLOAD_STATUS.UPLOADING]:  'يُرفع',
  [UPLOAD_STATUS.PROCESSING]: 'جاري المعالجة',
  [UPLOAD_STATUS.DONE]:       'تم الرفع',
  [UPLOAD_STATUS.ERROR]:      'خطأ',
  [UPLOAD_STATUS.RETRYING]:   'إعادة المحاولة',
  [UPLOAD_STATUS.CANCELLED]:  'ملغى',
};

// ── Size formatter ────────────────────────────────────────────
export function formatFileSize(bytes = 0) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i     = Math.floor(Math.log(bytes) / Math.log(1024));
  const val   = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${val} ${units[i]}`;
}

// ── Business constants ────────────────────────────────────────
export const STORAGE_BUCKET       = 'files';
export const CHUNK_SIZE_BYTES      = 5 * 1024 * 1024;   // 5 MB per chunk
export const MAX_FILE_SIZE_BYTES   = 500 * 1024 * 1024; // 500 MB hard limit
export const MAX_UPLOAD_RETRIES    = 3;
export const SIGNED_URL_EXPIRES_IN = 60 * 60;           // 1 hour in seconds
export const URL_CACHE_TTL_MS      = 50 * 60 * 1000;    // cache signed URLs 50 min
export const THUMBNAIL_SIZE        = 256;               // px, square
export const MAX_PREVIEW_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB — show preview

// ── Mock demo files ───────────────────────────────────────────
export const DEMO_FOLDERS = [
  { id: 'folder_01', name: 'مستندات',  name_en: 'Documents', color: '#3b82f6' },
  { id: 'folder_02', name: 'صور',      name_en: 'Photos',    color: '#ec4899' },
  { id: 'folder_03', name: 'تقارير',   name_en: 'Reports',   color: '#22c55e' },
];

export const DEMO_FILES = [
  {
    id: 'file_01', name: 'تقرير المبيعات.pdf',  file_type: FILE_TYPE.PDF,
    size_bytes: 2_450_000, folder_id: 'folder_03', status: FILE_STATUS.ACTIVE,
    mime_type: 'application/pdf', version: 2,
  },
  {
    id: 'file_02', name: 'صورة المنتج.jpg',      file_type: FILE_TYPE.IMAGE,
    size_bytes: 870_000,  folder_id: 'folder_02', status: FILE_STATUS.ACTIVE,
    mime_type: 'image/jpeg', version: 1,
  },
  {
    id: 'file_03', name: 'بيانات الموظفين.xlsx', file_type: FILE_TYPE.SPREADSHEET,
    size_bytes: 156_000,  folder_id: 'folder_01', status: FILE_STATUS.ACTIVE,
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', version: 1,
  },
  {
    id: 'file_04', name: 'عرض تقديمي.pdf',       file_type: FILE_TYPE.PDF,
    size_bytes: 5_200_000, folder_id: 'folder_01', status: FILE_STATUS.ACTIVE,
    mime_type: 'application/pdf', version: 1,
  },
  {
    id: 'file_05', name: 'فيديو شرح.mp4',        file_type: FILE_TYPE.VIDEO,
    size_bytes: 48_000_000, folder_id: null,        status: FILE_STATUS.ACTIVE,
    mime_type: 'video/mp4', version: 1,
  },
];
