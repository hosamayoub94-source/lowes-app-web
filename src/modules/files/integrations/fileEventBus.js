// =============================================================
// File Module — Event Bus + Queue + Notification Integration
//
// Bridges the file management service with the rest of the platform:
//
//   1. EVENT BUS  — emits file lifecycle events (uploaded, deleted,
//                   shared, storage quota warning, …).
//   2. QUEUE      — enqueues background jobs (thumbnail generation,
//                   virus scan placeholder, storage stats refresh).
//   3. NOTIFICATIONS — sends targeted alerts via notification service.
//
// Loaded once via bootFileIntegration() in main.jsx.
//
// Rule: NEVER import directly from other feature modules; always
//       use the Event Bus or lazy imports to avoid circular deps.
// =============================================================
import { emit, on } from '@/core/events';
import { EVENTS, EVENT_SOURCES, EVENT_SEVERITY } from '@/core/events/eventTypes';

// Storage quota warning threshold — emit warning at 80 %
const QUOTA_WARNING_PERCENT = 80;

let _unsubs = [];
let _booted = false;

// ── Boot ──────────────────────────────────────────────────────

/**
 * Wire all file → event bus / queue / notification bridges.
 * Safe to call multiple times (idempotent).
 */
export function bootFileIntegration() {
  if (_booted) return;
  _booted = true;

  _wireUploadedEvents();
  _wireUploadFailedEvents();
  _wireDeletedEvents();
  _wireTrashedEvents();
  _wireRestoredEvents();
  _wireSharedEvents();
  _wireStorageQuotaEvents();
}

/**
 * Tear down all listeners (used in tests / hot-reload).
 */
export function teardownFileIntegration() {
  _unsubs.forEach((unsub) => unsub());
  _unsubs = [];
  _booted = false;
}

// ── Upload success bridge ─────────────────────────────────────

function _wireUploadedEvents() {
  _unsubs.push(
    on(EVENTS.FILE_UPLOADED, async (payload) => {
      const { userId, fileName, fileId, folderId, sizeBytes } = payload;
      if (!userId) return;

      // Notify uploader
      await _notify({
        userId,
        title:   'تم رفع الملف بنجاح',
        message: fileName ? `"${fileName}" تم رفعه بنجاح.` : 'تم رفع الملف بنجاح.',
        type:    'file_alert',
      });

      // Enqueue thumbnail generation job via Queue
      if (fileId) {
        await _enqueue('THUMBNAIL_GENERATION', { fileId, folderId, sizeBytes });
      }

      // Check if quota warning should fire after each upload
      if (userId && sizeBytes) {
        await _checkQuotaWarning(userId);
      }
    }),
  );
}

// ── Upload failure bridge ─────────────────────────────────────

function _wireUploadFailedEvents() {
  _unsubs.push(
    on(EVENTS.FILE_UPLOAD_FAILED, async (payload) => {
      const { userId, fileName, errorMessage } = payload;
      if (!userId) return;

      await _notify({
        userId,
        title:   'فشل رفع الملف',
        message: fileName
          ? `فشل رفع "${fileName}": ${errorMessage ?? 'خطأ غير معروف'}`
          : `فشل رفع الملف: ${errorMessage ?? 'خطأ غير معروف'}`,
        type:    'file_alert',
      });
    }),
  );
}

// ── Delete bridge ─────────────────────────────────────────────

function _wireDeletedEvents() {
  _unsubs.push(
    on(EVENTS.FILE_DELETED, async (payload) => {
      const { userId, fileName } = payload;
      if (!userId) return;

      await _notify({
        userId,
        title:   'تم حذف الملف',
        message: fileName ? `تم حذف "${fileName}" نهائياً.` : 'تم حذف الملف نهائياً.',
        type:    'file_alert',
      });
    }),
  );
}

// ── Trash bridge ──────────────────────────────────────────────

function _wireTrashedEvents() {
  _unsubs.push(
    on(EVENTS.FILE_TRASHED, async (payload) => {
      const { userId, fileName } = payload;
      if (!userId) return;

      await _notify({
        userId,
        title:   'الملف في سلة المحذوفات',
        message: fileName
          ? `"${fileName}" نُقل إلى سلة المحذوفات. يمكنك استعادته خلال 30 يوماً.`
          : 'نُقل الملف إلى سلة المحذوفات.',
        type:    'file_alert',
      });
    }),
  );
}

// ── Restore bridge ────────────────────────────────────────────

function _wireRestoredEvents() {
  _unsubs.push(
    on(EVENTS.FILE_RESTORED, async (payload) => {
      const { userId, fileName } = payload;
      if (!userId) return;

      await _notify({
        userId,
        title:   'تم استعادة الملف',
        message: fileName ? `"${fileName}" تمت استعادته بنجاح.` : 'تمت استعادة الملف.',
        type:    'file_alert',
      });
    }),
  );
}

// ── Share bridge ──────────────────────────────────────────────

function _wireSharedEvents() {
  _unsubs.push(
    on(EVENTS.FILE_SHARED, async (payload) => {
      const { userId, targetUserId, fileName, permission } = payload;
      if (!targetUserId) return;

      // Notify the person the file was shared with
      await _notify({
        userId:  targetUserId,
        title:   'تمت مشاركة ملف معك',
        message: fileName
          ? `تمت مشاركة "${fileName}" معك بصلاحية ${_permissionLabel(permission)}.`
          : `تمت مشاركة ملف معك بصلاحية ${_permissionLabel(permission)}.`,
        type:    'file_alert',
      });
    }),
  );
}

// ── Storage quota bridge ──────────────────────────────────────

function _wireStorageQuotaEvents() {
  _unsubs.push(
    on(EVENTS.STORAGE_QUOTA_WARNING, async (payload) => {
      const { userId, usedPercent } = payload;
      if (!userId) return;

      await _notify({
        userId,
        title:   'تحذير: مساحة التخزين ممتلئة',
        message: `لقد استخدمت ${usedPercent}% من مساحة التخزين. يرجى حذف الملفات غير الضرورية.`,
        type:    'file_alert',
      });
    }),
  );
}

// ── Emit helpers (called by UI / service layer) ───────────────

/**
 * Call after uploadFile() succeeds.
 */
export function emitFileUploaded({ userId, fileId, fileName, folderId, sizeBytes }) {
  emit(
    EVENTS.FILE_UPLOADED,
    { userId, fileId, fileName, folderId, sizeBytes },
    { source: EVENT_SOURCES.FILES },
  );
}

/**
 * Call when an upload job errors out.
 */
export function emitFileUploadFailed({ userId, fileName, errorMessage }) {
  emit(
    EVENTS.FILE_UPLOAD_FAILED,
    { userId, fileName, errorMessage },
    { source: EVENT_SOURCES.FILES, severity: EVENT_SEVERITY.WARNING },
  );
}

/**
 * Call after trashFile() succeeds.
 */
export function emitFileTrashed({ userId, fileId, fileName }) {
  emit(
    EVENTS.FILE_TRASHED,
    { userId, fileId, fileName },
    { source: EVENT_SOURCES.FILES },
  );
}

/**
 * Call after deleteFile() succeeds (permanent delete).
 */
export function emitFileDeleted({ userId, fileId, fileName }) {
  emit(
    EVENTS.FILE_DELETED,
    { userId, fileId, fileName },
    { source: EVENT_SOURCES.FILES, severity: EVENT_SEVERITY.WARNING },
  );
}

/**
 * Call after restoreFile() succeeds.
 */
export function emitFileRestored({ userId, fileId, fileName }) {
  emit(
    EVENTS.FILE_RESTORED,
    { userId, fileId, fileName },
    { source: EVENT_SOURCES.FILES },
  );
}

/**
 * Call after shareFile() succeeds.
 */
export function emitFileShared({ userId, fileId, fileName, targetUserId, permission }) {
  emit(
    EVENTS.FILE_SHARED,
    { userId, fileId, fileName, targetUserId, permission },
    { source: EVENT_SOURCES.FILES },
  );
}

/**
 * Call after renameFile() succeeds.
 */
export function emitFileRenamed({ userId, fileId, oldName, newName }) {
  emit(
    EVENTS.FILE_RENAMED,
    { userId, fileId, oldName, newName },
    { source: EVENT_SOURCES.FILES },
  );
}

/**
 * Call after moveFile() succeeds.
 */
export function emitFileMoved({ userId, fileId, fileName, targetFolderId }) {
  emit(
    EVENTS.FILE_MOVED,
    { userId, fileId, fileName, targetFolderId },
    { source: EVENT_SOURCES.FILES },
  );
}

/**
 * Call after createFolder() succeeds.
 */
export function emitFolderCreated({ userId, folderId, folderName }) {
  emit(
    EVENTS.FOLDER_CREATED,
    { userId, folderId, folderName },
    { source: EVENT_SOURCES.FILES },
  );
}

// ── Internal helpers ──────────────────────────────────────────

async function _notify({ userId, title, message, type }) {
  try {
    const { sendNotification } = await import(
      '@modules/notifications/services/notificationService'
    );
    await sendNotification({ userId, title, message, type });
  } catch (err) {
    console.warn('[FileIntegration] notification failed:', err.message);
  }
}

async function _enqueue(type, payload) {
  try {
    const { useQueueStore } = await import('@/core/queue/queueStore');
    useQueueStore.getState().enqueue(type, payload);
  } catch (err) {
    console.warn('[FileIntegration] enqueue failed:', err.message);
  }
}

/**
 * Lazy-check if the user is approaching storage quota.
 * Fires STORAGE_QUOTA_WARNING if usage ≥ QUOTA_WARNING_PERCENT.
 */
async function _checkQuotaWarning(userId) {
  try {
    const { fetchStorageStats } = await import('../services/fileService');
    const stats = await fetchStorageStats(userId);
    if (!stats.quotaBytes) return;
    const usedPercent = Math.round((stats.totalBytes / stats.quotaBytes) * 100);
    if (usedPercent >= QUOTA_WARNING_PERCENT) {
      emit(
        EVENTS.STORAGE_QUOTA_WARNING,
        { userId, usedPercent, totalBytes: stats.totalBytes, quotaBytes: stats.quotaBytes },
        { source: EVENT_SOURCES.FILES, severity: EVENT_SEVERITY.WARNING },
      );
    }
  } catch { /* non-critical */ }
}

function _permissionLabel(permission) {
  const map = { read: 'قراءة', edit: 'تعديل', admin: 'إدارة' };
  return map[permission] ?? permission;
}
