// =============================================================
// usePersonalizationStore — Workspace personalization preferences
//
// Persists: widget order/visibility, compact mode, accessibility,
// mobile prefs, saved layouts, theme overrides.
// =============================================================
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const usePersonalizationStore = create(
  persist(
    (set, get) => ({
      // ── Defaults ────────────────────────────────────────────
      compactMode:       false,
      accessibilityMode: false,   // larger text, higher contrast
      reduceMotion:      false,   // respect prefers-reduced-motion
      mobilePreference:  'auto',  // 'auto' | 'mobile' | 'desktop'
      fontSize:          'md',    // 'sm' | 'md' | 'lg'
      theme:             'auto',  // 'auto' | 'light' | 'dark'

      // Widget visibility map: { widgetKey: boolean }
      widgets: {
        quickActions:    true,
        smartSuggestions: true,
        attendanceStatus: true,
        taskSummary:     true,
        activityFeed:    true,
        teamPresence:    true,
        notifications:   true,
        dailyStats:      true,
      },

      // Widget order (array of widget keys)
      widgetOrder: [
        'quickActions', 'attendanceStatus', 'smartSuggestions',
        'taskSummary', 'teamPresence', 'activityFeed',
        'notifications', 'dailyStats',
      ],

      // Saved layouts: [{ name, widgets, order }]
      savedLayouts: [],

      // ── Actions ─────────────────────────────────────────────
      setCompactMode(v)       { set({ compactMode: v }); },
      setAccessibility(v)     { set({ accessibilityMode: v }); },
      setReduceMotion(v)      { set({ reduceMotion: v }); },
      setMobilePreference(v)  { set({ mobilePreference: v }); },
      setFontSize(v)          { set({ fontSize: v }); },
      setTheme(v)             { set({ theme: v }); },

      toggleWidget(key) {
        set((s) => ({ widgets: { ...s.widgets, [key]: !s.widgets[key] } }));
      },
      setWidgetVisible(key, visible) {
        set((s) => ({ widgets: { ...s.widgets, [key]: visible } }));
      },
      reorderWidgets(newOrder) {
        set({ widgetOrder: newOrder });
      },

      saveLayout(name) {
        const { widgets, widgetOrder, savedLayouts } = get();
        const existing = savedLayouts.filter((l) => l.name !== name);
        set({ savedLayouts: [...existing, { name, widgets: { ...widgets }, order: [...widgetOrder], savedAt: Date.now() }] });
      },
      loadLayout(name) {
        const layout = get().savedLayouts.find((l) => l.name === name);
        if (layout) set({ widgets: layout.widgets, widgetOrder: layout.order });
      },
      deleteLayout(name) {
        set((s) => ({ savedLayouts: s.savedLayouts.filter((l) => l.name !== name) }));
      },

      resetToDefaults() {
        set({
          compactMode: false, accessibilityMode: false, reduceMotion: false,
          mobilePreference: 'auto', fontSize: 'md', theme: 'auto',
          widgets: {
            quickActions: true, smartSuggestions: true, attendanceStatus: true,
            taskSummary: true, activityFeed: true, teamPresence: true,
            notifications: true, dailyStats: true,
          },
          widgetOrder: ['quickActions','attendanceStatus','smartSuggestions','taskSummary','teamPresence','activityFeed','notifications','dailyStats'],
        });
      },
    }),
    {
      name:    '__lw_personalization',
      version: 1,
    }
  )
);
