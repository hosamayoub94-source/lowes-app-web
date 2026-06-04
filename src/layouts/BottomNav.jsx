// =============================================================
// BottomNav — floating pill-style tab bar, mobile only.
// Role-curated 5 tabs (explicit per role, not just first-5).
// Design: frosted glass, plum active pill, gold dot indicator.
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
      {/* Frosted glass bar */}
      <div className="mx-3 mb-3 rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(45,27,78,0.18), 0 2px 8px rgba(45,27,78,0.10)',
          border: '1px solid rgba(45,27,78,0.08)',
        }}>
        <ul className="grid h-[60px]"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((tab) => (
            <li key={tab.id}>
              <NavLink
                to={tab.path}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center h-full gap-0.5 relative transition-all duration-200 ${
                    isActive ? 'text-white' : 'text-muted hover:text-text'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active pill background */}
                    {isActive && (
                      <span
                        className="absolute inset-x-2 inset-y-1.5 rounded-xl"
                        style={{
                          background: 'linear-gradient(135deg, rgb(45,27,78) 0%, rgb(13,115,119) 100%)',
                          boxShadow: '0 4px 12px rgba(45,27,78,0.35)',
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
