// =============================================================
// Sidebar — premium desktop navigation.
// Design: gradient brand mark, warm plum active state,
// gold section headers, spacious layout.
// =============================================================
import { NavLink } from 'react-router-dom';
import { cn } from '@utils/classNames';
import { useUiStore } from '@stores/uiStore';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { groupedNavForRole } from '@data/navigation';
import { Avatar } from '@components/ui/Avatar';
import { ROLE_LABELS } from '@data/teams';

export function Sidebar() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const closeSidebar = useUiStore((s) => s.closeSidebar);
  const { role, name, avatar_url, logout } = useAuth();
  const { permissions } = usePermissions();
  const groups = groupedNavForRole(role, permissions);
  const roleLabel = ROLE_LABELS[role] || role || '';

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={cn(
          'md:hidden fixed inset-0 z-40 transition-opacity duration-200',
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        style={{ background: 'rgba(45,27,78,0.45)', backdropFilter: 'blur(4px)' }}
        onClick={closeSidebar}
        aria-hidden
      />

      <aside
        className={cn(
          'fixed md:sticky top-0 z-50 md:z-10 h-screen w-64 shrink-0 flex flex-col',
          'transform transition-transform duration-200',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0',
        )}
        style={{
          background: 'linear-gradient(180deg, #faf8f6 0%, #f4f0f8 100%)',
          borderLeft: '1px solid rgba(45,27,78,0.08)',
        }}
        aria-label="Primary navigation"
      >
        {/* Brand */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl grid place-items-center text-white font-extrabold text-lg shadow-soft shrink-0"
              style={{ background: 'linear-gradient(135deg, #2d1b4e 0%, #0d7377 100%)' }}>
              ل
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-sm" style={{ color: '#2d1b4e' }}>لويس برو</div>
              <div className="text-[10px]" style={{ color: '#b48c3c' }}>Lowe's Professional</div>
            </div>
          </div>
        </div>

        {/* User card */}
        <div className="mx-3 mb-4 px-3 py-2.5 rounded-2xl flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition"
          style={{ background: 'rgba(45,27,78,0.06)' }}
          onClick={() => { closeSidebar(); window.location.href = '/profile'; }}>
          <Avatar name={name || ''} src={avatar_url} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate" style={{ color: '#2d1b4e' }}>{name || '—'}</div>
            <div className="text-[11px] truncate" style={{ color: '#b48c3c' }}>{roleLabel}</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 space-y-4 pb-4">
          {groups.map((group) => (
            <div key={group.key}>
              {group.label && (
                <p className="px-2 mb-1 text-[9px] font-extrabold uppercase tracking-widest"
                  style={{ color: '#b48c3c' }}>
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    onClick={closeSidebar}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 h-10 px-3 rounded-xl text-sm font-semibold transition-all duration-150',
                        isActive
                          ? 'text-white shadow-soft'
                          : 'text-text/70 hover:text-text hover:bg-white/60',
                      )
                    }
                    style={({ isActive }) => isActive
                      ? { background: 'linear-gradient(135deg, #2d1b4e 0%, #0d7377 100%)' }
                      : {}}
                  >
                    <span aria-hidden className="text-base w-5 text-center shrink-0">{item.icon}</span>
                    <span className="flex-1 truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t" style={{ borderColor: 'rgba(45,27,78,0.08)' }}>
          <button onClick={logout}
            className="w-full py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-80"
            style={{ background: 'rgba(45,27,78,0.07)', color: '#2d1b4e' }}>
            تسجيل الخروج
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
