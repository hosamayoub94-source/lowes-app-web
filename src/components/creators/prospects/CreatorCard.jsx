// بطاقة صانع محتوى — مين، وين، أرقامه (أو «غير متوفر»)، حالته وتحققه ونوع التعاون، وسطر «الخطوة التالية».
// الرقم 0–100 «أولوية» لترتيب الشغل فقط — ليس حكماً على الجودة. الحساب اللي ما انفحص يظهر «⚪ ما انفحص» (محايد).
import {
  BADGES, CONTENT_AR, FOCUS_AR, TYPE_AR, STATUS_AR, STATUS_CLS, CATEGORY_AR, VERIFICATION_AR, VERIFY_CLS, COLLAB_AR, COLLAB_CLS, TONE_CLS, MISSING_AR,
  statusOf, fmtNum, instagramUrl, profileUrl, placeOf, shownHandle, isUnreviewed, collabOf, isGarbled, missingEssentials, displayName,
} from './constants';
import { nextStep } from '@services/creatorWorkqueue';

export function Avatar({ row, size = 'w-10 h-10 text-base' }) {
  const ch = String(displayName(row).replace(/^@/, '') || '?').trim().charAt(0).toUpperCase();
  return <div className={`${size} shrink-0 rounded-full bg-gradient-to-br from-amber-200 to-amber-500 text-white font-black flex items-center justify-center`} aria-hidden>{ch}</div>;
}

export function ScoreBadge({ row, big = false }) {
  const size = big ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[11px]';
  if (isUnreviewed(row)) {
    return <span className={`inline-flex items-center gap-1 rounded-full border font-bold ${size} bg-white text-gray-500 border-gray-300`} title="ما في معلومات مسجّلة بعد — افتح الحساب وراجعه">⚪ ما انفحص</span>;
  }
  const b = BADGES[row.badge] || BADGES.low;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-bold ${size} ${b.cls}`} title={`أولوية ${row.score}/100 لترتيب الشغل — محسوبة من البيانات المسجّلة فقط، ليست تقييم جودة مؤكد`}>
      <span aria-hidden>{b.icon}</span><span>أولوية</span><span dir="ltr">{row.score}</span>
    </span>
  );
}

const chip = 'px-2 py-0.5 rounded-full text-[11px]';

export default function CreatorCard({ row, selected, onSelect, onOpen, onSave, onDelete, v2, canManage }) {
  const ig = instagramUrl(row);
  const other = !ig ? profileUrl(row) : '';
  const st = statusOf(row.status);
  const tags = [...(row.content_types || []).map((c) => CONTENT_AR[c]), ...(row.skincare_focus || []).map((f) => FOCUS_AR[f])];
  const place = placeOf(row);
  const unrev = isUnreviewed(row);
  const collab = collabOf(row);
  const garbled = isGarbled(row);
  const miss = missingEssentials(row);
  const step = nextStep(row);
  const er = row.engagement_pct != null && row.engagement_pct !== '' ? Number(row.engagement_pct) : null;
  return (
    <div className={`rounded-xl border bg-white p-3 flex flex-col gap-2 ${row.deleted_at ? 'opacity-60' : ''} ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <div className="flex items-start gap-2">
        {onSelect && !row.deleted_at && <input type="checkbox" checked={selected} onChange={onSelect} className="mt-1 w-4 h-4" aria-label={`تحديد ${displayName(row)}`} />}
        <button className="flex items-start gap-2 flex-1 min-w-0 text-right" onClick={onOpen} aria-label={`فتح ${displayName(row)}`}>
          <Avatar row={row} />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-sm text-gray-900 truncate">{displayName(row)}</div>
            <div className="text-xs text-gray-500 truncate" dir="ltr">{shownHandle(row)}</div>
            {place && <div className="text-[11px] text-gray-500 truncate">📍 {place}</div>}
          </div>
        </button>
        <div className="text-left shrink-0">
          <div className="text-base font-black text-gray-900" dir="ltr">{row.followers != null && row.followers !== '' ? fmtNum(row.followers) : '—'}</div>
          <div className="text-[10px] text-gray-400">{row.followers == null ? 'متابعون غير متوفر' : er != null ? `تفاعل ${er}%` : 'متابع · تفاعل غير متوفر'}</div>
        </div>
      </div>

      {garbled && <div className="text-[11px] rounded-lg bg-orange-50 text-orange-800 px-2 py-1">⚠ الاسم وصل مشوّه (غالباً من ملف بترميز خاطئ) — صحّحه من الحساب</div>}

      <div className="flex flex-wrap gap-1">
        <ScoreBadge row={row} />
        {!unrev && <span className={`${chip} ${STATUS_CLS[st] || 'bg-gray-100'}`}>{STATUS_AR[st] || st}</span>}
        <span className={`${chip} bg-white border ${VERIFY_CLS[row.verification_status || 'unverified']}`}>{VERIFICATION_AR[row.verification_status || 'unverified']}</span>
        {collab && <span className={`${chip} font-bold ${COLLAB_CLS[collab]}`}>{COLLAB_AR[collab]}</span>}
        {row.creator_type && <span className={`${chip} bg-gray-900 text-white`}>{TYPE_AR[row.creator_type]}</span>}
        {!row.creator_type && row.category && <span className={`${chip} bg-gray-100 text-gray-600`} title="تصنيف المصدر — غير مؤكد">{CATEGORY_AR[row.category] || row.category}</span>}
        {tags.slice(0, 3).map((t) => <span key={t} className={`${chip} bg-emerald-50 text-emerald-800`}>{t}</span>)}
        {tags.length > 3 && <span className={`${chip} bg-gray-50 text-gray-500`}>+{tags.length - 3}</span>}
      </div>

      <div className={`rounded-lg px-2 py-1.5 text-xs font-bold ${TONE_CLS[step.tone]}`}>
        ← {step.ar}
        {miss.length > 0 && step.key !== 'find_account' && step.key !== 'fix_name' && <span className="font-normal text-gray-500"> · ناقص: {miss.map((m) => MISSING_AR[m]).join('، ')}</span>}
      </div>

      <div className="text-[11px] text-gray-500 flex flex-wrap gap-x-3" data-testid="card-provenance">
        <span>المصدر: {row.source ? <b className="font-semibold text-gray-700">{row.source}</b> : <span className="text-orange-700">غير مسجّل</span>}</span>
        <span>آخر تحقق: {row.last_verified_at ? <b className="font-semibold text-gray-700">{new Date(row.last_verified_at).toLocaleDateString('ar', { year: 'numeric', month: 'short', day: 'numeric' })}</b> : <span className="text-gray-400">لم يُتحقَّق بعد</span>}</span>
      </div>

      <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-gray-100">
        {ig ? (
          <a href={ig} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-bold">Instagram ↗</a>
        ) : other ? (
          <a href={other} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg border text-xs font-bold text-blue-700">فتح الحساب ↗</a>
        ) : null}
        <button onClick={onOpen} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${step.tone === 'amber' && canManage && !row.deleted_at ? 'bg-amber-500 text-white' : 'border hover:bg-gray-50'}`}>
          {canManage && !row.deleted_at && ['review', 'complete_review'].includes(step.key) ? 'راجِع ←' : 'التفاصيل'}
        </button>
        {!row.deleted_at && canManage && (
          <button onClick={onSave} disabled={!v2} title={row.saved ? 'إزالة من المفضلين' : 'إضافة للمفضلين'} aria-label={row.saved ? 'إزالة من المفضلين' : 'إضافة للمفضلين'} aria-pressed={!!row.saved}
            className={`mr-auto w-8 h-8 rounded-lg border text-base disabled:opacity-40 ${row.saved ? 'bg-amber-100 border-amber-300 text-amber-700' : 'text-gray-400 hover:bg-gray-50'}`}>{row.saved ? '★' : '☆'}</button>
        )}
        {!row.deleted_at && canManage && onDelete && (
          <button onClick={onDelete} title="حذف الحساب (حذف ناعم، بتقدر ترجّعه)" aria-label={`حذف ${displayName(row)}`}
            className="w-8 h-8 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50">🗑</button>
        )}
      </div>
    </div>
  );
}
