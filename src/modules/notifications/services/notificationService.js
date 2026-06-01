// =============================================================
// Notifications Module — Supabase Service (production)
//
// Features:
//   • sendNotification()      — insert with dedup_key (safe re-send)
//   • sendBulkNotifications() — broadcast to multiple users
//   • markAsRead()            — single notification
//   • markAllAsRead()         — all unread for current user
//   • fetchNotifications()    — paginated, with filters
//   • fetchUnreadCount()      — fast scalar query
//   • subscribeToNotifications() — realtime INSERT listener
//   • cleanOldNotifications() — TTL cleanup (> 30 days)
// =============================================================
import { supabase } from '@services/supabase';
import { useAuthStore } from '@stores/authStore';
import { resolveNotifSeverity } from '../types/notification.types';

// Resolve the current user's profile id. RLS is open (USING true) to support
// the PIN/manual-session model, so EVERY read must filter by user_id at the
// app level — otherwise a user would see everyone's notifications.
function _currentUserId() {
  try { return useAuthStore.getState().session?.id ?? null; } catch { return null; }
}

// ── Web Push helper ───────────────────────────────────────────
/**
 * Fire-and-forget: call the send-push Edge Function for one user.
 * Never throws — push failure should never block the main flow.
 */
async function sendPushToUser(userId, { title, message, url = '/' } = {}) {
  if (!userId || USE_MOCK) return;
  try {
    await supabase.functions.invoke('send-push', {
      body: { userId, title, body: message || title, url },
    });
  } catch { /* silent — push is best-effort */ }
}

const TABLE      = 'notifications';
const PAGE_SIZE  = 20;
const TTL_DAYS   = 30;

// Mock mode: active unless VITE_USE_MOCK_NOTIFICATIONS is explicitly 'false'
// Mirrors the same pattern used by the audit service.
const _mockFlag = String(import.meta.env.VITE_USE_MOCK_NOTIFICATIONS ?? '').toLowerCase();
const USE_MOCK  = _mockFlag !== 'false';

// In-memory mock store (empty by default — events will push into it via sendNotification)
let _mockStore = [];
let _mockSeq   = 1;
const _mockId  = () => `notif_${String(_mockSeq++).padStart(4, '0')}`;

// ── Dedup key ─────────────────────────────────────────────────
/**
 * Deterministic dedup key: same (user, type, entity, day) → same key.
 * Prevents duplicate notifications within the same calendar day.
 */
function buildDedupKey(userId, type, entityId = '') {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${userId}|${type}|${entityId}|${day}`;
}

// ── Send ──────────────────────────────────────────────────────

/**
 * Send a single notification to one user.
 * Silently swallows unique-violation (dedup) — never throws for that.
 *
 * @param {object} params
 * @param {string}  params.userId      — recipient's profile UUID
 * @param {string}  params.type        — NOTIFICATION_TYPE value
 * @param {string}  params.title       — short headline (Arabic)
 * @param {string} [params.message]    — longer body text
 * @param {string} [params.entityType] — ENTITY_TYPE value
 * @param {string} [params.entityId]   — related record ID
 * @param {string} [params.severity]   — override auto-resolved severity
 * @param {object} [params.metadata]   — arbitrary extra data
 * @param {boolean}[params.skipDedup]  — force insert even if key exists
 * @returns {Promise<object|null>}     — inserted row, or null on dedup
 */
export async function sendNotification({
  userId,
  type,
  title,
  message      = null,
  entityType   = null,
  entityId     = null,
  severity     = null,
  metadata     = {},
  skipDedup    = false,
}) {
  const row = {
    user_id:     userId,
    type,
    title,
    message,
    entity_type: entityType,
    entity_id:   entityId ? String(entityId) : null,
    severity:    resolveNotifSeverity(type, severity),
    metadata,
    dedup_key:   skipDedup ? null : buildDedupKey(userId, type, entityId || ''),
  };

  if (USE_MOCK) {
    const dedupKey = row.dedup_key;
    if (dedupKey && _mockStore.some((n) => n.dedup_key === dedupKey)) return null;
    const entry = { ...row, id: _mockId(), is_read: false, created_at: new Date().toISOString() };
    _mockStore.unshift(entry);
    return entry;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select()
    .single();

  if (error) {
    // 23505 = unique_violation → dedup hit, not a real error
    if (error.code === '23505') return null;
    throw error;
  }

  // Fire-and-forget push notification — runs in background, never blocks
  sendPushToUser(userId, { title, message, url: `/?notif=${data?.id || ''}` });

  return data;
}

/**
 * Broadcast a notification to multiple users.
 * Skips dedup per-user (each user gets their own row).
 *
 * @param {string[]} userIds
 * @param {object}   params  — same as sendNotification (minus userId)
 * @returns {Promise<object[]>} — inserted rows (may be fewer if some deduped)
 */
export async function sendBulkNotifications(userIds, params) {
  if (!userIds?.length) return [];

  const rows = userIds.map((userId) => ({
    user_id:     userId,
    type:        params.type,
    title:       params.title,
    message:     params.message     ?? null,
    entity_type: params.entityType  ?? null,
    entity_id:   params.entityId    ? String(params.entityId) : null,
    severity:    resolveNotifSeverity(params.type, params.severity ?? null),
    metadata:    params.metadata    ?? {},
    dedup_key:   buildDedupKey(userId, params.type, params.entityId || ''),
  }));

  if (USE_MOCK) {
    const inserted = rows.filter((r) => {
      if (r.dedup_key && _mockStore.some((n) => n.dedup_key === r.dedup_key)) return false;
      const entry = { ...r, id: _mockId(), is_read: false, created_at: new Date().toISOString() };
      _mockStore.unshift(entry);
      return true;
    });
    return inserted;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert(rows)
    .select();

  // On bulk insert, Supabase throws if ANY row violates unique.
  // Use upsert with ignoreDuplicates instead for robustness.
  if (error) {
    if (error.code === '23505') {
      // Fall back to one-by-one (rare path)
      const results = await Promise.allSettled(
        rows.map((r) =>
          supabase.from(TABLE).insert(r).select().single()
        ),
      );
      return results
        .filter((r) => r.status === 'fulfilled' && r.value?.data)
        .map((r) => r.value.data);
    }
    throw error;
  }

  return data ?? [];
}

// ── Read / Mark ───────────────────────────────────────────────

/**
 * Fetch paginated notifications for the current user.
 *
 * @param {object}  opts
 * @param {number} [opts.page=0]           — 0-indexed page
 * @param {number} [opts.pageSize=20]
 * @param {boolean}[opts.unreadOnly=false]
 * @param {string} [opts.type]             — filter by type
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function fetchNotifications({
  page      = 0,
  pageSize  = PAGE_SIZE,
  unreadOnly = false,
  type       = null,
} = {}) {
  if (USE_MOCK) {
    let items = [..._mockStore];
    if (unreadOnly) items = items.filter((n) => !n.is_read);
    if (type)       items = items.filter((n) => n.type === type);
    const from  = page * pageSize;
    return { data: items.slice(from, from + pageSize), total: items.length };
  }

  const from = page * pageSize;
  const to   = from + pageSize - 1;

  const uid = _currentUserId();
  if (!uid) return { data: [], total: 0 };

  let q = supabase
    .from(TABLE)
    .select('*', { count: 'exact' })
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (unreadOnly) q = q.eq('is_read', false);
  if (type)       q = q.eq('type', type);

  const { data, error, count } = await q;
  if (error) throw error;
  return { data: data ?? [], total: count ?? 0 };
}

/**
 * Fast unread count for the current user (RLS scopes to auth.uid()).
 * Returns 0 silently on any error (e.g. RLS rejection, table missing).
 * @returns {Promise<number>}
 */
export async function fetchUnreadCount() {
  if (USE_MOCK) {
    return _mockStore.filter((n) => !n.is_read).length;
  }

  try {
    const uid = _currentUserId();
    if (!uid) return 0;

    const { count, error } = await supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('is_read', false);

    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Mark a single notification as read.
 * @param {string} notificationId
 */
export async function markAsRead(notificationId) {
  if (USE_MOCK) {
    _mockStore = _mockStore.map((n) =>
      n.id === notificationId ? { ...n, is_read: true } : n,
    );
    return;
  }

  const { error } = await supabase
    .from(TABLE)
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) throw error;
}

/**
 * Mark ALL unread notifications for the current user as read.
 * RLS ensures this only touches auth.uid()'s rows.
 */
export async function markAllAsRead() {
  if (USE_MOCK) {
    _mockStore = _mockStore.map((n) => ({ ...n, is_read: true }));
    return;
  }

  const uid = _currentUserId();
  if (!uid) return;

  const { error } = await supabase
    .from(TABLE)
    .update({ is_read: true })
    .eq('user_id', uid)
    .eq('is_read', false);

  if (error) throw error;
}

// ── Realtime ──────────────────────────────────────────────────

/**
 * Subscribe to new notifications for a specific user.
 * In mock mode: no-op (events arrive via sendNotification directly).
 *
 * @param {string}   userId     — profile UUID to filter on
 * @param {function} onInsert   — called with the new notification row
 * @param {function} [onStatus] — called with channel status string
 * @returns {function} unsubscribe — call to remove the channel
 */
export function subscribeToNotifications(userId, onInsert, onStatus = null) {
  if (USE_MOCK) {
    onStatus?.('SUBSCRIBED');
    return () => {};
  }

  const channel = supabase
    .channel(`notif_user_${userId}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  TABLE,
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (payload.new) onInsert(payload.new);
      },
    )
    .subscribe((status) => {
      onStatus?.(status);
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

// ── Cleanup ───────────────────────────────────────────────────

/**
 * Delete read notifications older than TTL_DAYS (default 30).
 * Call from a low-priority background task, not on hot paths.
 */
export async function cleanOldNotifications() {
  if (USE_MOCK) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - TTL_DAYS);
    _mockStore = _mockStore.filter(
      (n) => !n.is_read || new Date(n.created_at) >= cutoff,
    );
    return;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TTL_DAYS);

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('is_read', true)
    .lt('created_at', cutoff.toISOString());

  if (error) throw error;
}
