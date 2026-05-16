// =============================================================
// Sidebar — desktop primary navigation. Acts as a slide-over
// drawer on mobile when sidebarOpen is true.
// =============================================================
import { NavLink } from 'react-router-dom';
import { cn } from '@utils/classNames';
import { useUiStore } from '@stores/uiStore';
import { useAuth } from '@hooks/useAuth';
import { navItemsForRole } from '@data/navigation';
import { Avatar } from '@components/ui/Avatar';
import { Button } from '@components/ui/Button';
import { ROLE_LABELS } from '@data/teams';

export function Sidebar() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const closeSidebar = useUiStore((s) => s.closeSidebar);
  const { role, name, avatar_url, logout } = useAuth();
  const items = navItemsForRole(role);

  return (
    <>
      {/* mobile overlay */}
      <div
        className={cn(
          'md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity',
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={closeSidebar}
        aria-hidden
      />

      <aside
        className={cn(
          'fixed md:sticky top-0 z-50 md:z-10 h-screen w-72 shrink-0',
          'bg-surface border-e border-border flex flex-col',
          'transform transition-transform duration-200',
          'md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0',
          // RTL: drawer slides in from the start (right)
          'rtl:translate-x-[-100%] rtl:md:translate-x-0',
          sidebarOpen && 'rtl:translate-x-0',
        )}
        aria-label="Primary navigation"
      >
        {/* brand */}
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-navy to-teal grid place-items-center text-white font-extrabold shadow-soft">
              ل
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-text">لويس برو</div>
              <div className="text-[11px] text-muted">Lowe's Professional</div>
            </div>
          </div>
        </div>

        {/* nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              onClick={closeSidebar}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 h-11 px-3 rounded-xl text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-teal text-white shadow-soft'
                    : 'text-text hover:bg-surface-alt',
                )
              }
            >
              <span aria-hidden className="text-base">{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* footer / user */}
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-surface-alt mb-2">
            <Avatar name={name || ''} src={avatar_url} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate">{name || '—'}</div>
              <div className="text-[11px] text-muted truncate">{ROLE_LABELS[role] || ''}</div>
            </div>
          </div>
          <Button variant="outline" size="sm" fullWidth onClick={logout}>
            تسجيل الخروج
          </Button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
