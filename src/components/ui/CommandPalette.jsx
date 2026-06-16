// =============================================================
// CommandPalette — بحث/وصول سريع لأي أداة (Ctrl/Cmd+K).
//   • يبحث في عناصر التنقّل المتاحة لدور المستخدم وصلاحياته فقط.
//   • عند فراغ البحث: يعرض «المفضّلة» ثم بقية الأدوات.
//   • تنقّل بالكيبورد (↑/↓/Enter/Esc) + نجمة تثبيت لكل أداة.
// =============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { useFavorites } from '@hooks/useFavorites';
import { navItemsForRole, NAV_GROUPS } from '@data/navigation';

// تطبيع عربي بسيط للبحث (إزالة التشكيل + توحيد الألف/الياء/التاء المربوطة).
function norm(s) {
  return String(s || '')
    .replace(/[ً-ْ]/g, '')
    .replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .toLowerCase().trim();
}

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { permissions } = usePermissions();
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const allItems = useMemo(() => navItemsForRole(role, permissions), [role, permissions]);

  const results = useMemo(() => {
    const q = norm(query);
    if (!q) {
      // مفضّلة أولاً (بترتيب الإضافة) ثم بقية الأدوات.
      const favItems = favorites.map(id => allItems.find(i => i.id === id)).filter(Boolean);
      const favIds = new Set(favItems.map(i => i.id));
      const rest = allItems.filter(i => !favIds.has(i.id));
      return [...favItems, ...rest];
    }
    return allItems
      .map(i => ({ i, score: norm(i.label).indexOf(q) }))
      .filter(x => x.score !== -1)
      .sort((a, b) => a.score - b.score)
      .map(x => x.i);
  }, [query, allItems, favorites]);

  // إعادة الضبط عند الفتح + تركيز الحقل.
  useEffect(() => {
    if (open) { setQuery(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  // إبقاء العنصر النشط مرئياً.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const go = (item) => { if (!item) return; onClose?.(); navigate(item.path); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
  };

  const showFavHint = !query;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="بحث سريع">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fadeIn" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface text-text rounded-2xl shadow-soft border border-border overflow-hidden animate-slideUp" dir="rtl">
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 border-b border-border">
          <span className="text-muted">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="ابحث عن أداة أو شاشة…"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted"
          />
          <kbd className="hidden sm:block text-[10px] text-muted border border-border rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-2">
          {showFavHint && (
            <p className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-500">
              {favorites.length ? '⭐ المفضّلة' : 'كل الأدوات'}
            </p>
          )}
          {results.length === 0 ? (
            <div className="text-center py-10 text-muted text-sm">لا توجد أداة بهذا الاسم</div>
          ) : (
            results.map((item, idx) => (
              <div
                key={item.id}
                data-idx={idx}
                onMouseEnter={() => setActive(idx)}
                onClick={() => go(item)}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition ${idx === active ? 'bg-navy/5 dark:bg-white/5' : ''}`}
              >
                <span className="text-base w-5 text-center shrink-0">{item.icon}</span>
                <span className="flex-1 truncate text-sm font-semibold">{item.label}</span>
                <span className="text-[10px] text-muted shrink-0">{NAV_GROUPS[item.group] || ''}</span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); toggleFavorite(item.id); }}
                  className="shrink-0 text-base leading-none hover:scale-110 transition"
                  title={isFavorite(item.id) ? 'إزالة من المفضّلة' : 'إضافة للمفضّلة'}
                  aria-label="تثبيت في المفضّلة"
                >
                  {isFavorite(item.id) ? '⭐' : '☆'}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-border text-[10px] text-muted flex justify-between">
          <span>↑↓ للتنقّل · Enter للفتح</span>
          <span>☆ لتثبيت أداة في المفضّلة</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
