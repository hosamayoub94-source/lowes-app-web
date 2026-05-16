// =============================================================
// UI store — theme, language, sidebar, online status.
// Persisted to localStorage so user preferences survive reload.
// =============================================================
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const KEY = 'lp_ui_prefs';

export const useUiStore = create()(
  persist(
    (set, get) => ({
      theme: 'light',          // 'light' | 'dark'
      lang: 'ar',              // 'ar' | 'en'
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      sidebarOpen: false,

      setTheme: (theme) => {
        set({ theme });
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', theme);
        }
      },

      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        get().setTheme(next);
      },

      setLang: (lang) => {
        set({ lang });
        if (typeof document !== 'undefined') {
          document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
          document.documentElement.lang = lang;
        }
      },

      toggleLang: () => get().setLang(get().lang === 'ar' ? 'en' : 'ar'),

      setOnline: (isOnline) => set({ isOnline }),

      openSidebar: () => set({ sidebarOpen: true }),
      closeSidebar: () => set({ sidebarOpen: false }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    {
      name: KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ theme: s.theme, lang: s.lang }),
    },
  ),
);
