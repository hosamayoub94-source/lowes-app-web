// =============================================================
// CreatorProspectsScreen — «صناع المحتوى» v2 (D-094): أداة اكتشاف UGC / Skincare — Instagram-first.
// كل العمليات عبر Edge Function `creator-prospects` (جلسة حقيقية + أدمن فقط). الجدول نفسه مقفول عن التطبيق.
// البحث والفلترة والترتيب والـScore على الخادم (action=search، صفحات 30)؛ إن كانت الدالة المنشورة v1 نفس المنطق يشتغل بالمتصفح.
// منطق البحث/الـScore: supabase/functions/_shared/creatorMatch.js — لا رقم مخترع، المجهول يبقى «— غير متوفر».
// =============================================================
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '@routes/paths';
import { call, searchProspects, updateProspect, wireStatus, invalidate } from '@services/creatorProspectsApi';
import CreatorCard from '@components/creators/prospects/CreatorCard';
import CreatorDetail from '@components/creators/prospects/CreatorDetail';
import CreatorEditModal from '@components/creators/prospects/CreatorEditModal';
import CreatorFilters from '@components/creators/prospects/CreatorFilters';
import DiscoveryPanel from '@components/creators/prospects/DiscoveryPanel';
import ImportModal from '@components/creators/prospects/ImportModal';
import {
  STATUSES, STATUS_AR, CONTENT_AR, FOCUS_AR, TYPE_AR, PLATFORM_AR, govOf, countryOf, scoreCreator,
} from '@components/creators/prospects/constants';

const EMPTY = { country: '', governorate: '', city: '', creator_type: '', platform: '', status: '', verification_status: '', content_types: [], skincare_focus: [], ugcOnly: false, skincareOnly: false, saved: false };
const PAGE = 30;
const SIZE_AR = { nano: 'Nano <10K', micro: 'Micro 10K–100K', macro: 'Macro 100K–1M', mega: '+1M' };
const PRODUCT_AR = { retinol: 'Retinol', vitamin_c: 'Vitamin C', scrub: 'مقشر', skincare: 'Skincare', expert: 'خبير بشرة' };

function conceptLabel(k) {
  if (k.startsWith('geo:')) return govOf('SY', k.slice(4))?.ar || k;
  if (k.startsWith('country:')) return countryOf(k.slice(8))?.ar || k;
  return CONTENT_AR[k] || PRODUCT_AR[k] || FOCUS_AR[k] || TYPE_AR[k] || PLATFORM_AR[k] || SIZE_AR[k] || k;
}

export default function CreatorProspectsScreen() {
  const [tab, setTab] = useState('list');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState(EMPTY);
  const [sort, setSort] = useState('best');
  const [showDeleted, setShowDeleted] = useState(false);
  const [res, setRes] = useState(null); // { rows,total,counts,schema,mode,page,parsed }
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [detail, setDetail] = useState(null);
  const [edit, setEdit] = useState(null);
  const [importing, setImporting] = useState(null); // true | { rows, label }
  const [sel, setSel] = useState(new Set());
  const [bulk, setBulk] = useState({ status: '', owner: '' });
  const reqId = useRef(0);

  // debounce: no request per keystroke
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 300); return () => clearTimeout(t); }, [qInput]);

  const fetchPage = useCallback(async (page, append) => {
    const id = ++reqId.current;
    setLoading(true);
    const r = await searchProspects({ q, filters, sort, page, pageSize: PAGE, includeDeleted: showDeleted });
    if (id !== reqId.current) return;
    setLoading(false);
    if (!r.ok) { setErr(r.message || r.error); return; }
    setErr('');
    setRes((prev) => (append && prev ? { ...r, rows: [...prev.rows, ...r.rows] } : r));
  }, [q, filters, sort, showDeleted]);
  useEffect(() => { fetchPage(1, false); }, [fetchPage]);

  const schema = res?.schema || 'v1';
  const v2 = schema === 'v2';
  const rows = useMemo(() => res?.rows || [], [res]);
  const owners = useMemo(() => [...new Set(rows.map((r) => r.owner).filter(Boolean))], [rows]);
  const setFilter = (k, v) => setFilters((p) => ({ ...p, [k]: v }));
  const activeCount = ['city', 'verification_status'].filter((k) => filters[k]).length + filters.content_types.length + filters.skincare_focus.length;
  const understood = res?.parsed && q ? [...res.parsed.concepts.map(conceptLabel), ...res.parsed.words.map((w) => `«${w}»`), ...res.parsed.handles.map((h) => `@${h}`)].join(' · ') : '';

  // keep a changed row in place, re-scored locally (same function as the server)
  function patchRow(row, removed = false) {
    setRes((prev) => {
      if (!prev) return prev;
      if (removed) return { ...prev, rows: prev.rows.filter((r) => r.id !== row.id), total: prev.total - 1 };
      const exists = prev.rows.some((r) => r.id === row.id);
      const next = { ...row, relevance: prev.rows.find((r) => r.id === row.id)?.relevance ?? 0, ...scoreCreator(row) };
      return { ...prev, rows: exists ? prev.rows.map((r) => (r.id === row.id ? next : r)) : [next, ...prev.rows], total: exists ? prev.total : prev.total + 1 };
    });
    setDetail((d) => (d && d.id === row.id ? { ...row, ...scoreCreator(row) } : d));
  }
  async function quickStatus(r, status) {
    const out = await updateProspect(r.id, { status }, schema);
    if (!out.ok) { setMsg(out.message || out.error); return; }
    patchRow(out.row);
    setMsg(`${r.name || r.handle} ← ${STATUS_AR[status]}`);
  }
  async function toggleSave(r) {
    const out = await updateProspect(r.id, { saved: !r.saved }, schema);
    if (!out.ok) { setMsg(out.message || out.error); return; }
    patchRow(out.row);
  }
  function onEdited(row, removed, goNext) {
    const idx = rows.findIndex((r) => r.id === row.id);
    const next = goNext && idx >= 0 ? rows[idx + 1] : null;
    patchRow(row, removed && !showDeleted);
    setEdit(next || null);
  }
  async function applyBulk() {
    const patch = {};
    if (bulk.status) patch.status = wireStatus(bulk.status, schema);
    if (bulk.owner) patch.owner = bulk.owner;
    if (!Object.keys(patch).length || !sel.size) return;
    const out = await call('bulk_update', { ids: [...sel], patch });
    if (!out.ok) { setMsg(out.message || out.error); return; }
    setMsg(`تم تحديث ${out.updated} حساب`); setSel(new Set()); setBulk({ status: '', owner: '' }); invalidate(); fetchPage(1, false);
  }

  const idxOf = (x) => (x && x.id ? rows.findIndex((r) => r.id === x.id) : -1);
  const dIdx = idxOf(detail);
  const eIdx = idxOf(edit);
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-black text-lg ml-auto">صناع المحتوى</h1>
        <button onClick={() => setEdit({})} className="px-3 py-1.5 rounded-xl bg-gray-900 text-white text-xs font-bold">+ إضافة</button>
        <button onClick={() => setImporting(true)} className="px-3 py-1.5 rounded-xl border text-xs font-bold">⬆ رفع ملف</button>
        <Link to={ROUTES.SYRIA_LEADS} className="text-xs font-bold text-blue-600">ليدز سوريا ←</Link>
      </div>

      <div className="flex gap-1 border-b">
        {[['list', 'القائمة'], ['discover', '🔎 اكتشاف حسابات جديدة']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-bold -mb-px border-b-2 ${tab === k ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}>{l}</button>
        ))}
      </div>

      {res && !v2 && (
        <div className="rounded-lg bg-amber-50 text-amber-800 text-xs p-2 leading-5">
          وضع انتقالي: البحث الذكي والترتيب والتقييم يعملون الآن على البيانات الحالية. الحقول الجديدة (نوع المبدع، أنواع المحتوى، المحافظة، الحفظ…) تُفعَّل بعد تطبيق migration v2 — بانتظار الموافقة.
        </div>
      )}
      {err && <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3">{err}</div>}
      {msg && <div className="rounded-lg bg-emerald-50 text-emerald-800 text-sm p-2 flex"><span className="flex-1">{msg}</span><button onClick={() => setMsg('')} className="text-emerald-700" aria-label="إغلاق">✕</button></div>}

      {tab === 'discover' && (
        <DiscoveryPanel schema={schema} onAdded={(row) => patchRow(row)} onImport={(preset) => setImporting(preset)} />
      )}

      {tab === 'list' && (
        <>
          <CreatorFilters
            qInput={qInput} setQInput={setQInput} understood={understood}
            filters={filters} setFilter={setFilter} sort={sort} setSort={setSort}
            counts={res?.counts} v2={v2} activeCount={activeCount}
            onReset={() => setFilters(EMPTY)}
          />
          <div className="flex flex-wrap gap-3 items-center text-xs">
            <span className="font-bold text-gray-700">{res ? `${res.total} نتيجة` : '…'}</span>
            {loading && <span className="text-gray-400">جارٍ التحميل…</span>}
            <label className="flex items-center gap-1 mr-auto"><input type="checkbox" checked={showDeleted} onChange={(e) => { setShowDeleted(e.target.checked); setSel(new Set()); }} /> المحذوف</label>
          </div>

          {sel.size > 0 && (
            <div className="rounded-xl bg-blue-50 p-2 flex flex-wrap gap-2 items-center text-xs">
              <b>{sel.size} محدد</b>
              <select value={bulk.status} onChange={(e) => setBulk((p) => ({ ...p, status: e.target.value }))} className="border rounded-lg px-2 py-1"><option value="">الحالة…</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_AR[s]}</option>)}</select>
              <input list="owner-bulk" value={bulk.owner} onChange={(e) => setBulk((p) => ({ ...p, owner: e.target.value }))} placeholder="المسؤول…" className="border rounded-lg px-2 py-1 w-28" />
              <datalist id="owner-bulk">{owners.map((o) => <option key={o} value={o} />)}</datalist>
              <button onClick={applyBulk} className="px-3 py-1 rounded-lg bg-blue-700 text-white font-bold">تطبيق</button>
              <button onClick={() => setSel(new Set())} className="text-gray-500">إلغاء التحديد</button>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <CreatorCard
                key={r.id} row={r} v2={v2}
                selected={sel.has(r.id)} onSelect={() => toggle(r.id)}
                onOpen={() => setDetail(r)} onEdit={() => setEdit(r)}
                onSave={() => toggleSave(r)} onStatus={(s) => quickStatus(r, s)}
              />
            ))}
          </div>
          {res && rows.length === 0 && !loading && <div className="text-sm text-gray-500 text-center py-8">ما في نتائج. جرّب كلمة أقل، أو امسح الفلاتر، أو افتح «اكتشاف حسابات جديدة».</div>}
          {res && rows.length < res.total && (
            <div className="text-center"><button disabled={loading} onClick={() => fetchPage((res.page || 1) + 1, true)} className="px-5 py-2 rounded-xl border text-sm font-bold disabled:opacity-50">عرض المزيد ({res.total - rows.length})</button></div>
          )}
        </>
      )}

      {detail && (
        <CreatorDetail
          row={detail} v2={v2}
          onClose={() => setDetail(null)}
          onEdit={() => { setEdit(detail); setDetail(null); }}
          onStatus={(s) => quickStatus(detail, s)} onSave={() => toggleSave(detail)}
          pos={dIdx + 1} total={dIdx >= 0 ? rows.length : 0} hasPrev={dIdx > 0} hasNext={dIdx >= 0 && dIdx < rows.length - 1}
          onNav={(d) => { const t = rows[dIdx + d]; if (t) setDetail(t); }}
        />
      )}
      {edit && (
        <CreatorEditModal
          key={edit.id || 'new'} row={edit} owners={owners} schema={schema}
          onClose={() => setEdit(null)} onSaved={onEdited}
          pos={eIdx + 1} total={eIdx >= 0 ? rows.length : 0} hasPrev={eIdx > 0} hasNext={eIdx >= 0 && eIdx < rows.length - 1}
          onNav={(d) => { const t = rows[eIdx + d]; if (t) setEdit(t); }}
        />
      )}
      {importing && <ImportModal preset={importing === true ? null : importing} onClose={() => setImporting(null)} onDone={() => fetchPage(1, false)} />}
    </div>
  );
}
