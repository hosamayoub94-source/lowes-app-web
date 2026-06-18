// =============================================================
// Sidebar — premium desktop navigation (dark-mode aware).
// Uses Tailwind + CSS-var classes exclusively — no hardcoded hex.
// =============================================================
import { NavLink } from 'react-router-dom';
import { cn } from '@utils/classNames';
import { useUiStore } from '@stores/uiStore';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { useFavorites } from '@hooks/useFavorites';
import { groupedNavForRole } from '@data/navigation';
import { Avatar } from '@components/ui/Avatar';
import { ROLE_LABELS } from '@data/teams';

export function Sidebar() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const closeSidebar = useUiStore((s) => s.closeSidebar);
  const { role, name, avatar_url, logout } = useAuth();
  const { permissions } = usePermissions();
  const { isFavorite, toggleFavorite } = useFavorites();
  const groups = groupedNavForRole(role, permissions);
  const roleLabel = ROLE_LABELS[role] || role || '';

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={cn(
          'md:hidden fixed inset-0 z-40 bg-navy/40 backdrop-blur-sm transition-opacity duration-200',
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={closeSidebar}
        aria-hidden
      />

      <aside
        className={cn(
          'fixed md:sticky top-0 z-50 md:z-10 h-screen w-64 shrink-0 flex flex-col',
          'bg-surface border-e border-border/10',
          'transform transition-transform duration-200',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0',
        )}
        aria-label="Primary navigation"
      >
        {/* Brand */}
        <div className="px-5 pt-6 pb-4 border-b border-border/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl grid place-items-center text-white font-extrabold text-lg shrink-0"
              style={{ background: 'linear-gradient(135deg, rgb(var(--color-navy)) 0%, rgb(var(--color-teal)) 100%)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
              ل
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-sm text-navy">لويس برو</div>
              <div className="text-[10px] text-amber-500">Lowe&apos;s Professional</div>
            </div>
          </div>
        </div>

        {/* User card */}
        <div className="mx-3 mt-3 mb-3 px-3 py-2.5 rounded-2xl bg-navy/5 dark:bg-white/5 flex items-center gap-2.5 cursor-pointer hover:bg-navy/10 dark:hover:bg-white/10 transition"
          onClick={() => { closeSidebar(); window.location.href = '/profile'; }}>
          <Avatar name={name || ''} src={avatar_url} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate text-text">{name || '—'}</div>
            <div className="text-[11px] truncate text-amber-500 dark:text-amber-400">{roleLabel}</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 space-y-4 pb-4">
          {groups.map((group) => (
            <div key={group.key}>
              {group.label && (
                <p className="px-2 mb-1.5 text-[9px] font-extrabold uppercase tracking-widest text-amber-500 dark:text-amber-400">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const fav = isFavorite(item.id);
                  return (
                    <div key={item.id} className="group/nav relative">
                      <NavLink
                        to={item.path}
                        onClick={closeSidebar}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 h-10 ps-3 pe-9 rounded-xl text-sm font-semibold transition-all duration-150',
                            isActive
                              ? 'text-white shadow-soft'
                              : 'text-muted hover:text-text hover:bg-navy/5 dark:hover:bg-white/5',
                          )
                        }
                        style={({ isActive }) => isActive
                          ? { background: 'linear-gradient(135deg, rgb(var(--color-navy)) 0%, rgb(var(--color-teal)) 100%)' }
                          : {}}
                      >
                        <span aria-hidden className="text-base w-5 text-center shrink-0">{item.icon}</span>
                        <span className="flex-1 truncate">{item.label}</span>
                      </NavLink>
                      <button
                        type="button"
                        onClick={() => toggleFavorite(item.id)}
                        className={cn(
                          'absolute top-1/2 -translate-y-1/2 end-2 z-10 text-sm leading-none transition',
                          fav ? 'opacity-100' : 'opacity-0 group-hover/nav:opacity-100',
                        )}
                        title={fav ? 'إزالة من المفضّلة' : 'إضافة للمفضّلة'}
                        aria-label="تثبيت في المفضّلة"
                      >
                        {fav ? '⭐' : '☆'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-border/10">
          <button onClick={logout}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-navy dark:text-white/80 bg-navy/6 dark:bg-white/6 hover:bg-navy/10 dark:hover:bg-white/10 transition">
            تسجيل الخروج
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
