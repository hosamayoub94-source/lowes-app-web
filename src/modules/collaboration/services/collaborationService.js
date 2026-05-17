// =============================================================
// Collaboration Module — Service Layer
//
// Handles: comments · threads · channels · mentions · presence
//
// Mock mode: active by default (VITE_USE_MOCK_COLLAB !== 'false')
// Real mode: persists to Supabase tables:
//   - collaboration_comments   (comments + threads)
//   - collaboration_channels   (channels + DMs)
//   - collaboration_members    (channel membership)
//
// Pattern mirrors audit + notification services exactly.
// =============================================================
import { supabase }      from '@services/supabase';
import { emit, on }      from '@/core/events/eventBus.js';
import { EVENTS, EVENT_SOURCES } from '@/core/events/eventTypes.js';
import { sendNotification }      from '@modules/notifications/services/notificationService';
import { logActivity }           from '@modules/audit/services/auditService';
import { useQueueStore }          from '@/core/queue/queueStore';

// ── Mock mode ─────────────────────────────────────────────────
const _flag   = String(import.meta.env.VITE_USE_MOCK_COLLAB ?? '').toLowerCase();
export const USE_MOCK = _flag !== 'false';

// ── In-memory mock stores ─────────────────────────────────────
let _comments  = [];
let _channels  = _seedChannels();
let _seqC      = 1;
let _seqCh     = 10;

const _newCid  = () => `cmt_${String(_seqC++).padStart(5, '0')}`;
const _newChid = () => `ch_${String(_seqCh++).padStart(4, '0')}`;

function _seedChannels() {
  return [
    { id: 'ch_0001', name: 'عام',             type: 'team',         description: 'قناة الفريق العامة',  created_at: new Date().toISOString(), members: [], unread: 0 },
    { id: 'ch_0002', name: 'المبيعات',        type: 'department',   description: 'فريق المبيعات',       created_at: new Date().toISOString(), members: [], unread: 0 },
    { id: 'ch_0003', name: 'إعلانات',         type: 'announcement', description: 'إعلانات الإدارة',     created_at: new Date().toISOString(), members: [], unread: 0 },
    { id: 'ch_0004', name: 'العمليات',        type: 'department',   description: 'فريق العمليات',       created_at: new Date().toISOString(), members: [], unread: 0 },
  ];
}

// ── Tables ─────────────────────────────────────────────────────
const COMMENTS_TABLE  = 'collaboration_comments';
const CHANNELS_TABLE  = 'collaboration_channels';

// ── Helpers ────────────────────────────────────────────────────
const now = () => new Date().toISOString();

function parseMentions(content = '') {
  const matches = content.match(/@\[([^\]]+)\]\(([^)]+)\)/g) ?? [];
  return matches.map((m) => {
    const [, name, id] = m.match(/@\[([^\]]+)\]\(([^)]+)\)/) ?? [];
    return { name, id };
  });
}

// ── Comments CRUD ──────────────────────────────────────────────

/**
 * Create a top-level comment or channel message.
 * @param {object} p
 * @param {string}  p.entityType   — 'task' | 'deal' | 'lead' | 'file' | 'attendance' | 'channel'
 * @param {string}  p.entityId     — ID of the related entity
 * @param {string}  p.authorId     — commenter user ID
 * @param {string}  p.authorName   — commenter display name
 * @param {string} [p.authorAvatar]
 * @param {string}  p.content      — text (supports @[Name](id) mention syntax)
 * @param {string} [p.channelId]   — channel ID for channel messages
 * @returns {Promise<object>} created comment
 */
export async function createComment({
  entityType,
  entityId,
  authorId,
  authorName,
  authorAvatar = null,
  content,
  channelId = null,
}) {
  const mentions = parseMentions(content);

  const row = {
    entity_type:   entityType,
    entity_id:     String(entityId),
    channel_id:    channelId,
    author_id:     authorId,
    author_name:   authorName,
    author_avatar: authorAvatar,
    content,
    mentions,
    parent_id:     null,
    is_deleted:    false,
    created_at:    now(),
    updated_at:    now(),
  };

  let comment;

  if (USE_MOCK) {
    comment = { ...row, id: _newCid() };
    _comments.unshift(comment);
  } else {
    const { data, error } = await supabase
      .from(COMMENTS_TABLE)
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    comment = data;
  }

  // ── Event Bus ──────────────────────────────────────────────
  emit(EVENTS.COMMENT_ADDED, { comment }, { source: EVENT_SOURCES.COLLABORATION });

  // ── Mention notifications (batched via queue) ──────────────
  if (mentions.length > 0) {
    useQueueStore.getState().enqueue('collab:mention_batch', { comment, mentions }, { delay: 500 });
    mentions.forEach((m) => {
      if (m.id && m.id !== authorId) {
        sendNotification({
          userId:     m.id,
          type:       'mention',
          title:      `${authorName} ذكرك في تعليق`,
          message:    content.replace(/@\[[^\]]+\]\([^)]+\)/g, (match) => {
            const [, name] = match.match(/@\[([^\]]+)\]/) ?? [];
            return `@${name}`;
          }),
          entityType,
          entityId:   String(entityId),
          skipDedup:  true,
        });
        emit(EVENTS.MENTION_SENT, { comment, mentionedUserId: m.id, mentionedUserName: m.name }, { source: EVENT_SOURCES.COLLABORATION });
      }
    });
  }

  // ── Audit ──────────────────────────────────────────────────
  logActivity({
    actionType:  'comment_added',
    entityType,
    entityId:    String(entityId),
    userId:      authorId,
    userName:    authorName,
    details:     { mentions: mentions.length, channelId },
  }).catch(() => {});

  return comment;
}

/**
 * Reply to an existing comment (creates a thread).
 */
export async function replyToThread({
  parentId,
  entityType,
  entityId,
  authorId,
  authorName,
  authorAvatar = null,
  content,
  channelId = null,
}) {
  const mentions = parseMentions(content);

  const row = {
    entity_type:   entityType,
    entity_id:     String(entityId),
    channel_id:    channelId,
    author_id:     authorId,
    author_name:   authorName,
    author_avatar: authorAvatar,
    content,
    mentions,
    parent_id:     parentId,
    is_deleted:    false,
    created_at:    now(),
    updated_at:    now(),
  };

  let reply;

  if (USE_MOCK) {
    reply = { ...row, id: _newCid() };
    _comments.unshift(reply);
  } else {
    const { data, error } = await supabase
      .from(COMMENTS_TABLE)
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    reply = data;
  }

  emit(EVENTS.COMMENT_REPLIED, { reply, parentId }, { source: EVENT_SOURCES.COLLABORATION });

  // Notify parent comment author
  const parent = _comments.find((c) => c.id === parentId);
  if (parent?.author_id && parent.author_id !== authorId) {
    sendNotification({
      userId:    parent.author_id,
      type:      'reply',
      title:     `${authorName} ردّ على تعليقك`,
      message:   content,
      entityType,
      entityId:  String(entityId),
      skipDedup: true,
    });
  }

  return reply;
}

/**
 * Soft-delete a comment.
 */
export async function deleteComment(commentId, authorId) {
  if (USE_MOCK) {
    const c = _comments.find((c) => c.id === commentId);
    if (c && c.author_id === authorId) {
      c.is_deleted = true;
      c.content    = '[تم حذف هذا التعليق]';
    }
    return;
  }
  const { error } = await supabase
    .from(COMMENTS_TABLE)
    .update({ is_deleted: true, content: '[تم حذف هذا التعليق]' })
    .eq('id', commentId)
    .eq('author_id', authorId);
  if (error) throw error;
  emit(EVENTS.COMMENT_DELETED, { commentId }, { source: EVENT_SOURCES.COLLABORATION });
}

/**
 * Fetch comments for an entity.
 * @returns {Promise<object[]>} flat list sorted by created_at asc
 */
export async function getComments({ entityType, entityId, channelId = null, limit = 50 }) {
  if (USE_MOCK) {
    return _comments
      .filter((c) =>
        !c.is_deleted &&
        (channelId
          ? c.channel_id === channelId
          : c.entity_type === entityType && c.entity_id === String(entityId))
      )
      .slice(0, limit)
      .reverse();
  }

  let q = supabase
    .from(COMMENTS_TABLE)
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (channelId) {
    q = q.eq('channel_id', channelId);
  } else {
    q = q.eq('entity_type', entityType).eq('entity_id', String(entityId));
  }

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// ── Channels ───────────────────────────────────────────────────

export async function getChannels() {
  if (USE_MOCK) return [..._channels];
  const { data, error } = await supabase
    .from(CHANNELS_TABLE)
    .select('*')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createChannel({ name, type = 'team', description = '', createdBy }) {
  const row = {
    id:          _newChid(),
    name,
    type,
    description,
    created_by:  createdBy,
    created_at:  now(),
    members:     [createdBy],
    unread:      0,
  };

  if (USE_MOCK) {
    _channels.push(row);
  } else {
    const { data, error } = await supabase
      .from(CHANNELS_TABLE)
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    Object.assign(row, data);
  }

  emit(EVENTS.CHANNEL_CREATED, { channel: row }, { source: EVENT_SOURCES.COLLABORATION });
  return row;
}

/**
 * Mark all comments in a thread as read for a user.
 */
export async function markThreadRead(entityType, entityId, userId) {
  emit(EVENTS.THREAD_READ, { entityType, entityId, userId }, { source: EVENT_SOURCES.COLLABORATION });
  // In real mode: upsert into a `collaboration_reads` table
}

// ── Realtime subscription ──────────────────────────────────────

/**
 * Subscribe to new comments for an entity via Supabase realtime.
 * Returns an unsubscribe function.
 */
export function subscribeToComments({ entityType, entityId, channelId = null, onInsert }) {
  if (USE_MOCK) {
    // In mock mode we rely on the event bus
    const off = on(EVENTS.COMMENT_ADDED, ({ comment }) => {
      if (channelId) {
        if (comment.channel_id === channelId) onInsert(comment);
      } else if (comment.entity_type === entityType && comment.entity_id === String(entityId)) {
        onInsert(comment);
      }
    });
    return off;
  }

  const filter = channelId
    ? `channel_id=eq.${channelId}`
    : `entity_type=eq.${entityType}&entity_id=eq.${entityId}`;

  const channel = supabase
    .channel(`comments:${channelId ?? `${entityType}:${entityId}`}`)
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  COMMENTS_TABLE,
      filter,
    }, (payload) => {
      onInsert(payload.new);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ── Team Presence ──────────────────────────────────────────────

let _presenceChannel = null;

/**
 * Join presence tracking for the workspace.
 * Returns cleanup function.
 */
export function joinPresence({ userId, userName, section = 'workspace' }) {
  if (USE_MOCK) return () => {};

  try {
    _presenceChannel = supabase.channel('workspace:presence', {
      config: { presence: { key: userId } },
    });

    _presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = _presenceChannel.presenceState();
        emit(EVENTS.PRESENCE_CHANGED, { state }, { source: EVENT_SOURCES.COLLABORATION });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await _presenceChannel.track({ userId, userName, section, online_at: now() });
        }
      });

    return () => {
      if (_presenceChannel) {
        supabase.removeChannel(_presenceChannel);
        _presenceChannel = null;
      }
    };
  } catch {
    return () => {};
  }
}

export function updatePresenceSection(section) {
  _presenceChannel?.track({ section });
}

// ── Recent activity across all entities ───────────────────────
export function getRecentComments(limit = 20) {
  if (USE_MOCK) {
    return Promise.resolve(
      _comments
        .filter((c) => !c.is_deleted)
        .slice(0, limit)
    );
  }
  return supabase
    .from(COMMENTS_TABLE)
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit)
    .then(({ data, error }) => {
      if (error) throw error;
      return data ?? [];
    });
}

// ── Mock data seeding (dev only) ──────────────────────────────
export function _seedMockComments(comments) {
  if (!USE_MOCK) return;
  _comments = [...comments, ..._comments];
}

export function _getMockStore() {
  return { comments: _comments, channels: _channels };
}
