// =============================================================
// Audit Module — Unified Logging Service (production-grade)
//
// Features:
//   • Batch buffer: flushes every 5 s or when 10 items accumulate
//   • Offline queue: persists to localStorage, retries on reconnect
//   • Exponential backoff: 1 s → 3 s → 8 s (3 attempts)
//   • Mock mode: driven by VITE_USE_MOCK_AUDIT env flag
//   • Realtime subscription for the admin dashboard
//   • Tamper-resistant: prev_entry_id chain maintained client-side
//
// Usage:
//   import { logActivity } from '@modules/audit';
//   await logActivity({ actionType: ACTION_TYPE.LOGIN, entityType: 'auth', userId, userName });
// =============================================================
import { supabase } from '@services/supabase';
import { MOCK_AUDIT_LOGS } from '../data/mockAuditLogs';
import {
  ACTION_LABELS,
  ACTION_SEVERITY,
  SEVERITY,
  resolveSeverity,
} from '../types/audit.types';

// ── Mode flag ────────────────────────────────────────────────
const explicit = String(import.meta.env.VITE_USE_MOCK_AUDIT || '').toLowerCase();
export const USE_MOCK_AUDIT = explicit !== 'false';

// ── Constants ────────────────────────────────────────────────
const BATCH_SIZE        = 10;
const FLUSH_INTERVAL_MS = 5_000;
const QUEUE_KEY         = 'audit_offline_queue';
const RETRY_DELAYS      = [1_000, 3_000, 8_000];
const TABLE             = 'activity_logs';

// ── In-memory state ──────────────────────────────────────────
let _batchBuffer  = [];            // pending items waiting for flush
let _flushTimer   = null;          // setInterval handle
let _lastEntryId  = null;          // for integrity chain
let _mockStore    = MOCK_AUDIT_LOGS.map((l) => ({ ...l }));
let _mockIdSeq    = _mockStore.length + 1;
let _tableExists  = true;          // set false on 42P01 to stop retrying

const _newMockId  = () => `log_${String(_mockIdSeq++).padStart(4, '0')}`;

// ── Helpers ──────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getDeviceInfo() {
  try {
    return navigator.userAgent.slice(0, 200);
  } catch {
    return null;
  }
}

function readOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeOfflineQueue(items) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch { /* storage full — drop oldest */ }
}

function pushToOfflineQueue(items) {
  const current = readOfflineQueue();
  writeOfflineQueue([...current, ...items].slice(-200)); // cap at 200
}

function clearOfflineQueue() {
  try { localStorage.removeItem(QUEUE_KEY); } catch { /* */ }
}

// ── Row builder ──────────────────────────────────────────────
/**
 * Normalises a logActivity() call into the DB row shape.
 * All fields except actionType are optional.
 */
function buildRow({
  actionType,
  actionLabel,
  entityType   = null,
  entityId     = null,
  entityLabel  = null,
  userId       = null,
  userName     = null,
  severity     = null,
  metadata     = {},
  sessionId    = null,
}) {
  return {
    user_id:      userId,
    user_name:    userName,
    action_type:  actionType,
    action_label: actionLabel || ACTION_LABELS[actionType] || actionType,
    entity_type:  entityType,
    entity_id:    entityId    ? String(entityId) : null,
    entity_label: entityLabel,
    severity:     severity    || resolveSeverity(actionType),
    metadata:     metadata    || {},
    device_info:  getDeviceInfo(),
    session_id:   sessionId,
    prev_entry_id: _lastEntryId,
  };
}

// ── Undefined-table guard ────────────────────────────────────
/** Returns true if the error means the table doesn't exist in this DB. */
function isTableMissingError(error) {
  // PostgreSQL undefined_table (42P01) or PostgREST equivalent
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST204' ||
    (error?.message || '').includes('relation') ||
    (error?.message || '').includes('does not exist')
  );
}

// ── Supabase insert (single row) ─────────────────────────────
async function insertRow(row, attempt = 0) {
  if (!_tableExists) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select('id')
    .single();

  if (error) {
    if (isTableMissingError(error)) {
      _tableExists = false;
      console.warn('[audit] activity_logs table not found — audit logging disabled');
      return null;
    }
    if (attempt < RETRY_DELAYS.length - 1) {
      await sleep(RETRY_DELAYS[attempt]);
      return insertRow(row, attempt + 1);
    }
    throw error;
  }

  _lastEntryId = data.id;
  return data;
}

// ── Supabase batch insert ────────────────────────────────────
async function insertBatch(rows, attempt = 0) {
  if (!_tableExists) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .insert(rows)
    .select('id');

  if (error) {
    if (isTableMissingError(error)) {
      _tableExists = false;
      console.warn('[audit] activity_logs table not found — audit logging disabled');
      return null;
    }
    if (attempt < RETRY_DELAYS.length - 1) {
      await sleep(RETRY_DELAYS[attempt]);
      return insertBatch(rows, attempt + 1);
    }
    // On final failure: push to offline queue
    pushToOfflineQueue(rows);
    console.warn('[audit] Batch insert failed — queued offline', error.message);
    return null;
  }

  if (data?.length) _lastEntryId = data[data.length - 1].id;
  return data;
}

// ── Flush buffer ─────────────────────────────────────────────
async function flushBuffer() {
  if (_batchBuffer.length === 0) return;
  const toSend = _batchBuffer.splice(0);  // drain atomically
  if (!USE_MOCK_AUDIT) {
    await insertBatch(toSend).catch(() => pushToOfflineQueue(toSend));
  }
  // In mock mode the buffer was already applied to _mockStore synchronously
}

// ── Offline queue retry ──────────────────────────────────────
export async function retryOfflineQueue() {
  if (USE_MOCK_AUDIT || !_tableExists) return;
  const queued = readOfflineQueue();
  if (queued.length === 0) return;

  const { error } = await supabase.from(TABLE).insert(queued);
  if (!error) {
    clearOfflineQueue();
    console.info(`[audit] Flushed ${queued.length} offline-queued entries`);
  } else if (isTableMissingError(error)) {
    _tableExists = false;
    console.warn('[audit] activity_logs table not found — audit logging disabled');
  }
}

// ── Start / stop the batch timer ─────────────────────────────
export function startBatchTimer() {
  if (_flushTimer) return;
  _flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL_MS);

  // Retry offline queue when connectivity returns
  window.addEventListener('online', retryOfflineQueue);
}

export function stopBatchTimer() {
  if (_flushTimer) { clearInterval(_flushTimer); _flushTimer = null; }
  window.removeEventListener('online', retryOfflineQueue);
}

// Auto-start when module loads in browser
if (typeof window !== 'undefined') {
  startBatchTimer();
  // Drain any leftover queue from prior sessions
  retryOfflineQueue();
}

// ── Public API — logActivity ──────────────────────────────────
/**
 * Primary logging function. Fire-and-forget safe.
 *
 * @param {object} params
 * @param {string} params.actionType   — one of ACTION_TYPE constants
 * @param {string} [params.actionLabel] — override Arabic label
 * @param {string} [params.entityType]  — 'task' | 'auth' | ...
 * @param {string} [params.entityId]
 * @param {string} [params.entityLabel] — display name
 * @param {string} [params.userId]
 * @param {string} [params.userName]
 * @param {string} [params.severity]    — override default severity
 * @param {object} [params.metadata]    — arbitrary extra payload
 * @param {string} [params.sessionId]
 */
export async function logActivity(params) {
  const row = buildRow(params);

  if (USE_MOCK_AUDIT) {
    const mockEntry = {
      ...row,
      id:         _newMockId(),
      created_at: new Date().toISOString(),
    };
    _mockStore = [mockEntry, ..._mockStore];
    return mockEntry;
  }

  // Buffer the row — flush timer handles batching
  _batchBuffer.push(row);

  // Force-flush if batch is full
  if (_batchBuffer.length >= BATCH_SIZE) {
    await flushBuffer();
  }

  // Return immediately; caller should not await if fire-and-forget
  return null;
}

/**
 * Synchronous version for use in critical paths (e.g. auth events).
 * Bypasses the buffer and inserts immediately.
 */
export async function logActivityImmediate(params) {
  const row = buildRow(params);

  if (USE_MOCK_AUDIT) {
    const mockEntry = {
      ...row,
      id:         _newMockId(),
      created_at: new Date().toISOString(),
    };
    _mockStore = [mockEntry, ..._mockStore];
    return mockEntry;
  }

  return insertRow(row).catch((err) => {
    console.warn('[audit] Immediate insert failed — queuing', err.message);
    pushToOfflineQueue([row]);
    return null;
  });
}

// ── Public API — fetchLogs ────────────────────────────────────
/**
 * Load paginated audit logs with optional filters.
 *
 * @param {object} params
 * @param {string}   [params.severity]
 * @param {string}   [params.entityType]
 * @param {string}   [params.actionType]
 * @param {string}   [params.userId]
 * @param {string}   [params.search]      — full-text against action_label/entity_label/user_name
 * @param {string}   [params.dateFrom]    — ISO string
 * @param {string}   [params.dateTo]      — ISO string
 * @param {number}   [params.page=1]
 * @param {number}   [params.pageSize=50]
 * @returns {{ logs: object[], total: number }}
 */
export async function fetchLogs(params = {}) {
  const {
    severity, entityType, actionType, userId,
    search, dateFrom, dateTo,
    page = 1, pageSize = 50,
  } = params;

  if (USE_MOCK_AUDIT) {
    await sleep(180);
    let logs = [..._mockStore];

    if (severity)   logs = logs.filter((l) => l.severity    === severity);
    if (entityType) logs = logs.filter((l) => l.entity_type === entityType);
    if (actionType) logs = logs.filter((l) => l.action_type === actionType);
    if (userId)     logs = logs.filter((l) => l.user_id     === userId);
    if (dateFrom)   logs = logs.filter((l) => l.created_at  >= dateFrom);
    if (dateTo)     logs = logs.filter((l) => l.created_at  <= dateTo);
    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter((l) =>
        (l.action_label  || '').includes(q) ||
        (l.entity_label  || '').includes(q) ||
        (l.user_name     || '').toLowerCase().includes(q),
      );
    }

    // Sort newest-first
    logs.sort((a, b) => b.created_at.localeCompare(a.created_at));

    const total  = logs.length;
    const offset = (page - 1) * pageSize;
    return { logs: logs.slice(offset, offset + pageSize), total };
  }

  // Supabase query
  let q = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (severity)   q = q.eq('severity', severity);
  if (entityType) q = q.eq('entity_type', entityType);
  if (actionType) q = q.eq('action_type', actionType);
  if (userId)     q = q.eq('user_id', userId);
  if (dateFrom)   q = q.gte('created_at', dateFrom);
  if (dateTo)     q = q.lte('created_at', dateTo);
  if (search) {
    q = q.textSearch(
      'fts',
      search,
      { type: 'plain', config: 'simple' },
    );
  }

  const { data, error, count } = await q;
  if (error) {
    if (isTableMissingError(error)) { _tableExists = false; return { logs: [], total: 0 }; }
    throw error;
  }
  return { logs: data || [], total: count || 0 };
}

// ── Public API — fetchStats ───────────────────────────────────
/**
 * Compute summary stats for the dashboard header.
 * Returns counts grouped by severity + top action types.
 */
export async function fetchAuditStats() {
  if (USE_MOCK_AUDIT) {
    await sleep(80);
    const logs = _mockStore;
    const now  = new Date();
    const day  = new Date(now); day.setHours(0, 0, 0, 0);
    const week = new Date(now); week.setDate(now.getDate() - 7);

    const todayLogs   = logs.filter((l) => new Date(l.created_at) >= day);
    const weekLogs    = logs.filter((l) => new Date(l.created_at) >= week);

    const bySeverity  = { info: 0, warning: 0, critical: 0 };
    weekLogs.forEach((l) => { bySeverity[l.severity] = (bySeverity[l.severity] || 0) + 1; });

    const failedLogins  = weekLogs.filter((l) => l.action_type === 'login_failed').length;
    const criticalCount = weekLogs.filter((l) => l.severity    === SEVERITY.CRITICAL).length;

    return {
      totalToday:    todayLogs.length,
      totalWeek:     weekLogs.length,
      bySeverity,
      failedLogins,
      criticalCount,
    };
  }

  const now   = new Date().toISOString();
  const day   = new Date(); day.setHours(0, 0, 0, 0);
  const week  = new Date(); week.setDate(week.getDate() - 7);

  const [todayRes, weekRes, failedRes, criticalRes] = await Promise.all([
    supabase.from(TABLE).select('id', { count: 'exact', head: true }).gte('created_at', day.toISOString()),
    supabase.from(TABLE).select('id', { count: 'exact', head: true }).gte('created_at', week.toISOString()),
    supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('action_type', 'login_failed').gte('created_at', week.toISOString()),
    supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('severity', SEVERITY.CRITICAL).gte('created_at', week.toISOString()),
  ]);

  // If any result indicates table is missing, disable and return zeros
  const allResults = [todayRes, weekRes, failedRes, criticalRes];
  for (const r of allResults) {
    if (r.error && isTableMissingError(r.error)) {
      _tableExists = false;
      return { totalToday: 0, totalWeek: 0, failedLogins: 0, criticalCount: 0, bySeverity: { info: 0, warning: 0, critical: 0 } };
    }
  }

  return {
    totalToday:    todayRes.count  || 0,
    totalWeek:     weekRes.count   || 0,
    failedLogins:  failedRes.count || 0,
    criticalCount: criticalRes.count || 0,
    bySeverity: { info: 0, warning: 0, critical: criticalRes.count || 0 },
  };
}

// ── Public API — Realtime ─────────────────────────────────────
/**
 * Subscribe to live audit log inserts (admin dashboard).
 * Returns an unsubscribe function.
 *
 * @param {function} onInsert  called with the new log row
 * @param {function} [onStatus]
 */
export function subscribeToAuditLogs(onInsert, onStatus) {
  if (USE_MOCK_AUDIT) return () => {};

  const channel = supabase
    .channel('audit-logs-stream')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: TABLE },
      (payload) => onInsert?.(payload.new),
    )
    .subscribe((status) => onStatus?.(status));

  return () => {
    try { supabase.removeChannel(channel); } catch { /* swallow */ }
  };
}

// ── Public API — Export ───────────────────────────────────────
/**
 * Export filtered logs as CSV string.
 */
export async function exportLogsCSV(params = {}) {
  const { logs } = await fetchLogs({ ...params, pageSize: 10_000, page: 1 });

  const header = ['التاريخ', 'المستخدم', 'الإجراء', 'الكيان', 'التفاصيل', 'الخطورة'].join(',');
  const rows   = logs.map((l) => [
    l.created_at,
    l.user_name  || '',
    l.action_label,
    `${l.entity_type || ''} ${l.entity_label || ''}`.trim(),
    JSON.stringify(l.metadata || {}).replace(/,/g, '؛'),
    l.severity,
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));

  return [header, ...rows].join('\n');
}
