// =============================================================
// CreatorProspectsScreen — «صناع المحتوى»: قائمة مُدارة (إضافة · تعديل · تصنيف · حذف ناعم · رفع Excel/CSV).
// كل العمليات عبر Edge Function `creator-prospects` (جلسة حقيقية + أدمن فقط). الجدول نفسه مقفول عن التطبيق.
// منع التكرار: قيد فريد بالقاعدة (منصة + حساب) + معاينة قبل الاستيراد. «مكرر محتمل» = نفس الاسم أو نفس الحساب بمنصة أخرى.
// =============================================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@services/supabase';
import { ROUTES } from '@routes/paths';

const NICHE = ['skincare', 'beauty', 'makeup', 'hair'];
const CAT_AR = { skincare: 'عناية بالبشرة', beauty: 'جمال', makeup: 'مكياج', hair: 'شعر', fashion: 'أزياء', motherhood: 'أمومة', wellness: 'صحة', food: 'طعام', art: 'فن', fitness: 'لياقة', entertainment: 'ترفيه', music: 'موسيقى' };
const STATUS_AR = { new: 'جديد', reviewing: 'قيد المراجعة', approved: 'معتمد', contacted: 'تم التواصل', package_sent: 'أُرسلت الباقة', posted: 'نُشر', declined: 'اعتذر', rejected: 'مرفوض' };
const STATUS_CLS = { new: 'bg-gray-100 text-gray-700', reviewing: 'bg-amber-100 text-amber-800', approved: 'bg-emerald-100 text-emerald-800', contacted: 'bg-blue-100 text-blue-800', package_sent: 'bg-indigo-100 text-indigo-800', posted: 'bg-green-200 text-green-900', declined: 'bg-orange-100 text-orange-800', rejected: 'bg-red-100 text-red-700' };
const COHORT_AR = { legacy_original: 'الأصلية', legacy_discovery: 'اكتشاف (غير مؤكد)', manual: 'يدوي' };
const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'facebook', 'other'];
const BANDS = [['<5K', 0, 5e3], ['5K–10K', 5e3, 1e4], ['10K–25K', 1e4, 2.5e4], ['25K–50K', 2.5e4, 5e4], ['50K–100K', 5e4, 1e5], ['100K–250K', 1e5, 2.5e5], ['250K+', 2.5e5, Infinity]];

const bandOf = n => (n == null ? '' : (BANDS.find(([, a, b]) => n >= a && n < b) || [''])[0]);
const cohortLabel = c => COHORT_AR[c] || (c || '').replace('research_', 'بحث ').replace('import_', 'استيراد ');
function fmt(n) {
  if (n == null || n === '') return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

async function call(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('creator-prospects', { body: { action, ...payload } });
  if (error) {
    let body = null;
    try { body = await error.context.clone().json(); } catch { /* not json */ }
    const st = error.context?.status;
    if (st === 401) return { ok: false, error: 'جلستك بلا هوية حقيقية — سجّل خروج ثم ادخل بالـPIN.' };
    if (st === 403) return { ok: false, error: 'هذا القسم للأدمن فقط.' };
    return body && body.ok === false ? body : { ok: false, error: error.message };
  }
  return data;
}

// ---- header aliases for uploads (English + Arabic) ----
const ALIASES = {
  handle: ['handle', 'account', 'username', 'user', 'الحساب', 'اسمالمستخدم', 'instagram', 'حساب'],
  profile_url: ['url', 'profileurl', 'link', 'الرابط', 'رابط'],
  name: ['name', 'creator', 'displayname', 'الاسم', 'اسمالمبدع'],
  platform: ['platform', 'المنصة'],
  followers: ['followers', 'followerssnapshot', 'followercount', 'المتابعون', 'متابعين', 'عددالمتابعين'],
  engagement_pct: ['engagement', 'engagementsignal', 'er', 'engagementrate', 'التفاعل', 'نسبةالتفاعل'],
  location: ['location', 'city', 'المدينة', 'الموقع'],
  category: ['category', 'niche', 'الفئة', 'التصنيف'],
  priority: ['priority', 'الأولوية', 'الاولوية'],
  fit: ['fit', 'الملاءمة', 'سببالاستهداف'],
  evidence: ['evidence', 'evidencelevel', 'confidence', 'الثقة', 'مستوىالثقة'],
  source: ['source', 'المصدر'],
  notes: ['notes', 'note', 'ملاحظات', 'ملاحظة'],
  owner: ['owner', 'assignedto', 'المسؤول'],
  status: ['status', 'الحالة'],
};
const keyNorm = s => String(s || '').toLowerCase().replace(/[\s_\-.]/g, '');
function mapRows(sheetRows) {
  if (!sheetRows.length) return [];
  const headers = Object.keys(sheetRows[0]);
  const map = {};
  headers.forEach(h => { const k = keyNorm(h); for (const [field, al] of Object.entries(ALIASES)) if (al.map(keyNorm).includes(k)) { map[h] = field; break; } });
  return sheetRows.map(r => { const o = {}; for (const [h, f] of Object.entries(map)) if (r[h] !== '' && r[h] != null && o[f] == null) o[f] = r[h]; return o; })
    .filter(o => Object.keys(o).length > 0);
}
async function readFile(file) {
  const XLSX = await import('xlsx');
  const isCsv = /\.csv$/i.test(file.name);
  const wb = isCsv ? XLSX.read(await file.text(), { type: 'string' }) : XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return mapRows(XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }));
}
function downloadTemplate() {
  const csv = '﻿handle,name,platform,followers,engagement,location,category,priority,fit,source,notes\n@example_handle,اسم المبدع,instagram,12500,3.2%,Damascus,skincare,P1,روتين عناية,بحث يدوي,ملاحظة اختيارية\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'creators-upload-template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

const inputCls = 'border rounded-lg px-2 py-1.5 text-sm w-full';
function Field({ label, children }) { return <label className="block text-xs text-gray-600">{label}{children}</label>; }

function EditModal({ row, owners, categories, onClose, onSaved }) {
  const isNew = !row.id;
  const [f, setF] = useState({ platform: 'instagram', status: 'new', verified: false, ...row });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [hist, setHist] = useState(null);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true); setErr('');
    const keys = ['handle', 'platform', 'name', 'location', 'followers', 'engagement_pct', 'category', 'priority', 'status', 'owner', 'verified', 'fit', 'evidence', 'source', 'notes'];
    const body = {}; keys.forEach(k => { body[k] = f[k] === undefined ? null : f[k]; });
    const res = isNew ? await call('add', { row: body }) : await call('update', { id: row.id, patch: body });
    setBusy(false);
    if (!res.ok) {
      setErr(res.error === 'duplicate' ? `مكرر: الحساب موجود أصلاً${res.duplicate?.name ? ` (${res.duplicate.name})` : ''}${res.duplicate?.deleted ? ' — ومحذوف، استرجعه من «المحذوف»' : ''}.` : res.error);
      return;
    }
    onSaved(res.row);
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

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-4 space-y-3" dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-black text-base">{isNew ? 'إضافة حساب' : 'تعديل الحساب'}</h2>
          <button onClick={onClose} className="text-gray-400 text-lg">✕</button>
        </div>
        {row.deleted_at && <div className="rounded-lg bg-red-50 text-red-700 text-xs p-2">هذا الحساب محذوف. <button className="underline font-bold" onClick={restore}>استرجاع</button></div>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="الحساب (@ أو رابط)"><input className={inputCls} value={f.handle || ''} onChange={e => set('handle', e.target.value)} dir="ltr" /></Field>
          <Field label="المنصة"><select className={inputCls} value={f.platform} onChange={e => set('platform', e.target.value)}>{PLATFORMS.map(p => <option key={p}>{p}</option>)}</select></Field>
          <Field label="الاسم"><input className={inputCls} value={f.name || ''} onChange={e => set('name', e.target.value)} /></Field>
          <Field label="المدينة"><input className={inputCls} value={f.location || ''} onChange={e => set('location', e.target.value)} /></Field>
          <Field label="المتابعون (مثال 12500 أو 12.5K)"><input className={inputCls} value={f.followers ?? ''} onChange={e => set('followers', e.target.value)} dir="ltr" /></Field>
          <Field label="التفاعل %"><input className={inputCls} value={f.engagement_pct ?? ''} onChange={e => set('engagement_pct', e.target.value)} dir="ltr" /></Field>
          <Field label="الفئة">
            <input className={inputCls} list="cat-list" value={f.category || ''} onChange={e => set('category', e.target.value)} />
            <datalist id="cat-list">{categories.map(c => <option key={c} value={c}>{CAT_AR[c] || c}</option>)}</datalist>
          </Field>
          <Field label="الأولوية"><select className={inputCls} value={f.priority || ''} onChange={e => set('priority', e.target.value)}><option value="">—</option><option>P0</option><option>P1</option><option>P2</option></select></Field>
          <Field label="الحالة"><select className={inputCls} value={f.status} onChange={e => set('status', e.target.value)}>{Object.entries(STATUS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="المسؤول">
            <input className={inputCls} list="owner-list" value={f.owner || ''} onChange={e => set('owner', e.target.value)} />
            <datalist id="owner-list">{owners.map(o => <option key={o} value={o} />)}</datalist>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.verified} onChange={e => set('verified', e.target.checked)} /> تم التحقق يدوياً (فتحنا الحساب وتأكدنا)</label>
        <Field label="سبب الاستهداف"><input className={inputCls} value={f.fit || ''} onChange={e => set('fit', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="مستوى الثقة"><input className={inputCls} value={f.evidence || ''} onChange={e => set('evidence', e.target.value)} /></Field>
          <Field label="المصدر"><input className={inputCls} value={f.source || ''} onChange={e => set('source', e.target.value)} /></Field>
        </div>
        <Field label="ملاحظات"><textarea className={inputCls} rows={3} value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
        {err && <div className="rounded-lg bg-red-50 text-red-700 text-sm p-2">{err}</div>}
        <div className="flex gap-2 items-center">
          <button disabled={busy} onClick={save} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-50">{busy ? '…' : 'حفظ'}</button>
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

function ImportModal({ onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState(null);
  const [merge, setMerge] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(''); setReport(null); setDone(null); setFileName(file.name); setBusy(true);
    try {
      const parsed = await readFile(file);
      if (parsed.length === 0) throw new Error('الملف فاضي أو الأعمدة غير معروفة. حمّل القالب وانسخ بياناتك عليه.');
      if (parsed.length > 2000) throw new Error('الحد الأقصى 2000 صف بالمرة الواحدة.');
      setRows(parsed);
      const res = await call('import', { rows: parsed, dry_run: true });
      if (!res.ok) throw new Error(res.error);
      setReport(res);
    } catch (ex) { setErr(ex.message || 'تعذّرت قراءة الملف'); }
    setBusy(false);
  }
  async function confirm() {
    setBusy(true); setErr('');
    const res = await call('import', { rows, dry_run: false, merge, label: fileName });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setDone(res); onDone();
  }
  const s = report?.summary;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-2" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto p-4 space-y-3" dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="font-black text-base">رفع ملف (Excel / CSV)</h2><button onClick={onClose} className="text-gray-400 text-lg">✕</button></div>
        <div className="text-xs text-gray-600 leading-6">
          الأعمدة المعروفة (عربي أو إنجليزي): handle · name · platform · followers · engagement · location · category · priority · fit · source · notes.
          العمود الوحيد الإجباري هو <b>handle</b> (أو رابط الحساب). المكرر ما بينضاف مرتين.
          <button onClick={downloadTemplate} className="text-blue-600 font-bold mr-2">⬇ تحميل القالب</button>
        </div>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={pick} className="text-sm" disabled={busy} />
        {busy && <div className="text-sm text-gray-500">جارٍ المعالجة…</div>}
        {err && <div className="rounded-lg bg-red-50 text-red-700 text-sm p-2">{err}</div>}
        {s && !done && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-xl bg-emerald-50 p-2"><div className="text-lg font-black text-emerald-700">{s.new}</div>جديد</div>
              <div className="rounded-xl bg-amber-50 p-2"><div className="text-lg font-black text-amber-700">{s.duplicate_existing}</div>مكرر (موجود)</div>
              <div className="rounded-xl bg-gray-100 p-2"><div className="text-lg font-black text-gray-700">{s.duplicate_in_file}</div>مكرر داخل الملف</div>
              <div className="rounded-xl bg-red-50 p-2"><div className="text-lg font-black text-red-700">{s.invalid}</div>غير صالح</div>
            </div>
            {report.new.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-bold">الجديد ({s.new})</summary><div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">{report.new.map(n => <div key={n.line}>@{n.handle} {n.name ? `· ${n.name}` : ''} {n.followers ? `· ${fmt(n.followers)}` : ''}</div>)}</div></details>}
            {report.duplicate_existing.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-bold">المكرر الموجود ({s.duplicate_existing})</summary><div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">{report.duplicate_existing.map(d => <div key={d.line}>@{d.handle} {d.existing_name ? `· ${d.existing_name}` : ''} {d.deleted ? '· (محذوف)' : ''} {d.fills.length ? `· يكمّل: ${d.fills.join('، ')}` : ''}</div>)}</div></details>}
            {report.invalid.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-bold text-red-700">غير الصالح ({s.invalid})</summary><div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">{report.invalid.map(d => <div key={d.line}>سطر {d.line}: {d.reason}</div>)}</div></details>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={merge} onChange={e => setMerge(e.target.checked)} /> للمكرر: املأ الحقول الفاضية فقط (ما بنمسح ولا بنبدّل شي موجود)</label>
            <button disabled={busy || s.new + (merge ? s.duplicate_existing : 0) === 0} onClick={confirm} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-40">استيراد {s.new} جديد</button>
          </>
        )}
        {done && <div className="rounded-xl bg-emerald-50 text-emerald-800 text-sm p-3">تم: أُضيف {done.inserted} جديد{done.merged ? `، وأُكمل ${done.merged} موجود` : ''}، وتُجوهل {done.summary.duplicate_existing + done.summary.duplicate_in_file} مكرر.</div>}
      </div>
    </div>
  );
}

export default function CreatorProspectsScreen() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [q, setQ] = useState('');
  const [f, setF] = useState({ cohort: '', status: '', priority: '', category: '', owner: '', band: '', niche: true, dupOnly: false });
  const [edit, setEdit] = useState(null);
  const [importing, setImporting] = useState(false);
  const [sel, setSel] = useState(new Set());
  const [bulk, setBulk] = useState({ status: '', owner: '', priority: '', category: '' });
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const res = await call('list', { include_deleted: showDeleted });
    if (!res.ok) { setErr(res.error); return; }
    setErr(''); setRows(res.rows);
  }, [showDeleted]);
  useEffect(() => { load(); }, [load]);

  const active = useMemo(() => (rows || []).filter(r => !r.deleted_at), [rows]);
  const dupIds = useMemo(() => {
    const byName = new Map(), byKey = new Map(); const out = new Set();
    active.forEach(r => {
      const n = (r.name || '').trim().toLowerCase();
      if (n.length >= 4) { byName.set(n, [...(byName.get(n) || []), r.id]); }
      byKey.set(r.handle_key, [...(byKey.get(r.handle_key) || []), r.id]);
    });
    [...byName.values(), ...byKey.values()].forEach(ids => { if (ids.length > 1) ids.forEach(i => out.add(i)); });
    return out;
  }, [active]);
  const owners = useMemo(() => [...new Set(active.map(r => r.owner).filter(Boolean))], [active]);
  const categories = useMemo(() => [...new Set([...NICHE, ...active.map(r => r.category).filter(Boolean)])], [active]);
  const cohorts = useMemo(() => [...new Set(active.map(r => r.cohort).filter(Boolean))], [active]);

  const shown = useMemo(() => (rows || []).filter(r => {
    if (!showDeleted && r.deleted_at) return false;
    if (showDeleted && !r.deleted_at) return false;
    if (f.niche && !NICHE.includes(r.category) && !(r.priority)) return false;
    if (f.cohort && r.cohort !== f.cohort) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.priority && r.priority !== f.priority) return false;
    if (f.category && r.category !== f.category) return false;
    if (f.owner && r.owner !== f.owner) return false;
    if (f.band && bandOf(r.followers) !== f.band) return false;
    if (f.dupOnly && !dupIds.has(r.id)) return false;
    if (q && !`${r.name || ''} ${r.handle || ''}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    const pr = x => (x.priority ? Number(x.priority[1]) : 9);
    if (pr(a) !== pr(b)) return pr(a) - pr(b);
    const dis = x => (x.cohort === 'legacy_discovery' ? 1 : 0);
    if (dis(a) !== dis(b)) return dis(a) - dis(b);
    return (b.followers || 0) - (a.followers || 0);
  }), [rows, showDeleted, f, q, dupIds]);

  const setFilter = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggle = id => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  function onSaved(row, removed) {
    setRows(prev => (prev || []).map(r => (r.id === row.id ? row : r)).concat((prev || []).some(r => r.id === row.id) ? [] : [row]));
    if (removed) setRows(prev => (showDeleted ? prev : (prev || []).filter(r => r.id !== row.id)));
    setEdit(null);
  }
  async function applyBulk() {
    const patch = {}; Object.entries(bulk).forEach(([k, v]) => { if (v) patch[k] = v; });
    if (!Object.keys(patch).length || !sel.size) return;
    const res = await call('bulk_update', { ids: [...sel], patch });
    if (!res.ok) { setMsg(res.error); return; }
    setMsg(`تم تحديث ${res.updated} حساب`); setSel(new Set()); setBulk({ status: '', owner: '', priority: '', category: '' }); load();
  }

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-black text-lg ml-auto">صناع المحتوى</h1>
        <button onClick={() => setEdit({})} className="px-3 py-1.5 rounded-xl bg-gray-900 text-white text-xs font-bold">+ إضافة</button>
        <button onClick={() => setImporting(true)} className="px-3 py-1.5 rounded-xl border text-xs font-bold">⬆ رفع ملف</button>
        <Link to={ROUTES.SYRIA_LEADS} className="text-xs font-bold text-blue-600">ليدز سوريا ←</Link>
      </div>
      {err && <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3">{err}</div>}
      {msg && <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm p-2">{msg}</div>}
      {!rows && !err && <div className="text-sm text-gray-500">جارٍ التحميل…</div>}
      {rows && (
        <>
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم أو الحساب" className="border rounded-lg px-2 py-1.5 text-sm" />
            <select value={f.status} onChange={e => setFilter('status', e.target.value)} className="border rounded-lg px-2 py-1.5"><option value="">كل الحالات</option>{Object.entries(STATUS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select value={f.priority} onChange={e => setFilter('priority', e.target.value)} className="border rounded-lg px-2 py-1.5"><option value="">كل الأولويات</option><option>P0</option><option>P1</option><option>P2</option></select>
            <select value={f.category} onChange={e => setFilter('category', e.target.value)} className="border rounded-lg px-2 py-1.5"><option value="">كل الفئات</option>{categories.map(c => <option key={c} value={c}>{CAT_AR[c] || c}</option>)}</select>
            <select value={f.band} onChange={e => setFilter('band', e.target.value)} className="border rounded-lg px-2 py-1.5"><option value="">كل الشرائح</option>{BANDS.map(([b]) => <option key={b}>{b}</option>)}</select>
            <select value={f.owner} onChange={e => setFilter('owner', e.target.value)} className="border rounded-lg px-2 py-1.5"><option value="">كل المسؤولين</option>{owners.map(o => <option key={o}>{o}</option>)}</select>
            <select value={f.cohort} onChange={e => setFilter('cohort', e.target.value)} className="border rounded-lg px-2 py-1.5"><option value="">كل المصادر</option>{cohorts.map(c => <option key={c} value={c}>{cohortLabel(c)}</option>)}</select>
          </div>
          <div className="flex flex-wrap gap-3 items-center text-xs">
            <label className="flex items-center gap-1"><input type="checkbox" checked={f.niche} onChange={e => setFilter('niche', e.target.checked)} /> مجالنا فقط (بشرة · جمال · مكياج · شعر، أو عليه أولوية)</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={f.dupOnly} onChange={e => setFilter('dupOnly', e.target.checked)} /> مكرر محتمل فقط ({dupIds.size})</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={showDeleted} onChange={e => { setShowDeleted(e.target.checked); setSel(new Set()); }} /> المحذوف</label>
            <span className="text-gray-500 mr-auto">{shown.length} نتيجة · الإجمالي النشط {active.length}</span>
          </div>
          {sel.size > 0 && (
            <div className="rounded-xl bg-blue-50 p-2 flex flex-wrap gap-2 items-center text-xs">
              <b>{sel.size} محدد</b>
              <select value={bulk.status} onChange={e => setBulk(p => ({ ...p, status: e.target.value }))} className="border rounded-lg px-2 py-1"><option value="">الحالة…</option>{Object.entries(STATUS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <select value={bulk.priority} onChange={e => setBulk(p => ({ ...p, priority: e.target.value }))} className="border rounded-lg px-2 py-1"><option value="">الأولوية…</option><option>P0</option><option>P1</option><option>P2</option></select>
              <input list="owner-bulk" value={bulk.owner} onChange={e => setBulk(p => ({ ...p, owner: e.target.value }))} placeholder="المسؤول…" className="border rounded-lg px-2 py-1 w-28" />
              <datalist id="owner-bulk">{owners.map(o => <option key={o} value={o} />)}</datalist>
              <input list="cat-bulk" value={bulk.category} onChange={e => setBulk(p => ({ ...p, category: e.target.value }))} placeholder="الفئة…" className="border rounded-lg px-2 py-1 w-24" />
              <datalist id="cat-bulk">{categories.map(c => <option key={c} value={c} />)}</datalist>
              <button onClick={applyBulk} className="px-3 py-1 rounded-lg bg-blue-700 text-white font-bold">تطبيق</button>
              <button onClick={() => setSel(new Set())} className="text-gray-500">إلغاء التحديد</button>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map(r => (
              <div key={r.id} className={`rounded-xl border bg-white p-3 flex items-start gap-2 ${r.deleted_at ? 'opacity-60' : ''}`}>
                {!r.deleted_at && <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="mt-1" />}
                <button className="flex-1 min-w-0 text-right" onClick={() => setEdit(r)}>
                  <div className="font-bold text-sm text-gray-900 truncate">{r.name || r.handle}</div>
                  <div className="text-xs text-gray-500 truncate" dir="ltr">@{r.handle} · {r.platform}</div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                    {r.priority && <span className="px-2 py-0.5 rounded-full bg-gray-900 text-white">{r.priority}</span>}
                    <span className={`px-2 py-0.5 rounded-full ${STATUS_CLS[r.status] || ''}`}>{STATUS_AR[r.status] || r.status}</span>
                    {r.category && <span className={`px-2 py-0.5 rounded-full ${NICHE.includes(r.category) ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>{CAT_AR[r.category] || r.category}</span>}
                    {r.location && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{r.location}</span>}
                    {r.engagement_pct != null && <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">تفاعل {Number(r.engagement_pct)}%</span>}
                    {r.verified && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800">✔ متحقَّق</span>}
                    {r.cohort === 'legacy_discovery' && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">غير مؤكد</span>}
                    {dupIds.has(r.id) && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700">⚠ مكرر محتمل</span>}
                    {r.owner && <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{r.owner}</span>}
                  </div>
                </button>
                <div className="text-left shrink-0">
                  <div className="text-base font-black text-gray-900">{fmt(r.followers)}</div>
                  <div className="text-[10px] text-gray-400">{bandOf(r.followers) || 'متابع'}</div>
                </div>
              </div>
            ))}
          </div>
          {shown.length === 0 && <div className="text-sm text-gray-500 text-center py-8">ما في نتائج بهالفلاتر.</div>}
        </>
      )}
      {edit && <EditModal row={edit} owners={owners} categories={categories} onClose={() => setEdit(null)} onSaved={(row, removed) => { onSaved(row, removed); if (!edit.id) load(); }} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={load} />}
    </div>
  );
}
