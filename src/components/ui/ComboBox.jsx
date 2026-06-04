// =============================================================
// ComboBox — editable dropdown. Click the ▾ to see all options,
// type to filter, click to pick, or just type a free value.
// More reliable/visible than <datalist> across browsers.
// =============================================================
import { useState, useRef, useEffect } from 'react';

export function ComboBox({ value, onChange, options = [], placeholder, className, dir = 'rtl' }) {
  const [open, setOpen] = useState(false);
  // showAll = true → show the full list ignoring the current value (used when the
  // user clicks the ▾ caret). It resets to false the moment they start typing, so
  // typing still filters. This fixes "only the default value shows" (e.g. shipping
  // stuck on yurtiçi) because a pre-filled field no longer hides the other options.
  const [showAll, setShowAll] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const q = showAll ? '' : String(value || '').toLowerCase().trim();
  const list = (q ? options.filter((o) => String(o).toLowerCase().includes(q)) : options).slice(0, 60);

  return (
    <div ref={ref} className="relative" dir={dir}>
      <input
        value={value || ''}
        onChange={(e) => { onChange(e.target.value); setShowAll(false); setOpen(true); }}
        onFocus={() => { setShowAll(true); setOpen(true); }}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
        style={{ paddingInlineEnd: '2rem' }}
      />
      <button type="button" tabIndex={-1} onClick={() => { setShowAll(true); setOpen((o) => !o); }}
        className="absolute inset-y-0 end-2 flex items-center text-muted hover:text-text text-xs">▾</button>
      {open && list.length > 0 && (
        <div className="absolute z-40 top-full mt-1 inset-x-0 bg-surface border border-border rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {list.map((o) => (
            <button key={o} type="button" onMouseDown={() => { onChange(o); setOpen(false); }}
              className="w-full text-start px-3 py-2 text-sm text-text hover:bg-teal/10 transition border-b border-border/40 last:border-0">
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ComboBox;
