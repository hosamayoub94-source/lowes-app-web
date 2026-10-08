// تفاصيل صانع المحتوى — عرض للفريق: كل الحقول + «سبب التقييم» المبني حرفياً من البيانات (لا نص مولَّد).
import { Avatar, ScoreBadge } from './CreatorCard';
import {
  CONTENT_TYPES, CONTENT_AR, FOCUS_AR, TYPE_AR, STATUSES, STATUS_AR, STATUS_CLS, VERIFICATION_AR, VERIFY_CLS, CONFIDENCE_AR, CATEGORY_AR, WEIGHTS,
  statusOf, fmtNum, instagramUrl, profileUrl, placeOf, contactUrl, PLATFORM_AR, isPending, shownHandle,
} from './constants';

const NA = <span className="text-gray-400">— غير متوفر</span>;
const PART_AR = { skincare: 'ارتباط Skincare', ugc: 'قدرة UGC', product: 'محتوى منتجات', unboxing: 'Unboxing', activity: 'نشاط Instagram', location: 'ثقة الموقع', engagement: 'جودة التفاعل' };

function Row({ label, children }) {
  return (
    <div className="flex gap-2 text-sm py-1 border-b border-gray-50">
      <div className="w-32 shrink-0 text-gray-500 text-xs pt-0.5">{label}</div>
      <div className="flex-1 min-w-0 break-words">{children}</div>
    </div>
  );
}
const dateAr = (d) => (d ? new Date(d).toLocaleDateString('ar', { year: 'numeric', month: 'short', day: 'numeric' }) : null);
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

export default function CreatorDetail({ row, onClose, onEdit, onStatus, onSave, v2, pos, total, hasPrev, hasNext, onNav }) {
  const ig = instagramUrl(row) || profileUrl(row);
  const contact = contactUrl(row);
  const st = statusOf(row.status);
  const ct = row.content_types || [];
  const reasons = row.reasons || [];
  const missing = row.missing || [];
  const others = Object.entries(row.other_platforms || {}).filter(([p]) => p !== row.platform);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-4 space-y-4" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <button disabled={!hasPrev} onClick={() => onNav(-1)} className="px-2 py-1 rounded-lg border disabled:opacity-30">→</button>
              <span className="text-gray-500 px-1" dir="ltr">{pos} / {total}</span>
              <button disabled={!hasNext} onClick={() => onNav(1)} className="px-2 py-1 rounded-lg border disabled:opacity-30">←</button>
            </div>
          )}
          <button onClick={onClose} className="text-gray-400 text-lg mr-auto" aria-label="إغلاق">✕</button>
        </div>

        <div className="flex items-start gap-3">
          <Avatar row={row} size="w-14 h-14 text-xl" />
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-lg text-gray-900 truncate">{row.name || row.handle}</h2>
            <div className="text-sm text-gray-500" dir="ltr">{shownHandle(row)}{isPending(row) ? "" : ` · ${PLATFORM_AR[row.platform] || row.platform}`}</div>
            <div className="mt-1 flex flex-wrap gap-1 items-center">
              <ScoreBadge row={row} big />
              <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_CLS[st] || 'bg-gray-100'}`}>{STATUS_AR[st] || st}</span>
              <span className={`text-xs font-bold ${VERIFY_CLS[row.verification_status || 'unverified']}`}>{VERIFICATION_AR[row.verification_status || 'unverified']}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {ig && <a href={ig} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold">فتح Instagram ↗</a>}
          {contact && <a href={contact} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-xl border text-sm font-bold">تواصل</a>}
          {!row.deleted_at && <button disabled={!v2} title={v2 ? '' : 'يحتاج migration v2'} onClick={onSave} className={`px-4 py-2 rounded-xl border text-sm font-bold disabled:opacity-40 ${row.saved ? 'bg-amber-100 border-amber-300' : ''}`}>{row.saved ? '★ محفوظ' : '☆ حفظ'}</button>}
          <button onClick={onEdit} className="px-4 py-2 rounded-xl border text-sm font-bold">✎ تعديل</button>
          {!row.deleted_at && (
            <select value={st} onChange={(e) => onStatus(e.target.value)} className="border rounded-xl px-2 py-2 text-sm mr-auto" aria-label="الحالة">
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_AR[s]}</option>)}
            </select>
          )}
        </div>

        <section className="rounded-xl bg-gray-50 p-3 space-y-2">
          <h3 className="font-black text-sm">سبب التقييم</h3>
          {reasons.length > 0 ? (
            <ul className="text-sm space-y-0.5">{reasons.map((r) => <li key={r}>✓ {r}</li>)}</ul>
          ) : <div className="text-sm text-gray-500">لا يوجد دليل مسجّل بعد يرفع التقييم.</div>}
          {missing.length > 0 && (
            <div>
              <div className="text-xs font-bold text-gray-500 mt-1">ناقص / يحتاج تحقق:</div>
              <ul className="text-xs text-gray-600 space-y-0.5">{missing.map((m) => <li key={m}>• {m}</li>)}</ul>
            </div>
          )}
          {row.parts && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-1">
              {Object.entries(WEIGHTS).map(([k, w]) => (
                <div key={k} className="text-[11px]">
                  <div className="flex justify-between text-gray-600"><span>{PART_AR[k]}</span><span dir="ltr">{row.parts[k] ?? 0}/{w}</span></div>
                  <div className="h-1.5 rounded-full bg-gray-200"><div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${((row.parts[k] ?? 0) / w) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <Row label="الموقع">{placeOf(row) || NA}{row.location_confidence && <span className="text-xs text-gray-500"> — {CONFIDENCE_AR[row.location_confidence]}</span>}</Row>
          <Row label="نوع المبدع">{row.creator_type ? TYPE_AR[row.creator_type] : (row.category ? <span>{CATEGORY_AR[row.category] || row.category} <span className="text-xs text-gray-400">(تصنيف المصدر)</span></span> : NA)}</Row>
          <Row label="المتابعون"><span dir="ltr">{row.followers != null ? fmtNum(row.followers) : NA}</span></Row>
          <Row label="التفاعل">{row.engagement_pct != null && row.engagement_pct !== '' ? <span dir="ltr">{Number(row.engagement_pct)}%</span> : NA}</Row>
          <Row label="أنواع المحتوى">
            <div className="flex flex-wrap gap-1">
              {CONTENT_TYPES.map((c) => <span key={c} className={`px-2 py-0.5 rounded-full text-[11px] ${ct.includes(c) ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-50 text-gray-400'}`}>{ct.includes(c) ? '✓' : '—'} {CONTENT_AR[c]}</span>)}
            </div>
          </Row>
          <Row label="تخصص العناية">{(row.skincare_focus || []).length ? row.skincare_focus.map((f) => FOCUS_AR[f]).join('، ') : NA}</Row>
          <Row label="آخر نشاط">{dateAr(row.last_active_at) || NA}</Row>
          <Row label="البريد (عام)">{row.email ? <a className="text-blue-700" href={`mailto:${row.email}`} dir="ltr">{row.email}</a> : NA}</Row>
          <Row label="الهاتف (عام)">{row.phone ? <span dir="ltr">{row.phone}</span> : NA}</Row>
          <Row label="طريقة التواصل المفضلة">{row.preferred_contact || NA}</Row>
          {others.length > 0 && <Row label="منصات أخرى">{others.map(([p, h]) => <a key={p} href={profileUrl(row, p, h)} target="_blank" rel="noopener noreferrer" className="text-blue-700 ml-2" dir="ltr">{PLATFORM_AR[p] || p}: @{h}</a>)}</Row>}
          <Row label="الوسوم">{(row.tags || []).length ? row.tags.join('، ') : NA}</Row>
          <Row label="Bio">{row.bio || NA}</Row>
          <Row label="سبب الاستهداف">{row.fit || NA}</Row>
          <Row label="ملاحظات">{row.notes ? <span className="whitespace-pre-wrap">{row.notes}</span> : NA}</Row>
          <Row label="المصدر">{row.source || NA}{safeUrl(row.source_url) && <a href={row.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-700 text-xs mr-2">رابط المصدر ↗</a>}</Row>
          <Row label="آخر تحقق">{dateAr(row.last_verified_at) || NA}</Row>
          <Row label="المسؤول">{row.owner || NA}</Row>
          <Row label="أضيف">{dateAr(row.created_at) || NA}{row.created_by ? ` · ${row.created_by}` : ''}</Row>
        </section>
      </div>
    </div>
  );
}
