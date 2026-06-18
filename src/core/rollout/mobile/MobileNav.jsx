// =============================================================
// MobileNav — Simplified bottom navigation for mobile employees
//
// Shows: 5 primary destinations with large touch targets.
// Integrates: attendance quick-action, unread badge.
// Designed for: one-hand use, glanceable, RTL.
// Replaces BottomNav.jsx when in mobile employee mode.
// =============================================================
import { memo, useState, useCallback } from 'react';
import { useNavigate, useLocation }     from 'react-router-dom';
import { useNotificationStore }         from '@modules/notifications/store/useNotificationStore';

// ── Nav items ──────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'workspace', path: '/',           icon: '🏠', label: 'الرئيسية' },
  { id: 'tasks',     path: '/tasks',      icon: '✅', label: 'المهام'   },
  { id: 'attendance',path: '/attendance', icon: '⏰', label: 'الحضور'   },
  { id: 'crm',       path: '/crm',        icon: '📊', label: 'CRM'      },
  { id: 'profile',   path: '/profile',    icon: '👤', label: 'حسابي'   },
];

// ── Quick attendance button (center FAB) ───────────────────────
function AttendanceFab({ onPress }) {
  const [pressed, setPressed] = useState(false);

  const handlePress = useCallback(() => {
    setPressed(true);
    onPress?.();
    setTimeout(() => setPressed(false), 500);
  }, [onPress]);

  return (
    <button
      onTouchStart={handlePress}
      onClick={handlePress}
      className={`
        relative -mt-6 w-16 h-16 rounded-full shadow-xl
        flex items-center justify-center
        transition-all duration-150
        ${pressed
          ? 'scale-95 bg-indigo-700 shadow-indigo-500/40'
          : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/30'
        }
      `}
      aria-label="تسجيل الحضور"
    >
      <span className="text-2xl">⏰</span>
      {/* Pulse ring */}
      <span className="absolute inset-0 rounded-full border-2 border-indigo-400 animate-ping opacity-30" />
    </button>
  );
}

// ── Nav item ───────────────────────────────────────────────────
const NavItem = memo(({ item, isActive, badge, onClick }) => (
  <button
    onClick={() => onClick(item.path)}
    className={`
      flex flex-col items-center justify-center gap-0.5
      min-w-[56px] flex-1 py-2 px-1
      transition-all duration-150 active:scale-90
      relative
    `}
    aria-label={item.label}
    aria-current={isActive ? 'page' : undefined}
  >
    <div className={`
      relative text-2xl leading-none transition-transform duration-150
      ${isActive ? 'scale-110' : ''}
    `}>
      {item.icon}
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </div>
    <span className={`text-[10px] font-medium leading-none mt-0.5 transition-colors ${
      isActive
        ? 'text-indigo-600 dark:text-indigo-400'
        : 'text-gray-400 dark:text-gray-500'
    }`}>
      {item.label}
    </span>
    {isActive && (
      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-600 dark:bg-indigo-400" />
    )}
  </button>
));
NavItem.displayName = 'NavItem';

// ── Main component ─────────────────────────────────────────────
export function MobileNav({ onAttendancePress }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const unread    = useNotificationStore((s) => s.unreadCount ?? 0);

  const handleNavigate = useCallback((path) => {
    navigate(path);
  }, [navigate]);

  // Split items — center slot reserved for FAB
  const leftItems  = NAV_ITEMS.slice(0, 2);
  const rightItems = NAV_ITEMS.slice(2);

  const getBadge = (item) => {
    if (item.id === 'notifications') return unread;
    return 0;
  };

  const isActive = (item) => {
    if (item.path === '/') return location.pathname === '/';
    return location.pathname.startsWith(item.path);
  };

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex items-end justify-around"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      dir="rtl"
    >
      {/* Right items */}
      {rightItems.map((item) => (
        <NavItem
          key={item.id}
          item={item}
          isActive={isActive(item)}
          badge={getBadge(item)}
          onClick={handleNavigate}
        />
      ))}

      {/* Center FAB */}
      <div className="flex flex-col items-center pb-2">
        <AttendanceFab onPress={onAttendancePress} />
        <span className="text-[9px] text-gray-400 mt-1">سجّل</span>
      </div>

      {/* Left items */}
      {leftItems.map((item) => (
        <NavItem
          key={item.id}
          item={item}
          isActive={isActive(item)}
          badge={getBadge(item)}
          onClick={handleNavigate}
        />
      ))}
    </nav>
  );
}

export default MobileNav;
