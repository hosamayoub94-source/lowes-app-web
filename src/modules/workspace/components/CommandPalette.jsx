// =============================================================
// CommandPalette v2 — global search + keyboard nav + recent cmds
// Ctrl+K / ⌘K to open · ↑↓ navigate · Enter select · Esc close
// =============================================================
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate }      from 'react-router-dom';
import useWorkspaceStore    from '../store/useWorkspaceStore';
import { useGlobalSearch, getTypeMeta, NAV_COMMANDS } from '../hooks/useGlobalSearch';

// ── Result item component ──────────────────────────────────────
function ResultItem({ item, isActive, onClick, innerRef }) {
  const meta = getTypeMeta(item.type);
  return (
    <li ref={innerRef}>
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-right ${
          isActive ? 'bg-indigo-50' : 'hover:bg-gray-50'
        }`}
      >
        <span className="text-base w-7 text-center flex-none">{item.icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-gray-800">{item.label}</span>
          {item.subtitle && (
            <span className="block truncate text-xs text-gray-400 mt-0.5">{item.subtitle}</span>
          )}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-none ${meta.color}`}>
          {meta.label}
        </span>
        {item.shortcut && (
          <kbd className="hidden sm:block text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded ml-1 flex-none">
            {item.shortcut}
          </kbd>
        )}
      </button>
    </li>
  );
}

// ── Section header ─────────────────────────────────────────────
function SectionHeader({ label, count }) {
  return (
    <li className="px-4 pt-3 pb-1">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        {label}
        {count != null && <span className="ml-1 text-gray-300">({count})</span>}
      </span>
    </li>
  );
}

// ── Main component ─────────────────────────────────────────────
export function CommandPalette() {
  const navigate = useNavigate();

  const isOpen   = useWorkspaceStore((s) => s.commandPaletteOpen);
  const query    = useWorkspaceStore((s) => s.commandQuery);
  const close    = useWorkspaceStore((s) => s.closeCommandPalette);
  const setQuery = useWorkspaceStore((s) => s.setCommandQuery);
  const pushActivity = useWorkspaceStore((s) => s.pushActivity);

  // Recent commands — stored in workspace store
  const recentCmds    = useWorkspaceStore((s) => s.recentCommands ?? []);
  const pushRecentCmd = useWorkspaceStore((s) => s.pushRecentCommand);

  const { results } = useGlobalSearch(query);

  const inputRef    = useRef(null);
  const listRef     = useRef(null);
  const activeRef   = useRef(null);

  const [activeIdx, setActiveIdx] = useState(0);

  // ── Build flat list from sections ─────────────────────────────
  const flatList = (() => {
    const q = (query ?? '').trim();
    if (!q) {
      // Show recents first, then nav shortcuts
      const recentItems = recentCmds.slice(0, 5).map((r) => ({ ...r, _isRecent: true }));
      return [...recentItems, ...NAV_COMMANDS.slice(0, 7)];
    }
    return results.all;
  })();

  // Reset active index when results change
  useEffect(() => { setActiveIdx(0); }, [query]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 40);
      setActiveIdx(0);
    }
  }, [isOpen]);

  // Scroll active item into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  // ── Keyboard handling ──────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e) => {
      if (!isOpen) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIdx((i) => Math.min(i + 1, flatList.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIdx((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatList[activeIdx]) handleSelect(flatList[activeIdx]);
          break;
        case 'Escape':
          close();
          break;
        default:
          break;
      }
    },
    [isOpen, flatList, activeIdx] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Select handler ─────────────────────────────────────────────
  const handleSelect = useCallback(
    (item) => {
      // Record to recent commands (skip duplicates)
      pushRecentCmd?.({
        id:       item.id,
        label:    item.label,
        icon:     item.icon,
        type:     item.type,
        path:     item.path,
        shortcut: item.shortcut,
      });

      // Push to activity feed
      pushActivity({ type: 'task', label: `أمر: ${item.label}`, icon: item.icon });

      // Navigate if has path
      if (item.path) navigate(item.path);

      // Run action if has one
      if (typeof item.action === 'function') item.action();

      close();
    },
    [navigate, close, pushRecentCmd, pushActivity]
  );

  if (!isOpen) return null;

  const q = (query ?? '').trim();

  // Build grouped display
  const groups = [];
  if (!q) {
    if (recentCmds.length > 0)
      groups.push({ key: 'recent', label: 'الأوامر الأخيرة', items: recentCmds.slice(0, 5).map((r) => ({ ...r, _isRecent: true })) });
    groups.push({ key: 'nav', label: 'تنقل سريع', items: NAV_COMMANDS.slice(0, 7) });
  } else {
    if (results.nav.length)           groups.push({ key: 'nav',    label: 'الصفحات',           items: results.nav });
    if (results.tasks.length)         groups.push({ key: 'tasks',  label: 'المهام',              items: results.tasks });
    if (results.customers.length)     groups.push({ key: 'cust',   label: 'العملاء',             items: results.customers });
    if (results.leads.length)         groups.push({ key: 'leads',  label: 'العملاء المحتملون',   items: results.leads });
    if (results.deals.length)         groups.push({ key: 'deals',  label: 'الصفقات',             items: results.deals });
    if (results.notifications.length) groups.push({ key: 'notifs', label: 'الإشعارات',           items: results.notifications });
    if (results.files.length)         groups.push({ key: 'files',  label: 'الملفات',             items: results.files });
  }

  // Running flat index across groups for keyboard nav
  let runningIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-3 bg-black/50 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '80vh' }}
      >

        {/* ── Search input ──────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <span className="text-lg text-gray-400 flex-none">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث في المهام، العملاء، الصفحات..."
            className="flex-1 outline-none text-sm bg-transparent text-right placeholder:text-gray-400 text-gray-800"
            dir="rtl"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-gray-300 hover:text-gray-500 transition-colors flex-none text-sm"
            >
              ✕
            </button>
          )}
          <kbd className="hidden sm:flex items-center text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded flex-none">
            ESC
          </kbd>
        </div>

        {/* ── Results ───────────────────────────────────────────── */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 110px)' }} ref={listRef}>

          {/* Empty state */}
          {q && flatList.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <p className="text-3xl mb-2">🔍</p>
              <p className="text-sm">لا توجد نتائج لـ &quot;<strong className="text-gray-600">{q}</strong>&quot;</p>
              <p className="text-xs mt-1 text-gray-300">جرب كلمات أخرى</p>
            </div>
          )}

          {/* Grouped results */}
          {groups.map((group) => (
            <ul key={group.key} className="py-1">
              <SectionHeader label={group.label} count={q ? group.items.length : undefined} />
              {group.items.map((item) => {
                const idx = runningIdx++;
                return (
                  <ResultItem
                    key={item.id}
                    item={item}
                    isActive={idx === activeIdx}
                    onClick={() => handleSelect(item)}
                    innerRef={idx === activeIdx ? activeRef : undefined}
                  />
                );
              })}
            </ul>
          ))}
        </div>

        {/* ── Footer hints ──────────────────────────────────────── */}
        <div className="px-4 py-2 border-t border-gray-50 flex items-center gap-4 text-xs text-gray-400 justify-between">
          <div className="flex gap-3">
            <span className="flex items-center gap-1">
              <kbd className="bg-gray-100 px-1 rounded">↵</kbd> فتح
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-gray-100 px-1 rounded">↑↓</kbd> تنقل
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-gray-100 px-1 rounded">ESC</kbd> إغلاق
            </span>
          </div>
          <span className="text-gray-300">
            {flatList.length > 0 ? `${flatList.length} نتيجة` : ''}
          </span>
        </div>

      </div>
    </div>
  );
}

export default CommandPalette;
