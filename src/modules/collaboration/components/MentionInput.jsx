// =============================================================
// MentionInput — textarea with @mention autocomplete dropdown
// Syntax stored: @[Display Name](userId)
// Displayed as: @Display Name (highlighted)
// =============================================================
import { useState, useRef, useEffect, useCallback } from 'react';
import { useMentions } from '../hooks/useMentions';

export function MentionInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'اكتب تعليقاً... (@ للإشارة إلى شخص)',
  disabled = false,
  autoFocus = false,
  maxRows  = 5,
}) {
  const { searchEmployees, buildMentionText } = useMentions();

  const [mentionQuery, setMentionQuery]   = useState('');
  const [showDropdown, setShowDropdown]   = useState(false);
  const [dropdownItems, setDropdownItems] = useState([]);
  const [mentionStart, setMentionStart]   = useState(-1);
  const [activeIdx, setActiveIdx]         = useState(0);

  const textareaRef = useRef(null);

  // ── Auto-focus ─────────────────────────────────────────────────
  useEffect(() => {
    if (autoFocus) setTimeout(() => textareaRef.current?.focus(), 50);
  }, [autoFocus]);

  // ── Handle typing + @ detection ──────────────────────────────
  const handleChange = useCallback(
    (e) => {
      const text   = e.target.value;
      const cursor = e.target.selectionStart;

      onChange(text);

      // Detect @mention trigger
      const before = text.slice(0, cursor);
      const atIdx  = before.lastIndexOf('@');

      if (atIdx >= 0) {
        const fragment = before.slice(atIdx + 1);
        // Only open if fragment has no space (still typing name)
        if (!fragment.includes(' ') || fragment.length <= 20) {
          setMentionQuery(fragment);
          setMentionStart(atIdx);
          const results = searchEmployees(fragment);
          setDropdownItems(results);
          setShowDropdown(results.length > 0);
          setActiveIdx(0);
          return;
        }
      }

      setShowDropdown(false);
      setMentionStart(-1);
    },
    [onChange, searchEmployees]
  );

  // ── Select a mention from dropdown ────────────────────────────
  const selectMention = useCallback(
    (employee) => {
      const before     = value.slice(0, mentionStart);
      const afterCursor = value.slice(mentionStart + 1 + mentionQuery.length);
      const mention    = buildMentionText(employee.name, employee.id ?? employee.name);
      const newText    = `${before}${mention} ${afterCursor}`;
      onChange(newText);
      setShowDropdown(false);
      setMentionStart(-1);

      // Refocus textarea after selection
      setTimeout(() => {
        if (textareaRef.current) {
          const pos = (before + mention + ' ').length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(pos, pos);
        }
      }, 10);
    },
    [value, mentionStart, mentionQuery, onChange, buildMentionText]
  );

  // ── Keyboard navigation in dropdown ──────────────────────────
  const handleKeyDown = useCallback(
    (e) => {
      if (showDropdown) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, dropdownItems.length - 1)); return; }
        if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return; }
        if (e.key === 'Enter' && !e.shiftKey && dropdownItems[activeIdx]) {
          e.preventDefault();
          selectMention(dropdownItems[activeIdx]);
          return;
        }
        if (e.key === 'Escape') { setShowDropdown(false); return; }
      }

      // Submit on Enter (without shift)
      if (e.key === 'Enter' && !e.shiftKey && !showDropdown) {
        e.preventDefault();
        if (value.trim() && onSubmit) onSubmit();
      }
    },
    [showDropdown, dropdownItems, activeIdx, selectMention, value, onSubmit]
  );

  const handleBlur = () => {
    // Delay so click on dropdown registers first
    setTimeout(() => setShowDropdown(false), 150);
  };

  return (
    <div className="relative">
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        dir="rtl"
        rows={2}
        style={{ maxHeight: `${maxRows * 1.5}rem`, resize: 'none' }}
        className="w-full text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition placeholder:text-gray-400 disabled:opacity-50"
      />

      {/* @mention dropdown */}
      {showDropdown && dropdownItems.length > 0 && (
        <ul
          className="absolute z-50 bottom-full mb-1 w-full bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden"
          dir="rtl"
        >
          <li className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-50">
            أشر إلى شخص
          </li>
          {dropdownItems.map((emp, i) => (
            <li key={emp.id ?? emp.name}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); selectMention(emp); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-right transition-colors ${
                  i === activeIdx ? 'bg-indigo-50' : 'hover:bg-gray-50'
                }`}
              >
                {/* Avatar */}
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 flex-none">
                  {emp.avatar_url
                    ? <img src={emp.avatar_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                    : (emp.name?.[0] ?? '?')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{emp.name}</p>
                  {emp.team && <p className="text-xs text-gray-400 truncate">{emp.team}</p>}
                </div>
                <span className="text-xs text-gray-300 flex-none">@ إشارة</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MentionInput;
