// لوحة الحساب الموحّدة (بدل «التفاصيل» + «المراجعة» المنفصلتين): ماذا نعرف · ماذا ينقص · الأسئلة الثمانية · القرار · حفظ والتالي.
// الأسئلة والقرار المشتق هي نفسها من Workbench القديم (src/services/creatorReview.js) عبر src/services/creatorWorkqueue.js،
// تُخزَّن بلا migration في الحقول الموجودة + tags محجوزة. «غير متأكد» لا يُكتب. لا إرسال لأي رسالة من هنا — روابط فتح فقط.
// اختصارات (خارج حقول الكتابة): N التالي · P السابق · 1–4 القرار · Ctrl+Enter حفظ والتالي · Esc إغلاق.
import { useEffect, useMemo, useRef, useState } from 'react';
import { call, updateProspect } from '@services/creatorProspectsApi';
import {
  answersFromRow, verdictFor, reviewToPatch, quickRejectPatch, nextStep, missingAr,
  TRI_AR, FIT_AR, SKIN_AR, UGCQ_AR, PR_AR, ACTION_AR, REJECT_AR,
} from '@services/creatorWorkqueue';
import { Avatar, ScoreBadge } from './CreatorCard';
import CreatorEditModal from './CreatorEditModal';
import {
  CREATOR_TYPES, TYPE_AR, SKINCARE_FOCUS, FOCUS_AR, STATUS_AR, STATUS_CLS, VERIFICATION_AR, VERIFY_CLS, CONFIDENCE_AR, CATEGORY_AR, WEIGHTS,
  GOVERNORATES, COLLAB_AR, COLLAB_CLS, TONE_CLS, MISSING_AR, CONTENT_AR,
  statusOf, fmtNum, instagramUrl, profileUrl, placeOf, contactUrl, PLATFORM_AR, isPending, shownHandle, collabOf, isGarbled, missingEssentials, displayName,
} from './constants';

const NA = <span className="text-gray-400">— غير متوفر</span>;
const PART_AR = { skincare: 'ارتباط Skincare', ugc: 'قدرة UGC', product: 'محتوى منتجات', unboxing: 'Unboxing', activity: 'نشاط Instagram', location: 'ثقة الموقع', engagement: 'جودة التفاعل' };
const CONTACT_AR = { instagram_dm: 'رسالة Instagram', whatsapp: 'واتساب', email: 'بريد', phone: 'اتصال' };
const ACTION_KEYS = ['gift', 'ugc', 'paid', 'none'];
const FIELD_AR = {
  status: 'الحالة', tags: 'الإجابات/الوسوم', content_types: 'أنواع المحتوى', skincare_focus: 'تخصص العناية', creator_type: 'نوع المبدع', verification_status: 'التحقق',
  last_verified_at: 'آخر تحقق', last_active_at: 'آخر نشاط', location_confidence: 'ثقة الموقع', preferred_contact: 'التواصل المفضل', governorate: 'المحافظة', city: 'المدينة', email: 'البريد', phone: 'الهاتف', notes: 'ملاحظات', evidence: 'الأدلة',
  followers: 'المتابعون', engagement_pct: 'التفاعل', name: 'الاسم', handle: 'الحساب', saved: 'محفوظ', owner: 'المسؤول', source: 'المصدر',
};
const ACT_AR = { add: 'إضافة', update: 'تعديل', delete: 'حذف', restore: 'استرجاع', bulk_update: 'تعديل جماعي', import: 'استيراد' };
const inputCls = 'border rounded-lg px-2 py-1.5 text-sm w-full bg-white';
const dateAr = (d) => (d ? new Date(d).toLocaleDateString('ar', { year: 'numeric', month: 'short', day: 'numeric' }) : null);
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);
const isTyping = (el) => el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
const short = (v) => { const s = Array.isArray(v) ? v.join('، ') : v == null || v === '' ? '—' : String(v); return s.length > 60 ? `${s.slice(0, 60)}…` : s; };
// audit values in Arabic where we have a label (statuses, verification, types, places, dates)
function auditValue(field, v) {
  if (v == null || v === '') return '—';
  if (field === 'status') return STATUS_AR[statusOf(v)] || v;
  if (field === 'verification_status') return VERIFICATION_AR[v] || v;
  if (field === 'creator_type') return TYPE_AR[v] || v;
  if (field === 'location_confidence') return CONFIDENCE_AR[v] || v;
  if (field === 'governorate') return (GOVERNORATES.SY || []).find((g) => g.slug === v)?.ar || v;
  if (field === 'content_types' && Array.isArray(v)) return v.map((c) => CONTENT_AR[c] || c).join('، ') || '—';
  if (field === 'skincare_focus' && Array.isArray(v)) return v.map((c) => FOCUS_AR[c] || c).join('، ') || '—';
  if (/_at$/.test(field)) return dateAr(v) || v;
  return short(v);
}

function Choice({ label, value, options, labels, onChange, disabled }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={label}>
      <span className="text-xs text-gray-600 w-28 shrink-0">{label}</span>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} disabled={disabled} onClick={() => onChange(value === o ? 'unsure' : o)}
          className={`px-2.5 py-1 rounded-full border text-xs font-bold disabled:opacity-40 ${value === o ? (o === 'no' || o === 'none' || o === 'low' ? 'bg-red-600 text-white border-red-600' : 'bg-emerald-600 text-white border-emerald-600') : 'bg-white text-gray-700'}`}>
          {labels[o]}
        </button>
      ))}
    </div>
  );
}
function Q({ n, title, done, children }) {
  return (
    <fieldset className="rounded-xl border p-3 space-y-2">
      <legend className="px-1 text-xs font-black text-gray-800">{done ? '✓' : `${n}.`} {title}</legend>
      {children}
    </fieldset>
  );
}
function Row({ label, children }) {
  return (
    <div className="flex gap-2 text-sm py-1 border-b border-gray-50">
      <div className="w-28 shrink-0 text-gray-500 text-xs pt-0.5">{label}</div>
      <div className="flex-1 min-w-0 break-words">{children}</div>
    </div>
  );
}

export default function CreatorReviewPanel({ row, schema, owners, canManage, pos, total, done, onClose, onNav, onSaved, onToggleSave }) {
  const v2 = schema === 'v2';
  const initial = useMemo(() => answersFromRow(row), [row]);
  const [a, setA] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hist, setHist] = useState(null);
  const [editing, setEditing] = useState(false);
  const [why, setWhy] = useState(false);
  const box = useRef(null);
  const set = (k, v) => setA((p) => ({ ...p, [k]: v }));
  const dirty = JSON.stringify(a) !== JSON.stringify(initial);
  const verdict = useMemo(() => verdictFor(a, row), [a, row]);
  const step = nextStep(row);
  const st = statusOf(row.status);
  const collab = collabOf(row);
  const ig = instagramUrl(row) || profileUrl(row);
  const contact = canManage ? contactUrl(row) : '';
  const miss = missingEssentials(row);
  const writable = canManage && v2 && !row.deleted_at;
  const govs = GOVERNORATES[row.country || 'SY'] || [];
  const comp = verdict.completeness.answered;

  useEffect(() => { box.current?.focus(); }, []);

  const guard = (fn) => () => { if (!dirty || window.confirm('في تغييرات ما انحفظت. تتركها؟')) fn(); };
  async function save({ next = false } = {}) {
    setBusy(true); setErr('');
    const { patch } = reviewToPatch(a, row);
    const out = await updateProspect(row.id, patch, schema);
    setBusy(false);
    if (!out.ok) { setErr(out.message || out.error); return; }
    onSaved(out.row, { next });
  }
  async function reject(reason) {
    setBusy(true); setErr('');
    const out = await updateProspect(row.id, quickRejectPatch(row, reason), schema);
    setBusy(false);
    if (!out.ok) { setErr(out.message || out.error); return; }
    onSaved(out.row, { next: true });
  }
  async function del() {
    if (!window.confirm('حذف هذا الحساب؟ (حذف ناعم، بتقدر ترجّعه من «المحذوف»)')) return;
    setBusy(true); const out = await call('delete', { id: row.id }); setBusy(false);
    if (out.ok) onSaved(out.row, { removed: true }); else setErr(out.message || out.error);
  }
  async function restore() {
    setBusy(true); const out = await call('restore', { id: row.id }); setBusy(false);
    if (out.ok) onSaved(out.row, { removed: true }); else setErr(out.message || out.error);
  }
  async function loadHist() { const r = await call('audit', { id: row.id }); setHist(r.ok ? r.entries : []); }

  // keyboard shortcuts — ignored while typing in a field
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); guard(onClose)(); return; }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && writable && !busy) { e.preventDefault(); save({ next: true }); return; }
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || editing) return;
      const k = e.key.toLowerCase();
      if (k === 'n') { e.preventDefault(); guard(() => onNav(1))(); }
      else if (k === 'p') { e.preventDefault(); guard(() => onNav(-1))(); }
      else if (writable && ['1', '2', '3', '4'].includes(k)) { e.preventDefault(); set('action', ACTION_KEYS[Number(k) - 1]); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const vLabels = verdict.labels.map((l) => COLLAB_AR[l] || l).join(' + ');
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch sm:items-center justify-center sm:p-2" onClick={guard(onClose)}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`حساب ${displayName(row)}`}
        className="bg-white sm:rounded-2xl w-full max-w-3xl h-full sm:h-auto sm:max-h-[94vh] overflow-y-auto p-4 space-y-4 outline-none" dir="rtl" onClick={(e) => e.stopPropagation()}>
        {/* header: queue position */}
        <div className="flex items-center gap-2 sticky -top-4 bg-white py-2 z-10 border-b">
          {total > 0 && (
            <div className="flex items-center gap-1 text-xs">
              <button disabled={pos <= 1 || busy} onClick={guard(() => onNav(-1))} className="px-2 py-1 rounded-lg border disabled:opacity-30" aria-label="الحساب السابق (P)">→</button>
              <span className="text-gray-600 px-1" dir="ltr">{pos} / {total}</span>
              <button disabled={pos >= total || busy} onClick={guard(() => onNav(1))} className="px-2 py-1 rounded-lg border disabled:opacity-30" aria-label="الحساب التالي (N)">←</button>
              {done > 0 && <span className="text-emerald-700 font-bold mr-1">✓ {done} بهالجلسة</span>}
            </div>
          )}
          <span className="hidden sm:inline text-[10px] text-gray-400 mr-auto">N/P تنقّل · 1–4 قرار · Ctrl+Enter حفظ والتالي · Esc</span>
          <button onClick={guard(onClose)} className="text-gray-400 text-lg mr-auto sm:mr-0" aria-label="إغلاق (Esc)">✕</button>
        </div>

        {/* 1) who + what we know */}
        <div className="flex items-start gap-3">
          <Avatar row={row} size="w-14 h-14 text-xl" />
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-lg text-gray-900 truncate">{displayName(row)}</h2>
            <div className="text-sm text-gray-500" dir="ltr">{shownHandle(row)}{isPending(row) ? '' : ` · ${PLATFORM_AR[row.platform] || row.platform}`}</div>
            <div className="mt-1 flex flex-wrap gap-1 items-center">
              <ScoreBadge row={row} big />
              <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_CLS[st] || 'bg-gray-100'}`}>{STATUS_AR[st] || st}</span>
              <span className={`text-xs font-bold ${VERIFY_CLS[row.verification_status || 'unverified']}`}>{VERIFICATION_AR[row.verification_status || 'unverified']}</span>
              {collab && <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${COLLAB_CLS[collab]}`}>{COLLAB_AR[collab]}</span>}
            </div>
          </div>
        </div>
        {isGarbled(row) && <div className="rounded-lg bg-orange-50 text-orange-800 text-xs p-2">⚠ الاسم المسجّل مشوّه (ترميز ملف خاطئ). افتح الحساب واكتب الاسم الصحيح من «تعديل كل الحقول».</div>}
        <div className={`rounded-lg px-3 py-2 text-sm font-bold ${TONE_CLS[step.tone]}`}>
          الخطوة التالية: {step.ar}
          {miss.length > 0 && <div className="text-xs font-normal text-gray-600 mt-0.5">ناقص: {miss.map((m) => MISSING_AR[m]).join('، ')}</div>}
        </div>

        <div className="flex flex-wrap gap-2">
          {ig && <a href={ig} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-xl bg-gradient-to-l from-pink-500 to-amber-400 text-white text-sm font-black">افتح الحساب وشوف المحتوى ↗</a>}
          {contact && <a href={contact} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-xl border text-sm font-bold" title="يفتح المحادثة فقط — لا يُرسل شيئاً">تواصل ↗</a>}
          {canManage && !row.deleted_at && <button disabled={!v2} onClick={onToggleSave} aria-pressed={!!row.saved} className={`px-4 py-2 rounded-xl border text-sm font-bold disabled:opacity-40 ${row.saved ? 'bg-amber-100 border-amber-300' : ''}`}>{row.saved ? '★ محفوظ' : '☆ حفظ'}</button>}
          {canManage && <button onClick={() => setEditing(true)} className="px-4 py-2 rounded-xl border text-sm font-bold">✎ تعديل كل الحقول</button>}
        </div>

        <section className="rounded-xl bg-gray-50 p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Row label="المكان">{placeOf(row) || NA}{row.location_confidence && <span className="text-xs text-gray-500"> — {CONFIDENCE_AR[row.location_confidence]}</span>}</Row>
            <Row label="نوع المبدع">{row.creator_type ? TYPE_AR[row.creator_type] : (row.category ? <span>{CATEGORY_AR[row.category] || row.category} <span className="text-xs text-gray-400">(تصنيف المصدر، غير مؤكد)</span></span> : NA)}</Row>
            <Row label="المتابعون"><span dir="ltr">{row.followers != null && row.followers !== '' ? fmtNum(row.followers) : NA}</span></Row>
            <Row label="التفاعل">{row.engagement_pct != null && row.engagement_pct !== '' ? <span dir="ltr">{Number(row.engagement_pct)}%</span> : NA}</Row>
            <Row label="أنواع المحتوى">{(row.content_types || []).length ? row.content_types.map((c) => CONTENT_AR[c]).join('، ') : NA}</Row>
            <Row label="آخر نشاط">{dateAr(row.last_active_at) || NA}</Row>
            <Row label="المصدر">{row.source || NA}{safeUrl(row.source_url) && <a href={row.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-700 text-xs mr-2">رابط المصدر ↗</a>}</Row>
            <Row label="آخر تحقق">{dateAr(row.last_verified_at) || <span className="text-gray-400">لم يُتحقَّق يدوياً بعد</span>}</Row>
            {canManage ? (
              <>
                <Row label="البريد (عام)">{row.email ? <a className="text-blue-700" href={`mailto:${row.email}`} dir="ltr">{row.email}</a> : NA}</Row>
                <Row label="الهاتف (عام)">{row.phone ? <span dir="ltr">{row.phone}</span> : NA}</Row>
              </>
            ) : <Row label="التواصل"><span className="text-gray-400">لمن يدير البيانات فقط</span></Row>}
            <Row label="المسؤول">{row.owner || NA}</Row>
            <Row label="أضيف">{dateAr(row.created_at) || NA}{row.created_by ? ` · ${row.created_by}` : ''}</Row>
          </div>
          {row.fit && <div className="text-xs text-gray-600 mt-2">سبب الاستهداف: {row.fit}</div>}
          <button onClick={() => setWhy((w) => !w)} aria-expanded={why} className="text-xs font-bold text-blue-700 mt-2">{why ? '▴' : '▾'} لماذا هذه الأولوية؟ (ليست تقييم جودة)</button>
          {why && (
            <div className="mt-2 space-y-2">
              {(row.reasons || []).length > 0 ? <ul className="text-xs space-y-0.5">{row.reasons.map((r) => <li key={r}>✓ {r}</li>)}</ul> : <div className="text-xs text-gray-500">لا يوجد دليل مسجّل بعد يرفع الأولوية.</div>}
              {(row.missing || []).length > 0 && <ul className="text-xs text-gray-600 space-y-0.5">{row.missing.map((m) => <li key={m}>• {m}</li>)}</ul>}
              {row.parts && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                  {Object.entries(WEIGHTS).map(([k, w]) => (
                    <div key={k} className="text-[11px]">
                      <div className="flex justify-between text-gray-600"><span>{PART_AR[k]}</span><span dir="ltr">{row.parts[k] ?? 0}/{w}</span></div>
                      <div className="h-1.5 rounded-full bg-gray-200"><div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${((row.parts[k] ?? 0) / w) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {row.deleted_at && (
          <div className="rounded-lg bg-red-50 text-red-700 text-sm p-2">هذا الحساب محذوف (حذف ناعم).{canManage && <button className="underline font-bold mr-2" onClick={restore} disabled={busy}>استرجاع</button>}</div>
        )}
        {canManage && !v2 && !row.deleted_at && <div className="rounded-lg bg-amber-50 text-amber-800 text-xs p-2">المراجعة تحتاج حقول v2 على قاعدة البيانات — غير متاحة على هذا المخطط.</div>}

        {/* 2) the 8 questions */}
        {writable && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-black text-sm">المراجعة — {verdict.completeness.done}/8</h3>
              <span className="text-[11px] text-gray-500">«غير متأكد» = نتركه فاضي، ما منخمّن</span>
            </div>
            <Q n={1} title="هل الحساب نشط فعلاً؟" done={comp.q1}>
              <Choice label="نشط" value={a.active} options={['yes', 'no']} labels={TRI_AR} onChange={(v) => set('active', v)} />
              <label className="flex items-center gap-2 text-xs text-gray-600"><span className="w-28 shrink-0">آخر منشور شفته</span><input type="date" className={`${inputCls} max-w-[11rem]`} value={a.last_post} onChange={(e) => set('last_post', e.target.value)} /></label>
            </Q>
            <Q n={2} title="هل المحتوى مناسب لـLOWE'S؟ وشو نوعه؟" done={comp.q2}>
              <Choice label="مناسب" value={a.fit} options={['yes', 'partial', 'no']} labels={FIT_AR} onChange={(v) => set('fit', v)} />
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="نوع المبدع">
                {CREATOR_TYPES.map((t) => <button key={t} type="button" role="radio" aria-checked={a.creator_type === t} onClick={() => set('creator_type', a.creator_type === t ? '' : t)} className={`px-2.5 py-1 rounded-full border text-xs font-bold ${a.creator_type === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white'}`}>{TYPE_AR[t]}</button>)}
              </div>
            </Q>
            <Q n={3} title="كيف بيصوّر؟ (دليل UGC)" done={comp.q3}>
              <Choice label="يظهر وجهه" value={a.face} options={['yes', 'no']} labels={TRI_AR} onChange={(v) => set('face', v)} />
              <Choice label="بيحكي للكاميرا" value={a.talks} options={['yes', 'no']} labels={TRI_AR} onChange={(v) => set('talks', v)} />
              <Choice label="بيعمل ريفيو" value={a.review} options={['yes', 'no']} labels={TRI_AR} onChange={(v) => set('review', v)} />
              <Choice label="بيعمل أنبوكسنغ" value={a.unbox} options={['yes', 'no']} labels={TRI_AR} onChange={(v) => set('unbox', v)} />
              <Choice label="جودة التصوير" value={a.ugc_quality} options={['high', 'medium', 'low']} labels={UGCQ_AR} onChange={(v) => set('ugc_quality', v)} />
              <div className="space-y-1">
                <div className="text-xs text-gray-600">روابط فيديو كدليل (حتى 3)</div>
                {[0, 1, 2].map((i) => (i === 0 || a.videos[i - 1]) && (
                  <input key={i} dir="ltr" className={inputCls} placeholder="https://www.instagram.com/reel/…" value={a.videos[i] || ''}
                    onChange={(e) => { const v = [...a.videos]; v[i] = e.target.value.trim(); set('videos', v.filter((x, j) => x || j < i)); }} aria-label={`رابط فيديو ${i + 1}`} />
                ))}
              </div>
            </Q>
            <Q n={4} title="المدينة (كما يذكرها هو)" done={comp.q4}>
              <div className="grid grid-cols-2 gap-2">
                <select className={inputCls} value={a.governorate} onChange={(e) => set('governorate', e.target.value)} aria-label="المحافظة"><option value="">المحافظة غير معروفة</option>{govs.map((g) => <option key={g.slug} value={g.slug}>{g.ar}</option>)}</select>
                <input className={inputCls} placeholder="المدينة" value={a.city} onChange={(e) => set('city', e.target.value)} aria-label="المدينة" />
              </div>
            </Q>
            <Q n={5} title="تواصل عام (منشور بالبروفايل فقط)" done={comp.q5}>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={a.no_contact} onChange={(e) => set('no_contact', e.target.checked)} /> ما في أي تواصل عام غير رسائل المنصة</label>
              {!a.no_contact && (
                <div className="grid grid-cols-2 gap-2">
                  <input dir="ltr" className={inputCls} placeholder="email@…" value={a.email} onChange={(e) => set('email', e.target.value)} aria-label="البريد العام" />
                  <input dir="ltr" className={inputCls} placeholder="+963…" value={a.phone} onChange={(e) => set('phone', e.target.value)} aria-label="الهاتف العام" />
                  <select className={inputCls} value={a.preferred_contact} onChange={(e) => set('preferred_contact', e.target.value)} aria-label="التواصل المفضل"><option value="">التواصل المفضل…</option>{Object.entries(CONTACT_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <input dir="ltr" className={inputCls} placeholder="وين شفته؟ رابط (افتراضي: البروفايل)" value={a.contact_src} onChange={(e) => set('contact_src', e.target.value)} aria-label="مصدر بيانات التواصل" />
                </div>
              )}
            </Q>
            <Q n={6} title="هل ظاهر إنه بيقبل هدايا/تعاون؟" done={comp.q6}>
              <Choice label="إشارة PR" value={a.pr} options={['none', 'open_to_collab', 'gifted_seen']} labels={PR_AR} onChange={(v) => set('pr', v)} />
              {a.pr === 'gifted_seen' && <input dir="ltr" className={inputCls} placeholder="رابط المنشور اللي شفت فيه الهدية (مطلوب)" value={a.pr_url} onChange={(e) => set('pr_url', e.target.value)} aria-label="رابط دليل الهدية" />}
            </Q>
            <Q n={7} title="مناسب للسكين كير / الريتينول؟" done={comp.q7}>
              <Choice label="مناسب" value={a.skin} options={['yes', 'maybe', 'no']} labels={SKIN_AR} onChange={(v) => set('skin', v)} />
              <div className="flex flex-wrap gap-1.5">
                {SKINCARE_FOCUS.map((f) => { const on = a.skincare_focus.includes(f); return <button key={f} type="button" aria-pressed={on} onClick={() => set('skincare_focus', on ? a.skincare_focus.filter((x) => x !== f) : [...a.skincare_focus, f])} className={`px-2.5 py-1 rounded-full border text-xs font-bold ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white'}`}>{on ? '✓ ' : ''}{FOCUS_AR[f]}</button>; })}
              </div>
            </Q>
            <Q n={8} title="القرار: شو نوع التعاون؟" done={comp.q8}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="القرار">
                {ACTION_KEYS.map((k, i) => (
                  <button key={k} type="button" role="radio" aria-checked={a.action === k} onClick={() => set('action', a.action === k ? 'unsure' : k)}
                    className={`py-2 rounded-xl border-2 text-sm font-black ${a.action === k ? (k === 'none' ? 'bg-red-600 border-red-600 text-white' : 'bg-emerald-600 border-emerald-600 text-white') : 'bg-white'}`}>
                    <span className="text-[10px] opacity-60 ml-1" aria-hidden>{i + 1}</span>{ACTION_AR[k]}
                  </button>
                ))}
              </div>
              <textarea className={inputCls} rows={2} placeholder="ملاحظة قصيرة (اختياري)" value={a.notes} onChange={(e) => set('notes', e.target.value)} aria-label="ملاحظات" />
            </Q>

            {/* live outcome — exactly what will be stored */}
            <div className={`rounded-xl p-3 text-sm ${verdict.primary === 'not_relevant' ? 'bg-red-50' : verdict.primary === 'needs_review' ? 'bg-amber-50' : 'bg-emerald-50'}`} aria-live="polite">
              <div className="font-black">النتيجة: <span className={`px-2 py-0.5 rounded-full text-xs ${COLLAB_CLS[verdict.primary]}`}>{vLabels}</span></div>
              {verdict.primary === 'needs_review' && verdict.missing.length > 0 && <div className="text-xs text-gray-700 mt-1">ناقص للقرار: {[...new Set(verdict.missing)].map(missingAr).join(' · ')}</div>}
              <div className="text-[11px] text-gray-500 mt-1">الحالة بعد الحفظ: {verdict.primary === 'not_relevant' ? STATUS_AR.rejected : verdict.primary === 'needs_review' ? STATUS_AR.needs_review : STATUS_AR.verified}{['contacted', 'interested', 'collaborating'].includes(st) ? ` (تبقى «${STATUS_AR[st]}» لأن التواصل بدأ)` : ''}</div>
            </div>

            {err && <div role="alert" className="rounded-lg bg-red-50 text-red-700 text-sm p-2">{err}</div>}
            <div className="flex flex-wrap gap-2 sticky -bottom-4 bg-white py-2 border-t">
              <button disabled={busy} onClick={() => save({ next: true })} className="flex-1 min-w-[9rem] py-2.5 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-50">{busy ? '…' : pos < total ? 'حفظ والتالي ←' : 'حفظ'}</button>
              <button disabled={busy} onClick={() => save()} className="px-4 py-2.5 rounded-xl border text-sm font-bold disabled:opacity-50">حفظ فقط</button>
              {pos < total && <button disabled={busy} onClick={guard(() => onNav(1))} className="px-4 py-2.5 rounded-xl border-2 border-amber-300 text-amber-800 text-sm font-bold">⏳ لاحقاً</button>}
            </div>
            <div className="flex flex-wrap gap-2 items-center text-xs">
              <span className="text-gray-500">استبعاد سريع:</span>
              {Object.entries(REJECT_AR).map(([k, l]) => <button key={k} disabled={busy} onClick={() => reject(k)} className="px-2.5 py-1 rounded-full border border-red-200 text-red-700 disabled:opacity-50">✕ {l}</button>)}
              <button disabled={busy} onClick={del} className="text-red-600 mr-auto">حذف</button>
            </div>
          </div>
        )}

        {/* audit trail */}
        <div className="border-t pt-2">
          <button onClick={hist ? () => setHist(null) : loadHist} className="text-xs text-blue-700 font-bold">{hist ? '▴ إخفاء سجل التغييرات' : '▾ سجل التغييرات'}</button>
          {hist && (
            <div className="mt-2 text-xs bg-gray-50 rounded-lg p-2 space-y-2 max-h-60 overflow-y-auto">
              {hist.length === 0 && <div className="text-gray-500">لا سجل بعد.</div>}
              {hist.map((h, i) => (
                <div key={i}>
                  <div><b>{ACT_AR[h.action] || h.action}</b> · {h.actor} · {new Date(h.created_at).toLocaleString('ar')}</div>
                  {h.action === 'update' && h.changes && typeof h.changes === 'object' && (
                    <ul className="text-gray-600 pr-3">
                      {Object.entries(h.changes).map(([f, c]) => <li key={f}>{FIELD_AR[f] || f}: <span dir="auto">{auditValue(f, c?.from)}</span> ← <span dir="auto">{auditValue(f, c?.to)}</span></li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {editing && (
        <div onClick={(e) => e.stopPropagation()}>
          <CreatorEditModal key={`edit-${row.id}`} row={row} owners={owners} schema={schema} onClose={() => setEditing(false)}
            onSaved={(r, removed) => { setEditing(false); onSaved(r, { removed }); }} pos={0} total={0} />
        </div>
      )}
    </div>
  );
}
