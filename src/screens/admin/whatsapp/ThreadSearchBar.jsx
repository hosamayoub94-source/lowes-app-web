// =============================================================
// ThreadSearchBar — بحث بالرقم + toggle "غير مردودة أولاً" +
// شرائح فلترة الوسوم أعلى القائمة الجانبية. عرض بحت.
// =============================================================
export function ThreadSearchBar({
  search, onSearchChange, unansweredFirst, onToggleUnanswered, allTags, tagFilter, onTagFilterChange,
}) {
  return (
    <div className="p-2 border-b border-border/40 shrink-0 space-y-1.5">
      <input
        className="w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-surface text-text"
        placeholder="🔍 بحث برقم الهاتف…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        dir="ltr"
      />
      <button
        onClick={onToggleUnanswered}
        className={`w-full text-[11px] font-bold rounded-lg px-2 py-1.5 border transition ${unansweredFirst ? 'border-teal bg-teal/10 text-teal-700' : 'border-border/60 text-muted'}`}
      >
        🔴 غير مردودة أولاً {unansweredFirst ? '✓' : ''}
      </button>
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => onTagFilterChange(null)}
            className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 border ${!tagFilter ? 'border-navy bg-navy text-white' : 'border-border/60 text-muted'}`}
          >
            الكل
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => onTagFilterChange(tagFilter === tag ? null : tag)}
              className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 border ${tagFilter === tag ? 'border-navy bg-navy text-white' : 'border-border/60 text-muted hover:border-navy/40'}`}
            >
              🏷️ {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ThreadSearchBar;
