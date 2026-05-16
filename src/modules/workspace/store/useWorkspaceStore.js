// =============================================================
// Workspace Module — Zustand Store
// =============================================================
import { create } from 'zustand';
import { subscribeWithSelector, persist } from 'zustand/middleware';

export const useWorkspaceStore = create()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // ── State ──────────────────────────────────────────────
        isFocusMode:        false,
        commandPaletteOpen: false,
        commandQuery:       '',
        collapsedWidgets:   {},          // { [widgetId]: boolean }
        recentActivity:     [],          // [{ id, type, label, icon, time }]
        recentCommands:     [],          // [{ id, label, icon, type, path }]
        lastRefreshed:      null,
        // Session persistence
        lastActiveSection:  null,        // last widget/section the user interacted with
        sessionFilters:     {},          // saved filters per section

        // ── Focus Mode ─────────────────────────────────────────
        toggleFocusMode: () =>
          set((s) => ({ isFocusMode: !s.isFocusMode })),

        setFocusMode: (val) => set({ isFocusMode: val }),

        // ── Command Palette ────────────────────────────────────
        openCommandPalette: ()  => set({ commandPaletteOpen: true,  commandQuery: '' }),
        closeCommandPalette: () => set({ commandPaletteOpen: false, commandQuery: '' }),
        setCommandQuery: (q)    => set({ commandQuery: q }),

        // ── Widgets ────────────────────────────────────────────
        toggleWidget: (widgetId) =>
          set((s) => ({
            collapsedWidgets: {
              ...s.collapsedWidgets,
              [widgetId]: !s.collapsedWidgets[widgetId],
            },
          })),

        isWidgetCollapsed: (widgetId) => !!get().collapsedWidgets[widgetId],

        // ── Recent Activity ────────────────────────────────────
        pushActivity: (item) =>
          set((s) => ({
            recentActivity: [
              { ...item, id: item.id ?? `act_${Date.now()}`, time: item.time ?? Date.now() },
              ...s.recentActivity,
            ].slice(0, 40),            // keep last 40
          })),

        clearActivity: () => set({ recentActivity: [] }),

        // ── Recent commands ────────────────────────────────────
        pushRecentCommand: (cmd) =>
          set((s) => {
            const deduped = s.recentCommands.filter((c) => c.id !== cmd.id);
            return { recentCommands: [cmd, ...deduped].slice(0, 10) };
          }),

        clearRecentCommands: () => set({ recentCommands: [] }),

        // ── Session persistence ────────────────────────────────
        setLastActiveSection: (section) => set({ lastActiveSection: section }),
        setSessionFilter:     (key, val) =>
          set((s) => ({ sessionFilters: { ...s.sessionFilters, [key]: val } })),

        // ── Refresh timestamp ──────────────────────────────────
        markRefreshed: () => set({ lastRefreshed: Date.now() }),
      }),
      {
        name:    'workspace-store-v1',
        partialize: (s) => ({         // persist UI prefs + session
          isFocusMode:        s.isFocusMode,
          collapsedWidgets:   s.collapsedWidgets,
          recentCommands:     s.recentCommands,
          lastActiveSection:  s.lastActiveSection,
          sessionFilters:     s.sessionFilters,
        }),
      }
    )
  )
);

export default useWorkspaceStore;
