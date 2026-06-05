// =============================================================
// BottomNav — floating pill tab bar, mobile only. Dark-mode aware.
// =============================================================
import { NavLink } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { bottomTabsForRole } from '@data/navigation';

export function BottomNav() {
  const { role } = useAuth();
  const { permissions } = usePermissions();
  const tabs = bottomTabsForRole(role, permissions);
  if (!tabs.length) return null;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Primary navigation"
    >
      {/* Floating glass bar — adapts to dark via CSS vars */}
      <div className="mx-3 mb-3 rounded-2xl overflow-hidden bg-surface/90 dark:bg-surface/95 backdrop-blur-xl border border-border/10"
        style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)' }}>
        <ul className="grid h-[62px]"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((tab) => (
            <li key={tab.id}>
              <NavLink
                to={tab.path}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center h-full gap-0.5 relative transition-all duration-200 ${
                    isActive ? 'text-white' : 'text-muted'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        className="absolute inset-x-2 inset-y-1.5 rounded-xl"
                        style={{
                          background: 'linear-gradient(135deg, rgb(var(--color-navy)) 0%, rgb(var(--color-teal)) 100%)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                        }}
                        aria-hidden
                      />
                    )}
                    <span className="relative text-[18px] leading-none z-10">{tab.icon}</span>
                    <span className="relative text-[10px] font-bold z-10 truncate px-1">{tab.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

export default BottomNav;
