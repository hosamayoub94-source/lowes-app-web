// =============================================================
// useComments — load + submit comments for any entity
// Usage: const { comments, submit, loading } = useComments('task', taskId)
// =============================================================
import { useEffect, useCallback, useRef } from 'react';
import { useAuth }              from '@hooks/useAuth';
import useCollaborationStore, { entityKey, channelKey } from '../store/useCollaborationStore';
import {
  getComments,
  createComment,
  replyToThread,
  deleteComment,
  subscribeToComments,
} from '../services/collaborationService';

/**
 * @param {string} entityType  — 'task' | 'deal' | 'lead' | 'file' | 'attendance' | 'channel'
 * @param {string} entityId    — ID of the entity
 * @param {object} [opts]
 * @param {string} [opts.channelId]  — for channel messages
 */
export function useComments(entityType, entityId, { channelId = null } = {}) {
  const auth  = useAuth();
  const store = useCollaborationStore;

  const key = channelId ? channelKey(channelId) : entityKey(entityType, entityId);

  const comments    = useCollaborationStore((s) => s.commentsByEntity[key] ?? []);
  const loading     = useCollaborationStore((s) => s.loading[key] ?? false);
  const setComments = useCollaborationStore((s) => s.setComments);
  const appendComment = useCollaborationStore((s) => s.appendComment);
  const removeComment = useCollaborationStore((s) => s.removeComment);
  const markRead    = useCollaborationStore((s) => s.markEntityRead);
  const setLoading  = useCollaborationStore((s) => s.setLoading);

  const loadedRef = useRef(false);

  // ── Load comments on mount ───────────────────────────────────
  useEffect(() => {
    if (!entityId || loadedRef.current) return;
    loadedRef.current = true;

    setLoading(key, true);
    getComments({ entityType, entityId, channelId })
      .then((data) => setComments(key, data))
      .catch(() => setComments(key, []))
      .finally(() => setLoading(key, false));
  }, [entityType, entityId, channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime subscription ────────────────────────────────────
  useEffect(() => {
    if (!entityId) return;
    const unsubscribe = subscribeToComments({
      entityType,
      entityId,
      channelId,
      onInsert: (comment) => appendComment(key, comment),
    });
    return unsubscribe;
  }, [entityType, entityId, channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mark as read when viewed ─────────────────────────────────
  useEffect(() => {
    markRead(key);
  }, [key, markRead]);

  // ── Submit new comment ───────────────────────────────────────
  const submit = useCallback(
    async (content) => {
      if (!content?.trim()) return null;
      const comment = await createComment({
        entityType,
        entityId,
        authorId:    auth.id,
        authorName:  auth.name ?? 'مستخدم',
        authorAvatar: auth.avatar_url,
        content: content.trim(),
        channelId,
      });
      // Optimistic append (service also emits event)
      appendComment(key, comment);
      return comment;
    },
    [entityType, entityId, channelId, auth.id, auth.name, auth.avatar_url, key, appendComment]
  );

  // ── Reply to a thread ────────────────────────────────────────
  const reply = useCallback(
    async (parentId, content) => {
      if (!content?.trim()) return null;
      const comment = await replyToThread({
        parentId,
        entityType,
        entityId,
        authorId:    auth.id,
        authorName:  auth.name ?? 'مستخدم',
        authorAvatar: auth.avatar_url,
        content: content.trim(),
        channelId,
      });
      appendComment(key, comment);
      return comment;
    },
    [entityType, entityId, channelId, auth.id, auth.name, auth.avatar_url, key, appendComment]
  );

  // ── Delete ──────────────────────────────────────────────────
  const remove = useCallback(
    async (commentId) => {
      await deleteComment(commentId, auth.id);
      removeComment(key, commentId);
    },
    [auth.id, key, removeComment]
  );

  // ── Tree structure (top-level + replies) ─────────────────────
  const topLevel = comments.filter((c) => !c.parent_id);
  const getReplies = (parentId) => comments.filter((c) => c.parent_id === parentId);

  return {
    comments,
    topLevel,
    getReplies,
    loading,
    submit,
    reply,
    remove,
    count: comments.length,
  };
}

export default useComments;
