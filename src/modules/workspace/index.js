// =============================================================
// Workspace module — barrel exports
// =============================================================

// Page
export { DailyWorkspacePage } from './pages/DailyWorkspacePage';

// Store
export { useWorkspaceStore }  from './store/useWorkspaceStore';

// Hooks
export { useWorkspace }          from './hooks/useWorkspace';
export { useQuickActions }       from './hooks/useQuickActions';
export { useFocusMode }          from './hooks/useFocusMode';
export { useGlobalSearch }       from './hooks/useGlobalSearch';
export { useKeyboardShortcuts }  from './hooks/useKeyboardShortcuts';

// Components
export { QuickActionsBar }    from './components/QuickActionsBar';
export { CommandPalette }     from './components/CommandPalette';
export { FocusModePanel }     from './components/FocusModePanel';
export { ActivityFeed }       from './components/ActivityFeed';
export { AttendanceWidget }   from './components/AttendanceWidget';
export { TasksWidget }        from './components/TasksWidget';
export { NotificationsWidget } from './components/NotificationsWidget';
export { SmartSuggestions }   from './components/SmartSuggestions';
