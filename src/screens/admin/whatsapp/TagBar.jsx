// =============================================================
// TagBar — وسوم المحادثة الحالية + إضافة وسم جديد. عرض بحت.
// =============================================================
import { Badge } from '@components/ui';

export function TagBar({
  tags, hasOwner, savingTag, tagInput, onTagInputChange, onAddTag, onRemove, suggestedTags,
}) {
  return (
    <div className="flex items-center flex-wrap gap-1.5 mb-2">
      {tags.map((tag) => (
        <Badge key={tag} tone="neutral" className="gap-1">
          🏷️ {tag}
          <button onClick={() => onRemove(tag)} disabled={savingTag} className="hover:text-red-500">✕</button>
        </Badge>
      ))}
      <input
        value={tagInput}
        onChange={(e) => onTagInputChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onAddTag(tagInput); }}
        disabled={savingTag || !hasOwner}
        placeholder={hasOwner ? '+ إضافة وسم…' : 'ملكية أول لتقدري توسمي'}
        list="wa-suggested-tags"
        className="text-[11px] border border-border/60 rounded-md px-2 py-0.5 bg-surface text-text w-32 disabled:opacity-50"
      />
      <datalist id="wa-suggested-tags">
        {suggestedTags.map((t) => <option key={t} value={t} />)}
      </datalist>
    </div>
  );
}

export default TagBar;
