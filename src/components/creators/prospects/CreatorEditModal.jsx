// نموذج المراجعة/الإضافة — مصمم لشغل الفريق اليومي: افتح الحساب على Instagram ← علّم شو شفت ← قرّر ← التالي.
// الأساسي ظاهر (الهوية + شو شفت + القرار)، وكل الباقي تحت «تفاصيل أكثر». لا حقل إجباري غير الاسم أو الحساب.
import { useState } from 'react';
import { call, addProspect, updateProspect } from '@services/creatorProspectsApi';
import {
  PLATFORMS, CREATOR_TYPES, TYPE_AR, CONTENT_TYPES, CONTENT_AR, SKINCARE_FOCUS, FOCUS_AR, STATUSES, STATUS_AR, VERIFICATION, VERIFICATION_AR,
  LOCATION_CONFIDENCE, CONFIDENCE_AR, COUNTRIES, GOVERNORATES, SOURCES, statusOf, instagramUrl, profileUrl, isPending,
} from './constants';

const inputCls = 'border rounded-lg px-2 py-1.5 text-sm w-full disabled:bg-gray-50 disabled:text-gray-400';
function Field({ label, children, hint }) { return <label className="block text-xs text-gray-600">{label}{hint && <span className="text-gray-400"> — {hint}</span>}{children}</label>; }
const V1_KEYS = ['handle', 'platform', 'name', 'location', 'followers', 'engagement_pct', 'category', 'priority', 'status', 'owner', 'fit', 'evidence', 'source', 'notes'];
const V2_KEYS = ['country', 'governorate', 'city', 'location_confidence', 'creator_type', 'content_types', 'skincare_focus', 'tags', 'bio', 'email', 'phone', 'preferred_contact', 'other_platforms', 'source_url', 'last_active_at', 'verification_status'];
const CONTACT_AR = { instagram_dm: 'رسالة Instagram', whatsapp: 'واتساب', email: 'بريد', phone: 'اتصال' };
// Type chips in the order the team should think: what LOWE'S needs most first.
const TYPE_ORDER = ['ugc', 'skincare', 'reviewer', 'unboxing', 'beauty', 'expert', 'general'];
const TYPE_SHORT = { ugc: 'UGC', skincare: 'Skincare', reviewer: 'مراجع منتجات', unboxing: 'Unboxing', beauty: 'Beauty', expert: 'طبيب/صيدلاني', general: 'مؤثر عام' };

const pill = (on, tone = 'emerald') => `px-3 py-1.5 rounded-full border text-xs font-bold transition ${on
  ? (tone === 'dark' ? 'bg-gray-900 text-white border-gray-900' : 'bg-emerald-600 text-white border-emerald-600')
  : 'bg-white text-gray-700 hover:bg-gray-50'}`;

function Toggles({ all, labels, value, onChange, disabled }) {
  const set = new Set(value || []);
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((k) => (
        <button type="button" key={k} disabled={disabled} onClick={() => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); onChange(all.filter((x) => n.has(x))); }}
          className={`${pill(set.has(k))} disabled:opacity-40`}>{set.has(k) ? '✓ ' : ''}{labels[k]}</button>
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
    handle: isPending(row) ? '' : row.handle,
    status: isNew ? (row.status || 'discovered') : statusOf(row.status),
    tagsText: (row.tags || []).join('، '),
    tiktok: row.other_platforms?.tiktok || '', youtube: row.other_platforms?.youtube || '', instagram2: row.platform !== 'instagram' ? row.other_platforms?.instagram || '' : '',
    last_active_at: row.last_active_at ? String(row.last_active_at).slice(0, 10) : '',
  }));
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hist, setHist] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const govs = GOVERNORATES[f.country] || [];

  async function save({ status, next = false } = {}) {
    if (!String(f.handle || '').trim() && !String(f.name || '').trim()) { setErr('اكتب الاسم أو الحساب على الأقل — الباقي اختياري.'); return; }
    setBusy(true); setErr('');
    const st = status || f.status;
    const body = {};
    V1_KEYS.forEach((k) => { body[k] = f[k] === undefined ? null : f[k]; });
    body.status = st;
    if (!String(f.handle || '').trim() && isPending(row)) body.handle = row.handle; // keep the placeholder until a real account is typed
    else if (isPending(row) && body.platform === 'other') body.platform = 'instagram'; // real account typed for a name-only entry
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
      // A decision made after looking at the account = a manual check today.
      if (status && status !== 'needs_review' && !isNew) { body.verification_status = f.verification_status === 'verified' ? 'verified' : 'partial'; body.last_verified_at = new Date().toISOString(); }
    }
    const res = isNew ? await addProspect(body, schema) : await updateProspect(row.id, body, schema);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error === 'duplicate' ? `مكرر: الحساب موجود أصلاً${res.duplicate?.name ? ` (${res.duplicate.name})` : ''}${res.duplicate?.deleted ? ' — ومحذوف، استرجعه من «المحذوف»' : ''}.` : res.message || res.error);
      return;
    }
    onSaved(res.row, false, next);
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
  const ig = instagramUrl(f) || profileUrl(f);
  const decide = (status) => save({ status, next: hasNext });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto p-4 space-y-4" dir="rtl" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center gap-2">
          <h2 className="font-black text-base">{isNew ? 'إضافة حساب' : 'مراجعة الحساب'}</h2>
          {!isNew && total > 0 && (
            <div className="flex items-center gap-1 text-xs mr-auto">
              <button disabled={!hasPrev || busy} onClick={() => onNav(-1)} className="px-2 py-1 rounded-lg border disabled:opacity-30" aria-label="السابق">→</button>
              <span className="text-gray-500 px-1" dir="ltr">{pos} / {total}</span>
              <button disabled={!hasNext || busy} onClick={() => onNav(1)} className="px-2 py-1 rounded-lg border disabled:opacity-30" aria-label="التالي">←</button>
            </div>
          )}
          <button onClick={onClose} className={`text-gray-400 text-lg ${isNew || !total ? 'mr-auto' : ''}`} aria-label="إغلاق">✕</button>
        </div>
        {!v2 && <div className="rounded-lg bg-amber-50 text-amber-800 text-xs p-2">بعض الحقول تُفعَّل بعد تطبيق migration v2.</div>}
        {row.deleted_at && <div className="rounded-lg bg-red-50 text-red-700 text-xs p-2">هذا الحساب محذوف. <button className="underline font-bold" onClick={restore}>استرجاع</button></div>}

        {/* 1) who */}
        <div className="grid grid-cols-2 gap-2">
          <Field label="الاسم"><input className={inputCls} value={f.name || ''} onChange={(e) => set('name', e.target.value)} autoFocus={isNew} /></Field>
          <Field label="الحساب أو الرابط" hint="اختياري"><input className={inputCls} value={f.handle || ''} onChange={(e) => set('handle', e.target.value)} dir="ltr" placeholder="@username" /></Field>
        </div>
        {!isNew && ig && (
          <a href={ig} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gradient-to-l from-pink-500 to-amber-400 text-white text-sm font-black">
            افتح الحساب على Instagram وشوف المحتوى ↗
          </a>
        )}

        {/* 2) what did you see */}
        <div className="space-y-2 rounded-xl bg-gray-50 p-3">
          <div className="text-xs font-black text-gray-700">{isNew ? 'شو بتعرف عنه؟ (اختياري)' : 'شو شفت بالحساب؟'}</div>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_ORDER.map((t) => (
              <button type="button" key={t} disabled={!v2} onClick={() => set('creator_type', f.creator_type === t ? '' : t)} className={`${pill(f.creator_type === t, 'dark')} disabled:opacity-40`}>{TYPE_SHORT[t]}</button>
            ))}
          </div>
          <div className="text-[11px] text-gray-500 pt-1">يصوّر:</div>
          <Toggles all={CONTENT_TYPES} labels={CONTENT_AR} value={f.content_types} onChange={(v) => set('content_types', v)} disabled={!v2} />
          <div className="text-[11px] text-gray-500 pt-1">منتجات عناية ظاهرة:</div>
          <Toggles all={SKINCARE_FOCUS} labels={FOCUS_AR} value={f.skincare_focus} onChange={(v) => set('skincare_focus', v)} disabled={!v2} />
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Field label="المحافظة"><select disabled={!v2} className={inputCls} value={f.governorate || ''} onChange={(e) => set('governorate', e.target.value)}><option value="">غير معروفة</option>{govs.map((g) => <option key={g.slug} value={g.slug}>{g.ar}</option>)}</select></Field>
            <Field label="ملاحظة قصيرة"><input className={inputCls} value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="مثلاً: بتصور روتين بشرة بالريلز" /></Field>
          </div>
        </div>

        {/* 3) decision */}
        {err && <div className="rounded-lg bg-red-50 text-red-700 text-sm p-2">{err}</div>}
        {isNew ? (
          <button disabled={busy} onClick={() => save()} className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-50">{busy ? '…' : 'حفظ'}</button>
        ) : (
          <div className="space-y-1.5">
            <div className="text-xs font-black text-gray-700">القرار{hasNext ? ' — وبينتقل للتالي تلقائياً' : ''}:</div>
            <div className="grid grid-cols-3 gap-2">
              <button disabled={busy} onClick={() => decide('verified')} className="py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black disabled:opacity-50">✓ مناسب</button>
              <button disabled={busy} onClick={() => decide('needs_review')} className="py-2.5 rounded-xl border-2 border-amber-400 text-amber-800 text-sm font-black disabled:opacity-50">⏳ لاحقاً</button>
              <button disabled={busy} onClick={() => decide('rejected')} className="py-2.5 rounded-xl border-2 border-red-300 text-red-700 text-sm font-black disabled:opacity-50">✕ غير مناسب</button>
            </div>
            <div className="flex gap-3 items-center text-xs pt-1">
              <button disabled={busy} onClick={() => save()} className="font-bold text-gray-700 underline disabled:opacity-50">حفظ بدون قرار</button>
              {!row.deleted_at && <button disabled={busy} onClick={del} className="text-red-600">حذف</button>}
              <button onClick={loadHist} className="text-blue-600 mr-auto">سجل التغييرات</button>
            </div>
          </div>
        )}

        {/* 4) everything else */}
        <button type="button" onClick={() => setMore((m) => !m)} className="w-full text-xs font-bold text-gray-500 border-t pt-3">{more ? '▴ إخفاء التفاصيل' : '▾ تفاصيل أكثر (متابعين، مصدر، تواصل، حالة…)'}</button>
        {more && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Field label="المتابعون" hint="فارغ = غير معروف"><input className={inputCls} value={f.followers ?? ''} onChange={(e) => set('followers', e.target.value)} dir="ltr" placeholder="12500 أو 12.5K" /></Field>
              <Field label="التفاعل %"><input className={inputCls} value={f.engagement_pct ?? ''} onChange={(e) => set('engagement_pct', e.target.value)} dir="ltr" /></Field>
              <Field label="آخر نشر"><input type="date" disabled={!v2} className={inputCls} value={f.last_active_at || ''} onChange={(e) => set('last_active_at', e.target.value)} /></Field>
              <Field label="المنصة الأساسية"><select className={inputCls} value={f.platform} onChange={(e) => set('platform', e.target.value)}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select></Field>
              <Field label="الدولة"><select disabled={!v2} className={inputCls} value={f.country || ''} onChange={(e) => { set('country', e.target.value); set('governorate', ''); }}><option value="">—</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code} disabled={!c.enabled}>{c.ar}</option>)}</select></Field>
              <Field label="المدينة"><input disabled={!v2} className={inputCls} value={f.city || ''} onChange={(e) => set('city', e.target.value)} /></Field>
              <Field label="ثقة الموقع"><select disabled={!v2} className={inputCls} value={f.location_confidence || ''} onChange={(e) => set('location_confidence', e.target.value)}><option value="">—</option>{LOCATION_CONFIDENCE.map((c) => <option key={c} value={c}>{CONFIDENCE_AR[c]}</option>)}</select></Field>
              <Field label="الحالة"><select className={inputCls} value={f.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_AR[s]}</option>)}</select></Field>
              <Field label="جودة البيانات"><select disabled={!v2} className={inputCls} value={f.verification_status || 'unverified'} onChange={(e) => set('verification_status', e.target.value)}>{VERIFICATION.map((v) => <option key={v} value={v}>{VERIFICATION_AR[v]}</option>)}</select></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="مصدر الاكتشاف" hint="الافتراضي Manual">
                <input className={inputCls} list="src-list" value={f.source || ''} onChange={(e) => set('source', e.target.value)} />
                <datalist id="src-list">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
              </Field>
              <Field label="رابط المصدر"><input disabled={!v2} className={inputCls} value={f.source_url || ''} onChange={(e) => set('source_url', e.target.value)} dir="ltr" /></Field>
              <Field label="البريد (عام)"><input disabled={!v2} className={inputCls} value={f.email || ''} onChange={(e) => set('email', e.target.value)} dir="ltr" /></Field>
              <Field label="الهاتف (عام)"><input disabled={!v2} className={inputCls} value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} dir="ltr" /></Field>
              <Field label="التواصل المفضل"><select disabled={!v2} className={inputCls} value={f.preferred_contact || ''} onChange={(e) => set('preferred_contact', e.target.value)}><option value="">—</option>{Object.entries(CONTACT_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="المسؤول">
                <input className={inputCls} list="owner-list" value={f.owner || ''} onChange={(e) => set('owner', e.target.value)} />
                <datalist id="owner-list">{owners.map((o) => <option key={o} value={o} />)}</datalist>
              </Field>
              {f.platform !== 'instagram' && <Field label="Instagram"><input disabled={!v2} className={inputCls} value={f.instagram2} onChange={(e) => set('instagram2', e.target.value)} dir="ltr" /></Field>}
              <Field label="TikTok"><input disabled={!v2} className={inputCls} value={f.tiktok} onChange={(e) => set('tiktok', e.target.value)} dir="ltr" /></Field>
              <Field label="YouTube"><input disabled={!v2} className={inputCls} value={f.youtube} onChange={(e) => set('youtube', e.target.value)} dir="ltr" /></Field>
              <Field label="وسوم"><input disabled={!v2} className={inputCls} value={f.tagsText} onChange={(e) => set('tagsText', e.target.value)} placeholder="أفضل UGC، مراسلة" /></Field>
            </div>
            <Field label="Bio"><textarea disabled={!v2} className={inputCls} rows={2} value={f.bio || ''} onChange={(e) => set('bio', e.target.value)} /></Field>
            <Field label="سبب الاستهداف"><input className={inputCls} value={f.fit || ''} onChange={(e) => set('fit', e.target.value)} /></Field>
            {!isNew && <button disabled={busy} onClick={() => save()} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-50">{busy ? '…' : 'حفظ'}</button>}
          </div>
        )}
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
