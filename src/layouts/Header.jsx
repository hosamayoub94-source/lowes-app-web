// =============================================================
// Header — top bar inside MainLayout.
//   • mobile: hamburger + brand + theme toggle
//   • desktop: page title + theme + avatar
// =============================================================
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUiStore } from '@stores/uiStore';
import { useAuth } from '@hooks/useAuth';
import { Avatar } from '@components/ui/Avatar';
import { Badge } from '@components/ui/Badge';
import { ROLE_LABELS } from '@data/teams';
import { NotificationBell } from '@modules/notifications';
import HelpGuide from '@components/ui/HelpGuide';

export function Header({ title }) {
  const [showHelp, setShowHelp] = useState(false);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const isOnline = useUiStore((s) => s.isOnline);
  const { name, role, avatar_url } = useAuth();

  return (
    <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur border-b border-border">
      <div className="h-14 px-3 sm:px-5 flex items-center gap-3">
        <button
          type="button"
          onClick={toggleSidebar}
          className="md:hidden w-10 h-10 grid place-items-center rounded-xl hover:bg-surface-alt"
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-lg font-extrabold text-text truncate">
            {title || 'لويس برو'}
          </h1>
        </div>

        {!isOnline && <Badge tone="amber">غير متصل</Badge>}

        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="w-10 h-10 grid place-items-center rounded-xl hover:bg-surface-alt text-text"
          aria-label="دليل الاستخدام"
          title="دليل الاستخدام — شرح ما يخصّ دورك"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>

        <NotificationBell />

        <button
          type="button"
          onClick={toggleTheme}
          className="w-10 h-10 grid place-items-center rounded-xl hover:bg-surface-alt"
          aria-label="Toggle theme"
          title={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
        >
          {theme === 'dark' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        <Link to="/profile" className="hidden sm:flex items-center gap-2 ps-2 hover:opacity-80 transition" title="ملفي الشخصي">
          <div className="text-end">
            <div className="text-xs font-bold leading-tight">{name || ''}</div>
            <div className="text-[10px] text-muted leading-tight">{ROLE_LABELS[role] || ''}</div>
          </div>
          <Avatar name={name || ''} src={avatar_url} size="sm" />
        </Link>
      </div>

      <HelpGuide open={showHelp} onClose={() => setShowHelp(false)} />
    </header>
  );
}

export default Header;
