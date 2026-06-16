// =============================================================
// useFavorites — أدوات مفضّلة لكل مستخدم (localStorage) للوصول السريع.
//   • تُخزَّن كقائمة معرّفات NAV_ITEMS لكل مستخدم (مفتاح بـ id).
//   • مزامنة فورية بين كل المكوّنات (الشريط الجانبي + الرئيسية + البحث)
//     عبر مُصدِر أحداث داخلي + حدث storage (تبويبات متعدّدة).
// =============================================================
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@hooks/useAuth';

const PREFIX = 'lowes:favorites:';
const listeners = new Set();

function keyFor(userId) { return `${PREFIX}${userId || 'anon'}`; }

function read(userId) {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function write(userId, ids) {
  try { localStorage.setItem(keyFor(userId), JSON.stringify(ids)); } catch { /* quota / private mode */ }
  listeners.forEach(fn => fn(userId));
}

export function useFavorites() {
  const { id: userId } = useAuth();
  const [favorites, setFavorites] = useState(() => read(userId));

  useEffect(() => { setFavorites(read(userId)); }, [userId]);

  useEffect(() => {
    const onChange = (changedUser) => {
      if (changedUser === userId) setFavorites(read(userId));
    };
    const onStorage = (e) => { if (e.key === keyFor(userId)) setFavorites(read(userId)); };
    listeners.add(onChange);
    window.addEventListener('storage', onStorage);
    return () => { listeners.delete(onChange); window.removeEventListener('storage', onStorage); };
  }, [userId]);

  const isFavorite = useCallback((navId) => favorites.includes(navId), [favorites]);

  const toggleFavorite = useCallback((navId) => {
    const current = read(userId);
    const next = current.includes(navId)
      ? current.filter(x => x !== navId)
      : [...current, navId];
    write(userId, next);
  }, [userId]);

  return { favorites, isFavorite, toggleFavorite };
}

export default useFavorites;
