// بطاقة صانع محتوى — نفس شكل البطاقة السابقة، مع Score وشارة واضحة وزر Instagram أساسي.
import {
  BADGES, CONTENT_AR, FOCUS_AR, TYPE_AR, STATUS_AR, STATUS_CLS, CATEGORY_AR, statusOf, fmtNum, instagramUrl, profileUrl, placeOf, contactUrl, isPending, shownHandle,
} from './constants';

export function Avatar({ row, size = 'w-10 h-10 text-base' }) {
  const ch = String(row.name || row.handle || '?').trim().charAt(0).toUpperCase();
  return <div className={`${size} shrink-0 rounded-full bg-gradient-to-br from-amber-200 to-amber-500 text-white font-black flex items-center justify-center`} aria-hidden>{ch}</div>;
}

export function ScoreBadge({ row, big = false }) {
  const b = BADGES[row.badge] || BADGES.low;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-bold ${big ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]'} ${b.cls}`} title="Score داخلي 0–100 لترتيب المراجعة">
      <span>{b.icon}</span><span dir="ltr">{row.score}</span><span>{b.label}</span>
    </span>
  );
}

const chip = 'px-2 py-0.5 rounded-full text-[11px]';
const iconBtn = 'px-2 py-1 rounded-lg border text-[11px] font-bold hover:bg-gray-50 disabled:opacity-40';

export default function CreatorCard({ row, selected, onSelect, onOpen, onEdit, onSave, onStatus, v2 }) {
  const ig = instagramUrl(row);
  const other = !ig ? profileUrl(row) : '';
  const contact = contactUrl(row);
  const st = statusOf(row.status);
  const tags = [...(row.content_types || []).map((c) => CONTENT_AR[c]), ...(row.skincare_focus || []).map((f) => FOCUS_AR[f])];
  const place = placeOf(row);
  return (
    <div className={`rounded-xl border bg-white p-3 flex flex-col gap-2 ${row.deleted_at ? 'opacity-60' : ''} ${row.badge === 'excellent' ? 'border-amber-300' : ''}`}>
      <div className="flex items-start gap-2">
        {onSelect && !row.deleted_at && <input type="checkbox" checked={selected} onChange={onSelect} className="mt-1" aria-label="تحديد" />}
        <button className="flex items-start gap-2 flex-1 min-w-0 text-right" onClick={onOpen}>
          <Avatar row={row} />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-gray-900 truncate">{row.name || row.handle}</div>
            <div className="text-xs text-gray-500 truncate" dir="ltr">{shownHandle(row)}{isPending(row) ? "" : ` · ${row.platform}`}</div>
            {place && <div className="text-[11px] text-gray-500 truncate">📍 {place}</div>}
          </div>
        </button>
        <div className="text-left shrink-0">
          <div className="text-base font-black text-gray-900" dir="ltr">{fmtNum(row.followers)}</div>
          <div className="text-[10px] text-gray-400">{row.engagement_pct != null && row.engagement_pct !== '' ? `تفاعل ${Number(row.engagement_pct)}%` : 'متابع'}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <ScoreBadge row={row} />
        <span className={`${chip} ${STATUS_CLS[st] || 'bg-gray-100'}`}>{STATUS_AR[st] || st}</span>
        {row.creator_type && <span className={`${chip} bg-gray-900 text-white`}>{TYPE_AR[row.creator_type]}</span>}
        {!row.creator_type && row.category && <span className={`${chip} bg-gray-100 text-gray-600`}>{CATEGORY_AR[row.category] || row.category}</span>}
        {row.saved && <span className={`${chip} bg-amber-50 text-amber-800`}>⭐ محفوظ</span>}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 5).map((t) => <span key={t} className={`${chip} bg-emerald-50 text-emerald-800`}>{t}</span>)}
          {tags.length > 5 && <span className={`${chip} bg-gray-50 text-gray-500`}>+{tags.length - 5}</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-1 border-t border-gray-100">
        {ig ? (
          <a href={ig} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 rounded-lg bg-gray-900 text-white text-[11px] font-bold">فتح Instagram ↗</a>
        ) : other ? (
          <a href={other} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 rounded-lg border text-[11px] font-bold text-blue-700">فتح الحساب ↗</a>
        ) : null}
        <button onClick={onOpen} className={iconBtn}>التفاصيل</button>
        {contact && <a href={contact} target="_blank" rel="noopener noreferrer" className={iconBtn}>تواصل</a>}
        {!row.deleted_at && (
          <button onClick={onSave} disabled={!v2} title={v2 ? (row.saved ? 'إلغاء الحفظ' : 'حفظ') : 'يحتاج migration v2'} className={`${iconBtn} ${row.saved ? 'bg-amber-100 border-amber-300 text-amber-800' : ''}`}>{row.saved ? '★' : '☆'}</button>
        )}
        <button onClick={onEdit} className={iconBtn} title="تعديل">✎</button>
        {!row.deleted_at && (
          <span className="flex gap-1 mr-auto">
            <button onClick={() => onStatus('verified')} title="متحقَّق" className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold ${st === 'verified' ? 'bg-emerald-600 text-white border-emerald-600' : 'text-emerald-700 border-emerald-300'}`}>✓</button>
            <button onClick={() => onStatus('needs_review')} title="يحتاج مراجعة" className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold ${st === 'needs_review' ? 'bg-amber-500 text-white border-amber-500' : 'text-amber-700 border-amber-300'}`}>⏳</button>
            <button onClick={() => onStatus('rejected')} title="مرفوض" className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold ${st === 'rejected' ? 'bg-red-600 text-white border-red-600' : 'text-red-700 border-red-300'}`}>✕</button>
          </span>
        )}
      </div>
    </div>
  );
}
