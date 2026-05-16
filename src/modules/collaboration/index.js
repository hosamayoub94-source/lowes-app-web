// =============================================================
// Collaboration Module — barrel exports
// =============================================================

// Store
export { useCollaborationStore, entityKey, channelKey } from './store/useCollaborationStore';

// Service
export {
  createComment,
  replyToThread,
  deleteComment,
  getComments,
  getChannels,
  createChannel,
  markThreadRead,
  subscribeToComments,
  joinPresence,
  updatePresenceSection,
  getRecentComments,
  USE_MOCK as COLLAB_USE_MOCK,
} from './services/collaborationService';

// Hooks
export { useComments }     from './hooks/useComments';
export { useMentions }     from './hooks/useMentions';
export { useTeamPresence } from './hooks/useTeamPresence';

// Components
export { CommentThread }     from './components/CommentThread';
export { MentionInput }      from './components/MentionInput';
export { CollaborationFeed } from './components/CollaborationFeed';
export { TeamPresenceBar }   from './components/TeamPresenceBar';
export { DiscussionDrawer }  from './components/DiscussionDrawer';
