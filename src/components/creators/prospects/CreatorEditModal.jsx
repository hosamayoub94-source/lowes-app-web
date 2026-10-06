// نموذج إضافة/تعديل — امتداد النموذج السابق بالحقول الجديدة (النوع، المحتوى، تخصص العناية، الدولة→المحافظة→المدينة، المصدر الإلزامي).
// قبل تطبيق migration v2 الحقول الجديدة تظهر معطّلة، ويُحفظ القديم فقط.
import { useState } from 'react';
import { call, addProspect, updateProspect } from '@services/creatorProspectsApi';
import {
  PLATFORMS, CREATOR_TYPES, TYPE_AR, CONTENT_TYPES, CONTENT_AR, SKINCARE_FOCUS, FOCUS_AR, STATUSES, STATUS_AR, VERIFICATION, VERIFICATION_AR,
  LOCATION_CONFIDENCE, CONFIDENCE_AR, COUNTRIES, GOVERNORATES, SOURCES, statusOf, profileUrl,
} from './constants';

const inputCls = 'border rounded-lg px-2 py-1.5 text-sm w-full disabled:bg-gray-50 disabled:text-gray-400';
function Field({ label, children, hint }) { return <label className="block text-xs text-gray-600">{label}{hint && <span className="text-gray-400"> — {hint}</span>}{children}</label>; }
const V1_KEYS = ['handle', 'platform', 'name', 'location', 'followers', 'engagement_pct', 'category', 'priority', 'status', 'owner', 'fit', 'evidence', 'source', 'notes'];
const V2_KEYS = ['country', 'governorate', 'city', 'location_confidence', 'creator_type', 'content_types', 'skincare_focus', 'tags', 'bio', 'email', 'phone', 'preferred_contact', 'other_platforms', 'source_url', 'last_active_at', 'verification_status'];
const CONTACT_AR = { instagram_dm: 'رسالة Instagram', whatsapp: 'واتساب', email: 'بريد', phone: 'اتصال' };

function Checks({ all, labels, value, onChange, disabled }) {
  const set = new Set(value || []);
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {all.map((k) => (
        <label key={k} className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs cursor-pointer ${set.has(k) ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
          <input type="checkbox" disabled={disabled} checked={set.has(k)} onChange={(e) => { const n = new Set(set); e.target.checked ? n.add(k) : n.delete(k); onChange(all.filter((x) => n.has(x))); }} />
          {labels[k]}
        </label>
      ))}
    </div>
  );
}

export default function CreatorEditModal({ row, owners, schema, onClose, onSaved, pos, total, hasPrev, hasNext, onNav }) {
  const isNew = !row.id;
  const v2 = schema === 'v2';
  const [f, setF] = useState(() => ({
    platform: 'instagram', country: 'SY', verification_status: 'unverified',
    ...row,
    status: isNew ? (row.status || 'discovered') : statusOf(row.status),
    tagsText: (row.tags || []).join('، '),
    tiktok: row.other_platforms?.tiktok || '', youtube: row.other_platforms?.youtube || '', instagram2: row.platform !== 'instagram' ? row.other_platforms?.instagram || '' : '',
    last_active_at: row.last_active_at ? String(row.last_active_at).slice(0, 10) : '',
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hist, setHist] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const govs = GOVERNORATES[f.country] || [];

  async function save(goNext = false) {
    if (!String(f.handle || '').trim()) { setErr('الحساب إلزامي (@ أو رابط).'); return; }
    if (isNew && !String(f.source || '').trim()) { setErr('مصدر الاكتشاف إلزامي — من وين لقينا الحساب؟'); return; }
    setBusy(true); setErr('');
    const body = {};
    V1_KEYS.forEach((k) => { body[k] = f[k] === undefined ? null : f[k]; });
    if (v2) {
      V2_KEYS.forEach((k) => { body[k] = f[k] === undefined || f[k] === '' ? null : f[k]; });
      body.content_types = f.content_types || [];
      body.skincare_focus = f.skincare_focus || [];
      body.tags = String(f.tagsText || '').split(/[,،]/).map((t) => t.trim()).filter(Boolean);
      const op = {};
      if (f.tiktok) op.tiktok = f.tiktok;
      if (f.youtube) op.youtube = f.youtube;
      if (f.instagram2 && f.platform !== 'instagram') op.instagram = f.instagram2;
      body.other_platforms = Object.keys(op).length ? op : null;
    }
    const res = isNew ? await addProspect(body, schema) : await updateProspect(row.id, body, schema);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error === 'duplicate' ? `مكرر: الحساب موجود أصلاً${res.duplicate?.name ? ` (${res.duplicate.name})` : ''}${res.duplicate?.deleted ? ' — ومحذوف، استرجعه من «المحذوف»' : ''}.` : res.message || res.error);
      return;
    }
    onSaved(res.row, false, goNext);
  }
  async function del() {
    if (!window.confirm('حذف هذا الحساب؟ (حذف ناعم، بتقدر ترجّعه من «المحذوف»)')) return;
    setBusy(true); const res = await call('delete', { id: row.id }); setBusy(false);
    if (res.ok) onSaved(res.row, true); else setErr(res.error);
  }
  async function restore() {
    setBusy(true); const res = await call('restore', { id: row.id }); setBusy(false);
    if (res.ok) onSaved(res.row); else setErr(res.error);
  }
  async function loadHist() { const r = await call('audit', { id: row.id }); setHist(r.ok ? r.entries : []); }
  const url = profileUrl(f);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-4 space-y-3" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-black text-base">{isNew ? 'إضافة حساب' : 'تعديل الحساب'} {!isNew && url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-600 mr-2">فتح الحساب ↗</a>}</h2>
          {!isNew && total > 0 && (
            <div className="flex items-center gap-1 text-xs mr-auto ml-2">
              <button disabled={!hasPrev || busy} onClick={() => onNav(-1)} className="px-2 py-1 rounded-lg border disabled:opacity-30">→ السابق</button>
              <span className="text-gray-500 px-1" dir="ltr">{pos} / {total}</span>
              <button disabled={!hasNext || busy} onClick={() => onNav(1)} className="px-2 py-1 rounded-lg border disabled:opacity-30">التالي ←</button>
            </div>
          )}
          <button onClick={onClose} className="text-gray-400 text-lg" aria-label="إغلاق">✕</button>
        </div>
        {!v2 && <div className="rounded-lg bg-amber-50 text-amber-800 text-xs p-2">الحقول الرمادية (النوع، المحتوى، المحافظة، التواصل…) تُفعَّل بعد تطبيق migration v2. الحفظ الآن يشمل الحقول القديمة فقط.</div>}
        {row.deleted_at && <div className="rounded-lg bg-red-50 text-red-700 text-xs p-2">هذا الحساب محذوف. <button className="underline font-bold" onClick={restore}>استرجاع</button></div>}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Field label="الحساب (@ أو رابط) *"><input className={inputCls} value={f.handle || ''} onChange={(e) => set('handle', e.target.value)} dir="ltr" /></Field>
          <Field label="المنصة الأساسية"><select className={inputCls} value={f.platform} onChange={(e) => set('platform', e.target.value)}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="الاسم"><input className={inputCls} value={f.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="المتابعون" hint="فارغ = غير معروف"><input className={inputCls} value={f.followers ?? ''} onChange={(e) => set('followers', e.target.value)} dir="ltr" placeholder="12500 أو 12.5K" /></Field>
          <Field label="التفاعل %" hint="فارغ = غير معروف"><input className={inputCls} value={f.engagement_pct ?? ''} onChange={(e) => set('engagement_pct', e.target.value)} dir="ltr" /></Field>
          <Field label="آخر نشر (تاريخ)"><input type="date" disabled={!v2} className={inputCls} value={f.last_active_at || ''} onChange={(e) => set('last_active_at', e.target.value)} /></Field>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Field label="الدولة"><select disabled={!v2} className={inputCls} value={f.country || ''} onChange={(e) => { set('country', e.target.value); set('governorate', ''); }}><option value="">—</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code} disabled={!c.enabled}>{c.ar}</option>)}</select></Field>
          <Field label="المحافظة"><select disabled={!v2} className={inputCls} value={f.governorate || ''} onChange={(e) => set('governorate', e.target.value)}><option value="">غير معروفة</option>{govs.map((g) => <option key={g.slug} value={g.slug}>{g.ar}</option>)}</select></Field>
          <Field label="المدينة"><input disabled={!v2} className={inputCls} value={f.city || ''} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="ثقة الموقع"><select disabled={!v2} className={inputCls} value={f.location_confidence || ''} onChange={(e) => set('location_confidence', e.target.value)}><option value="">—</option>{LOCATION_CONFIDENCE.map((c) => <option key={c} value={c}>{CONFIDENCE_AR[c]}</option>)}</select></Field>
        </div>
        {!v2 && <Field label="الموقع (قديم)"><input className={inputCls} value={f.location || ''} onChange={(e) => set('location', e.target.value)} /></Field>}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Field label="نوع المبدع"><select disabled={!v2} className={inputCls} value={f.creator_type || ''} onChange={(e) => set('creator_type', e.target.value)}><option value="">غير مصنّف</option>{CREATOR_TYPES.map((t) => <option key={t} value={t}>{TYPE_AR[t]}</option>)}</select></Field>
          <Field label="الحالة"><select className={inputCls} value={f.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_AR[s]}</option>)}</select></Field>
          <Field label="جودة البيانات"><select disabled={!v2} className={inputCls} value={f.verification_status || 'unverified'} onChange={(e) => set('verification_status', e.target.value)}>{VERIFICATION.map((v) => <option key={v} value={v}>{VERIFICATION_AR[v]}</option>)}</select></Field>
        </div>
        <Field label="أنواع المحتوى (فقط ما رأيناه فعلاً بالحساب)"><Checks all={CONTENT_TYPES} labels={CONTENT_AR} value={f.content_types} onChange={(v) => set('content_types', v)} disabled={!v2} /></Field>
        <Field label="تخصص العناية"><Checks all={SKINCARE_FOCUS} labels={FOCUS_AR} value={f.skincare_focus} onChange={(v) => set('skincare_focus', v)} disabled={!v2} /></Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="مصدر الاكتشاف *">
            <input className={inputCls} list="src-list" value={f.source || ''} onChange={(e) => set('source', e.target.value)} />
            <datalist id="src-list">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="رابط المصدر"><input disabled={!v2} className={inputCls} value={f.source_url || ''} onChange={(e) => set('source_url', e.target.value)} dir="ltr" /></Field>
        </div>

        <details className="rounded-lg border p-2" open={!!(f.email || f.phone || f.tiktok || f.youtube)}>
          <summary className="text-xs font-bold cursor-pointer">التواصل والمنصات الأخرى (عام فقط)</summary>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
            <Field label="البريد"><input disabled={!v2} className={inputCls} value={f.email || ''} onChange={(e) => set('email', e.target.value)} dir="ltr" /></Field>
            <Field label="الهاتف"><input disabled={!v2} className={inputCls} value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} dir="ltr" /></Field>
            <Field label="التواصل المفضل"><select disabled={!v2} className={inputCls} value={f.preferred_contact || ''} onChange={(e) => set('preferred_contact', e.target.value)}><option value="">—</option>{Object.entries(CONTACT_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            {f.platform !== 'instagram' && <Field label="Instagram"><input disabled={!v2} className={inputCls} value={f.instagram2} onChange={(e) => set('instagram2', e.target.value)} dir="ltr" /></Field>}
            <Field label="TikTok"><input disabled={!v2} className={inputCls} value={f.tiktok} onChange={(e) => set('tiktok', e.target.value)} dir="ltr" /></Field>
            <Field label="YouTube"><input disabled={!v2} className={inputCls} value={f.youtube} onChange={(e) => set('youtube', e.target.value)} dir="ltr" /></Field>
          </div>
        </details>

        <Field label="Bio (نص عام من الحساب)"><textarea disabled={!v2} className={inputCls} rows={2} value={f.bio || ''} onChange={(e) => set('bio', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="وسوم (مفصولة بفاصلة)"><input disabled={!v2} className={inputCls} value={f.tagsText} onChange={(e) => set('tagsText', e.target.value)} placeholder="أفضل UGC، مراسلة" /></Field>
          <Field label="المسؤول">
            <input className={inputCls} list="owner-list" value={f.owner || ''} onChange={(e) => set('owner', e.target.value)} />
            <datalist id="owner-list">{owners.map((o) => <option key={o} value={o} />)}</datalist>
          </Field>
        </div>
        <Field label="سبب الاستهداف"><input className={inputCls} value={f.fit || ''} onChange={(e) => set('fit', e.target.value)} /></Field>
        <Field label="ملاحظات"><textarea className={inputCls} rows={3} value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>

        {err && <div className="rounded-lg bg-red-50 text-red-700 text-sm p-2">{err}</div>}
        <div className="flex gap-2 items-center flex-wrap">
          <button disabled={busy} onClick={() => save(false)} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-50">{busy ? '…' : 'حفظ'}</button>
          {!isNew && hasNext && <button disabled={busy} onClick={() => save(true)} className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">حفظ والتالي ←</button>}
          {!isNew && !row.deleted_at && <button disabled={busy} onClick={del} className="px-4 py-2 rounded-xl border border-red-300 text-red-700 text-sm font-bold">حذف</button>}
          {!isNew && <button onClick={loadHist} className="text-xs text-blue-600 mr-auto">سجل التغييرات</button>}
        </div>
        {hist && (
          <div className="text-xs bg-gray-50 rounded-lg p-2 space-y-1 max-h-40 overflow-y-auto">
            {hist.length === 0 && <div className="text-gray-500">لا سجل بعد.</div>}
            {hist.map((h, i) => <div key={i}><b>{h.action}</b> · {h.actor} · {new Date(h.created_at).toLocaleString('ar')}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
