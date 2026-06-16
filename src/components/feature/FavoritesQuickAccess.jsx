// =============================================================
// FavoritesQuickAccess — شبكة «أدواتي المفضّلة» على الرئيسية للوصول السريع.
//   تُملأ من useFavorites (تُثبَّت عبر ☆ في البحث أو الشريط الجانبي).
//   لا تظهر إن لم يكن للمستخدم مفضّلات بعد.
// =============================================================
import { Link } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { useFavorites } from '@hooks/useFavorites';
import { navItemsForRole } from '@data/navigation';

export default function FavoritesQuickAccess() {
  const { role } = useAuth();
  const { permissions } = usePermissions();
  const { favorites } = useFavorites();

  if (!favorites.length) return null;

  const items = navItemsForRole(role, permissions);
  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  const fav = favorites.map(id => byId[id]).filter(Boolean);
  if (!fav.length) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-amber-500">⭐</span>
        <h2 className="text-sm font-extrabold text-text">أدواتي المفضّلة</h2>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {fav.map(item => (
          <Link
            key={item.id}
            to={item.path}
            className="flex flex-col items-center gap-1 rounded-2xl bg-surface border border-border/60 px-2 py-3 hover:border-teal/40 hover:-translate-y-0.5 transition text-center"
          >
            <span className="text-xl">{item.icon}</span>
            <span className="text-[11px] font-semibold text-text leading-tight truncate w-full">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
