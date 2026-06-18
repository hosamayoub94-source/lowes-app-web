// =============================================================
// File Module — File Service
//
// All CRUD operations for files + folders, backed by:
//   • Supabase Storage (binary blobs)
//   • Supabase DB (metadata, permissions, activity)
//
// Mock mode: in-memory store persisted to localStorage.
//   No real file blobs stored — metadata only.
//   Use clearMockFiles() + seedDemoFiles() for dev reset.
// =============================================================
import { supabase } from '@services/supabase';
import {
  FILE_TYPE,
  FILE_STATUS,
  FILE_ACTION,
  STORAGE_BUCKET,
  SIGNED_URL_EXPIRES_IN,
  URL_CACHE_TTL_MS,
  MAX_FILE_SIZE_BYTES,
  DEMO_FILES,
  DEMO_FOLDERS,
  resolveFileType,
} from '../types/files.types';

const FILES_TABLE    = 'files';
const FOLDERS_TABLE  = 'file_folders';
const VERSIONS_TABLE = 'file_versions';
const SHARES_TABLE   = 'file_shares';
const ACTIVITY_TABLE = 'file_activity';

// ── Mock flag ─────────────────────────────────────────────────
const _mockFlag = String(import.meta.env.VITE_USE_MOCK_FILES ?? '').toLowerCase();
export const USE_MOCK = _mockFlag === 'true';

// ── Mock store ────────────────────────────────────────────────
const MOCK_KEY_FILES   = '__mock_files';
const MOCK_KEY_FOLDERS = '__mock_folders';

function _loadMock(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function _saveMock(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* full */ }
}

let _mockFiles   = _loadMock(MOCK_KEY_FILES,   null);
let _mockFolders = _loadMock(MOCK_KEY_FOLDERS, null);

// Seed demo data on first load
if (!_mockFiles) {
  const now = new Date().toISOString();
  _mockFiles = DEMO_FILES.map((f) => ({
    ...f,
    owner_id:      'user_current',
    storage_path:  `user_current/${f.id}/${f.name}`,
    bucket:        STORAGE_BUCKET,
    latest_version: f.version,
    description:   null,
    tags:          [],
    metadata:      {},
    thumbnail_path: null,
    created_at:    now,
    updated_at:    now,
  }));
  _saveMock(MOCK_KEY_FILES, _mockFiles);
}
if (!_mockFolders) {
  const now = new Date().toISOString();
  _mockFolders = DEMO_FOLDERS.map((f) => ({
    ...f,
    parent_id:  null,
    owner_id:   'user_current',
    path:       `/${f.name}`,
    is_deleted: false,
    metadata:   {},
    created_at: now,
    updated_at: now,
  }));
  _saveMock(MOCK_KEY_FOLDERS, _mockFolders);
}

// ── Signed URL cache ─────────────────────────────────────────
// { storagePath → { url, expiresAt } }
const _urlCache = new Map();

function _getCachedUrl(storagePath) {
  const entry = _urlCache.get(storagePath);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _urlCache.delete(storagePath); return null; }
  return entry.url;
}
function _setCachedUrl(storagePath, url) {
  _urlCache.set(storagePath, { url, expiresAt: Date.now() + URL_CACHE_TTL_MS });
}

// ── Helpers ───────────────────────────────────────────────────
function _now() { return new Date().toISOString(); }
function _uuid() { return `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }

async function _logActivity(fileId, folderId, userId, action, metadata = {}) {
  if (USE_MOCK) return;
  try {
    await supabase.from(ACTIVITY_TABLE).insert({
      file_id: fileId, folder_id: folderId, user_id: userId, action, metadata,
    });
  } catch { /* non-critical */ }
}

// ── uploadFile ────────────────────────────────────────────────

/**
 * Upload a single File object to Supabase Storage + create DB record.
 *
 * @param {File}   file
 * @param {object} opts
 * @param {string}   opts.userId
 * @param {string}   [opts.folderId]
 * @param {string}   [opts.description]
 * @param {string[]} [opts.tags]
 * @param {Function} [opts.onProgress]  (percent: number) => void
 * @returns {Promise<object>} file record
 */
export async function uploadFile(file, opts = {}) {
  const { userId, folderId = null, description = null, tags = [], onProgress } = opts;

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`الملف أكبر من الحد المسموح به (${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB)`);
  }

  const fileType    = resolveFileType(file.type);
  const storagePath = `${userId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;

  // ── Mock ──────────────────────────────────────────────────
  if (USE_MOCK) {
    // Simulate progress
    if (onProgress) {
      for (let p = 10; p <= 100; p += 30) {
        await new Promise((r) => setTimeout(r, 120));
        onProgress(Math.min(p, 100));
      }
    }

    const record = {
      id:             _uuid(),
      name:           file.name,
      original_name:  file.name,
      folder_id:      folderId,
      owner_id:       userId,
      storage_path:   storagePath,
      bucket:         STORAGE_BUCKET,
      size_bytes:     file.size,
      mime_type:      file.type,
      file_type:      fileType,
      status:         FILE_STATUS.ACTIVE,
      is_deleted:     false,
      deleted_at:     null,
      version:        1,
      latest_version: 1,
      thumbnail_path: null,
      description,
      tags,
      metadata:       {},
      created_at:     _now(),
      updated_at:     _now(),
    };

    _mockFiles.push(record);
    _saveMock(MOCK_KEY_FILES, _mockFiles);
    return record;
  }

  // ── Supabase ──────────────────────────────────────────────
  const uploadOpts = {
    cacheControl: '3600',
    upsert: false,
    ...(onProgress
      ? {
          onUploadProgress: (evt) => {
            if (evt.lengthComputable) onProgress(Math.round((evt.loaded / evt.total) * 100));
          },
        }
      : {}),
  };

  const { error: storageErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, uploadOpts);

  if (storageErr) throw storageErr;

  const { data: record, error: dbErr } = await supabase
    .from(FILES_TABLE)
    .insert({
      name: file.name, original_name: file.name, folder_id: folderId,
      owner_id: userId, storage_path: storagePath, bucket: STORAGE_BUCKET,
      size_bytes: file.size, mime_type: file.type, file_type: fileType,
      description, tags,
    })
    .select()
    .single();

  if (dbErr) {
    // Rollback storage if DB insert failed
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
    throw dbErr;
  }

  await _logActivity(record.id, folderId, userId, FILE_ACTION.UPLOADED, { size: file.size });
  return record;
}

// ── deleteFile (soft → trash) ─────────────────────────────────

/**
 * Move a file to the trash (recoverable).
 * @param {string} fileId
 * @param {string} userId
 */
export async function trashFile(fileId, userId) {
  if (USE_MOCK) {
    const f = _mockFiles.find((x) => x.id === fileId);
    if (!f) throw new Error('الملف غير موجود');
    f.status     = FILE_STATUS.TRASHED;
    f.deleted_at = _now();
    f.updated_at = _now();
    _saveMock(MOCK_KEY_FILES, _mockFiles);
    return f;
  }

  const { data, error } = await supabase
    .from(FILES_TABLE)
    .update({ status: FILE_STATUS.TRASHED, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', fileId)
    .eq('owner_id', userId)
    .select().single();

  if (error) throw error;
  await _logActivity(fileId, null, userId, FILE_ACTION.TRASHED);
  return data;
}

/**
 * Permanently delete a file (removes storage + DB record).
 * @param {string} fileId
 * @param {string} userId
 */
export async function deleteFile(fileId, userId) {
  if (USE_MOCK) {
    const idx = _mockFiles.findIndex((x) => x.id === fileId);
    if (idx === -1) throw new Error('الملف غير موجود');
    const [removed] = _mockFiles.splice(idx, 1);
    _saveMock(MOCK_KEY_FILES, _mockFiles);
    return removed;
  }

  const { data: file, error: fetchErr } = await supabase
    .from(FILES_TABLE).select('storage_path, folder_id').eq('id', fileId).eq('owner_id', userId).single();
  if (fetchErr) throw fetchErr;

  // Remove from storage
  await supabase.storage.from(STORAGE_BUCKET).remove([file.storage_path]);

  const { error } = await supabase.from(FILES_TABLE).delete().eq('id', fileId).eq('owner_id', userId);
  if (error) throw error;

  await _logActivity(fileId, file.folder_id, userId, FILE_ACTION.DELETED);
}

// ── restoreFile ───────────────────────────────────────────────

/**
 * Restore a trashed file back to active.
 */
export async function restoreFile(fileId, userId) {
  if (USE_MOCK) {
    const f = _mockFiles.find((x) => x.id === fileId);
    if (!f) throw new Error('الملف غير موجود');
    f.status     = FILE_STATUS.ACTIVE;
    f.deleted_at = null;
    f.updated_at = _now();
    _saveMock(MOCK_KEY_FILES, _mockFiles);
    return f;
  }

  const { data, error } = await supabase
    .from(FILES_TABLE)
    .update({ status: FILE_STATUS.ACTIVE, deleted_at: null, updated_at: new Date().toISOString() })
    .eq('id', fileId).eq('owner_id', userId)
    .select().single();

  if (error) throw error;
  await _logActivity(fileId, null, userId, FILE_ACTION.RESTORED);
  return data;
}

// ── generateSignedUrl ─────────────────────────────────────────

/**
 * Generate a time-limited signed URL for a file.
 * Cached for URL_CACHE_TTL_MS.
 *
 * @param {string} storagePath
 * @param {number} [expiresIn]  seconds
 * @returns {Promise<string>} url
 */
export async function generateSignedUrl(storagePath, expiresIn = SIGNED_URL_EXPIRES_IN) {
  const cached = _getCachedUrl(storagePath);
  if (cached) return cached;

  if (USE_MOCK) {
    const url = `https://mock-storage.example.com/${storagePath}?token=mock&exp=${Date.now() + expiresIn * 1000}`;
    _setCachedUrl(storagePath, url);
    return url;
  }

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) throw error;
  _setCachedUrl(storagePath, data.signedUrl);
  return data.signedUrl;
}

// ── renameFile ────────────────────────────────────────────────

export async function renameFile(fileId, newName, userId) {
  if (USE_MOCK) {
    const f = _mockFiles.find((x) => x.id === fileId);
    if (!f) throw new Error('الملف غير موجود');
    f.name       = newName;
    f.updated_at = _now();
    _saveMock(MOCK_KEY_FILES, _mockFiles);
    return f;
  }

  const { data, error } = await supabase
    .from(FILES_TABLE).update({ name: newName, updated_at: new Date().toISOString() })
    .eq('id', fileId).eq('owner_id', userId).select().single();

  if (error) throw error;
  await _logActivity(fileId, null, userId, FILE_ACTION.RENAMED, { newName });
  return data;
}

// ── moveFile ──────────────────────────────────────────────────

export async function moveFile(fileId, targetFolderId, userId) {
  if (USE_MOCK) {
    const f = _mockFiles.find((x) => x.id === fileId);
    if (!f) throw new Error('الملف غير موجود');
    f.folder_id  = targetFolderId;
    f.updated_at = _now();
    _saveMock(MOCK_KEY_FILES, _mockFiles);
    return f;
  }

  const { data, error } = await supabase
    .from(FILES_TABLE).update({ folder_id: targetFolderId, updated_at: new Date().toISOString() })
    .eq('id', fileId).eq('owner_id', userId).select().single();

  if (error) throw error;
  await _logActivity(fileId, targetFolderId, userId, FILE_ACTION.MOVED, { targetFolderId });
  return data;
}

// ── createFolder ──────────────────────────────────────────────

export async function createFolder(name, parentId = null, userId) {
  const path = parentId ? null : `/${name}`; // simplified — deep paths handled by app

  if (USE_MOCK) {
    const folder = {
      id:         _uuid(),
      name,
      parent_id:  parentId,
      owner_id:   userId,
      path:       path ?? `/${name}`,
      color:      null,
      is_deleted: false,
      metadata:   {},
      created_at: _now(),
      updated_at: _now(),
    };
    _mockFolders.push(folder);
    _saveMock(MOCK_KEY_FOLDERS, _mockFolders);
    return folder;
  }

  const { data, error } = await supabase
    .from(FOLDERS_TABLE)
    .insert({ name, parent_id: parentId, owner_id: userId, path: path ?? `/${name}` })
    .select().single();

  if (error) throw error;
  await _logActivity(null, data.id, userId, FILE_ACTION.CREATED_FOLDER, { name });
  return data;
}

// ── deleteFolder ──────────────────────────────────────────────

export async function deleteFolder(folderId, userId) {
  if (USE_MOCK) {
    const idx = _mockFolders.findIndex((x) => x.id === folderId);
    if (idx !== -1) { _mockFolders.splice(idx, 1); _saveMock(MOCK_KEY_FOLDERS, _mockFolders); }
    // Move files in this folder to root
    _mockFiles.filter((f) => f.folder_id === folderId).forEach((f) => { f.folder_id = null; });
    _saveMock(MOCK_KEY_FILES, _mockFiles);
    return;
  }

  const { error } = await supabase
    .from(FOLDERS_TABLE).delete().eq('id', folderId).eq('owner_id', userId);
  if (error) throw error;
}

// ── Fetch helpers ─────────────────────────────────────────────

/** Fetch files in a folder (or root if folderId=null). */
export async function fetchFiles({ folderId = undefined, userId, status = FILE_STATUS.ACTIVE, search = '' } = {}) {
  if (USE_MOCK) {
    let results = _mockFiles.filter((f) => f.owner_id === userId && f.status === status);
    if (folderId !== undefined) results = results.filter((f) => f.folder_id === folderId);
    if (search) results = results.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));
    return results;
  }

  let q = supabase.from(FILES_TABLE).select('*').eq('owner_id', userId).eq('status', status);
  if (folderId !== undefined) q = q.eq('folder_id', folderId);
  if (search) q = q.ilike('name', `%${search}%`);
  q = q.order('created_at', { ascending: false });

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Fetch all folders for a user. */
export async function fetchFolders(userId, parentId = null) {
  if (USE_MOCK) {
    return _mockFolders.filter((f) => f.owner_id === userId && f.parent_id === parentId && !f.is_deleted);
  }

  let q = supabase.from(FOLDERS_TABLE).select('*').eq('owner_id', userId).eq('is_deleted', false);
  if (parentId === null) q = q.is('parent_id', null);
  else q = q.eq('parent_id', parentId);
  q = q.order('name');

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** Fetch all folders (full tree) for a user. */
export async function fetchAllFolders(userId) {
  if (USE_MOCK) {
    return _mockFolders.filter((f) => f.owner_id === userId && !f.is_deleted);
  }

  const { data, error } = await supabase
    .from(FOLDERS_TABLE).select('*').eq('owner_id', userId).eq('is_deleted', false).order('name');
  if (error) throw error;
  return data ?? [];
}

/** Recent files (last 20 updated). */
export async function fetchRecentFiles(userId, limit = 20) {
  if (USE_MOCK) {
    return [..._mockFiles]
      .filter((f) => f.owner_id === userId && f.status === FILE_STATUS.ACTIVE)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, limit);
  }

  const { data, error } = await supabase
    .from(FILES_TABLE).select('*').eq('owner_id', userId).eq('status', FILE_STATUS.ACTIVE)
    .order('updated_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Files in trash. */
export async function fetchTrashedFiles(userId) {
  if (USE_MOCK) {
    return _mockFiles.filter((f) => f.owner_id === userId && f.status === FILE_STATUS.TRASHED);
  }

  const { data, error } = await supabase
    .from(FILES_TABLE).select('*').eq('owner_id', userId).eq('status', FILE_STATUS.TRASHED)
    .order('deleted_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Storage usage stats for current user. */
export async function fetchStorageStats(userId) {
  if (USE_MOCK) {
    const userFiles = _mockFiles.filter((f) => f.owner_id === userId && f.status === FILE_STATUS.ACTIVE);
    const totalBytes = userFiles.reduce((acc, f) => acc + (f.size_bytes ?? 0), 0);
    const byType     = {};
    userFiles.forEach((f) => { byType[f.file_type] = (byType[f.file_type] ?? 0) + f.size_bytes; });
    return { totalBytes, fileCount: userFiles.length, byType, quotaBytes: 5 * 1024 * 1024 * 1024 }; // 5 GB demo
  }

  const { data, error } = await supabase
    .from(FILES_TABLE)
    .select('size_bytes, file_type')
    .eq('owner_id', userId)
    .eq('status', FILE_STATUS.ACTIVE);

  if (error) throw error;
  const files      = data ?? [];
  const totalBytes = files.reduce((a, f) => a + (f.size_bytes ?? 0), 0);
  const byType     = {};
  files.forEach((f) => { byType[f.file_type] = (byType[f.file_type] ?? 0) + f.size_bytes; });
  return { totalBytes, fileCount: files.length, byType, quotaBytes: 5 * 1024 * 1024 * 1024 };
}

/** Share a file with a user. */
export async function shareFile(fileId, targetUserId, permission, actorId) {
  if (USE_MOCK) {
    return { id: _uuid(), file_id: fileId, shared_with: targetUserId, permission, created_by: actorId, created_at: _now() };
  }

  const { data, error } = await supabase
    .from(SHARES_TABLE)
    .upsert({ file_id: fileId, shared_with: targetUserId, permission, created_by: actorId }, { onConflict: 'file_id,shared_with' })
    .select().single();

  if (error) throw error;
  await _logActivity(fileId, null, actorId, FILE_ACTION.SHARED, { targetUserId, permission });
  return data;
}

// ── Dev utilities ─────────────────────────────────────────────

export function clearMockFiles() {
  _mockFiles   = null;
  _mockFolders = null;
  localStorage.removeItem(MOCK_KEY_FILES);
  localStorage.removeItem(MOCK_KEY_FOLDERS);
  // Reload page to re-seed
}
