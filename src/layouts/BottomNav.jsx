// =============================================================
// BottomNav — mobile primary navigation. Caps at 5 items;
// remaining items fall back to the side drawer.
// =============================================================
import { NavLink } from 'react-router-dom';
import { cn } from '@utils/classNames';
import { useAuth } from '@hooks/useAuth';
import { navItemsForRole } from '@data/navigation';

export function BottomNav() {
  const { role } = useAuth();
  const items = navItemsForRole(role).slice(0, 5);
  if (!items.length) return null;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-border"
      aria-label="Primary"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => (
          <li key={item.id}>
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-semibold transition-colors',
                  isActive ? 'text-teal' : 'text-muted',
                )
              }
            >
              <span aria-hidden className="text-lg">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      {/* iOS safe-area */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}

export default BottomNav;
