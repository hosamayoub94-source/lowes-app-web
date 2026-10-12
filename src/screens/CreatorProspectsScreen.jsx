// =============================================================
// CreatorProspectsScreen — «صناع المحتوى»: طابور عمل (D-094 + توحيد Workbench، 10 أكتوبر 2026).
// يجيب لكل حساب: ماذا نعرف؟ ماذا ينقص؟ ما القرار؟ ما الخطوة التالية؟
// القراءة: `list` مرة واحدة عبر Edge Function `creator-prospects` (جلسة حقيقية + صلاحية من الخادم)، ثم البحث/الفلترة/العدّ بالمتصفح
// بنفس supabase/functions/_shared/creatorMatch.js — الـViews الجديدة تعمل بلا نشر للدالة. الكتابة كلها عبر الدالة (الجدول مقفول عن التطبيق).
// لا رقم مخترع: المجهول يبقى «غير متوفر»، والـScore «أولوية» لترتيب الشغل فقط.
// =============================================================
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ROUTES } from '@routes/paths';
import { useAuth } from '@hooks/useAuth';
import { ROLES } from '@data/teams';
import { call, listProspects, updateProspect, wireStatus, invalidate } from '@services/creatorProspectsApi';
import { toExportCsv } from '@services/creatorWorkqueue';
import CreatorCard from '@components/creators/prospects/CreatorCard';
import CreatorReviewPanel from '@components/creators/prospects/CreatorReviewPanel';
import CreatorEditModal from '@components/creators/prospects/CreatorEditModal';
import CreatorFilters, { activeFilterChips } from '@components/creators/prospects/CreatorFilters';
import CreatorSummary from '@components/creators/prospects/CreatorSummary';
import DiscoveryPanel from '@components/creators/prospects/DiscoveryPanel';
import ImportModal from '@components/creators/prospects/ImportModal';
import {
  STATUSES, STATUS_AR, CONTENT_AR, FOCUS_AR, TYPE_AR, PLATFORM_AR, govOf, countryOf, viewOf, summarizeCreators, searchCreators, scoreCreator,
} from '@components/creators/prospects/constants';

const EMPTY = { country: '', governorate: '', city: '', creator_type: '', platform: '', status: '', verification_status: '', collab: '', content_types: [], skincare_focus: [] };
const STEP = 60;
const SIZE_AR = { nano: 'Nano <10K', micro: 'Micro 10K–100K', macro: 'Macro 100K–1M', mega: '+1M' };
const PRODUCT_AR = { retinol: 'Retinol', vitamin_c: 'Vitamin C', scrub: 'مقشر', skincare: 'Skincare', expert: 'خبير بشرة' };
const SAVED_KEY = 'lowes:creators:saved-views:v1';

function conceptLabel(k) {
  if (k.startsWith('geo:')) return govOf('SY', k.slice(4))?.ar || k;
  if (k.startsWith('country:')) return countryOf(k.slice(8))?.ar || k;
  return CONTENT_AR[k] || PRODUCT_AR[k] || FOCUS_AR[k] || TYPE_AR[k] || PLATFORM_AR[k] || SIZE_AR[k] || k;
}
// Personal convenience only (this browser): never the source of any business data.
function readSaved() { try { const v = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function writeSaved(list) { try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch { /* storage blocked: views just aren't remembered */ } }
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function CreatorProspectsScreen() {
  const { session, role, name: actorName } = useAuth();
  // Mirrors the edge function: admin, or the permission granted from /admin/users (extra minus denied). The server re-checks every write.
  const isAdmin = role === ROLES.ADMIN;
  const has = (p) => isAdmin || ((session?.extra_permissions || []).includes(p) && !(session?.denied_permissions || []).includes(p));
  const canManage = has('manage_creator_data');

  const [params] = useSearchParams();
  const [tab, setTab] = useState('list');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [view, setViewKey] = useState(() => viewOf(params.get('view') || 'all').key);
  const [filters, setFilters] = useState(EMPTY);
  const [sort, setSort] = useState('best');
  const [showDeleted, setShowDeleted] = useState(false);
  const [data, setData] = useState(null); // { rows, schema }
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [panel, setPanel] = useState(null); // { queue: id[], id, done }
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(null); // true | { rows, label }
  const [sel, setSel] = useState(new Set());
  const [bulk, setBulk] = useState({ status: '', owner: '' });
  const [visible, setVisible] = useState(STEP);
  const [saved, setSaved] = useState(readSaved);

  // debounce: no recompute per keystroke
  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 250); return () => clearTimeout(t); }, [qInput]);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    const r = await listProspects({ includeDeleted: showDeleted, force });
    setLoading(false);
    if (!r.ok) { setErr(r.message || r.error); return; }
    setErr('');
    setData({ rows: r.rows, schema: r.schema });
  }, [showDeleted]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setVisible(STEP); }, [q, view, filters, sort, showDeleted]);

  const schema = data?.schema || 'v1';
  const v2 = schema === 'v2';
  const rows = useMemo(() => data?.rows || [], [data]);
  const summary = useMemo(() => (showDeleted || !data ? null : summarizeCreators(rows)), [rows, showDeleted, data]);
  const res = useMemo(() => {
    const extra = Object.fromEntries(Object.entries(filters).filter(([, v]) => (Array.isArray(v) ? v.length : v)));
    return searchCreators(rows, { q, filters: { ...viewOf(view).filters, ...extra }, sort, all: true });
  }, [rows, q, view, filters, sort]);
  const shownRows = res.rows.slice(0, visible);
  const byId = useMemo(() => new Map(res.rows.map((r) => [r.id, r])), [res]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  // «حسب المدينة»: only places that really exist in the data (governorate slug or free-text city), with counts
  const placeOptions = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const g = r.governorate ? govOf(r.country || 'SY', r.governorate) : null;
      const key = g ? `g:${g.slug}` : r.city ? `c:${r.city}` : '';
      if (!key) continue;
      const cur = m.get(key) || { value: key, label: g ? g.ar : r.city, n: 0 };
      cur.n++; m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'ar'));
  }, [rows]);
  const owners = useMemo(() => [...new Set(rows.map((r) => r.owner).filter(Boolean))], [rows]);
  const chips = activeFilterChips(filters);
  const dirty = !!q || view !== 'all' || chips.length > 0;
  const understood = res.parsed && q ? [...res.parsed.concepts.map(conceptLabel), ...res.parsed.words.map((w) => `«${w}»`), ...res.parsed.handles.map((h) => `@${h}`)].join(' · ') : '';

  const setView = (k) => { setViewKey(k); setTab('list'); setSel(new Set()); };
  const patchFilters = (p) => setFilters((prev) => ({ ...prev, ...p }));
  const reset = () => { setQInput(''); setQ(''); setFilters(EMPTY); setViewKey('all'); setSort('best'); };

  // keep a changed row in local state (re-scored by the memo on the next render)
  function patchRow(row, removed = false) {
    setData((prev) => {
      if (!prev) return prev;
      const others = prev.rows.filter((r) => r.id !== row.id);
      const belongs = showDeleted ? !!row.deleted_at : !row.deleted_at;
      if (removed || !belongs) return { ...prev, rows: others };
      const exists = prev.rows.some((r) => r.id === row.id);
      return { ...prev, rows: exists ? prev.rows.map((r) => (r.id === row.id ? row : r)) : [row, ...prev.rows] };
    });
  }
  async function toggleSave(r) {
    const out = await updateProspect(r.id, { saved: !r.saved }, schema);
    if (!out.ok) { setMsg(out.message || out.error); return; }
    patchRow(out.row);
  }
  async function applyBulk() {
    const patch = {};
    if (bulk.status) patch.status = wireStatus(bulk.status, schema);
    if (bulk.owner) patch.owner = bulk.owner;
    if (!Object.keys(patch).length || !sel.size) return;
    const out = await call('bulk_update', { ids: [...sel], patch });
    if (!out.ok) { setMsg(out.message || out.error); return; }
    setMsg(`تم تحديث ${out.updated} حساب`); setSel(new Set()); setBulk({ status: '', owner: '' }); invalidate(); load(true);
  }
  async function purgeSelected() {
    const n = sel.size;
    if (!n || !window.confirm(`حذف نهائي لـ ${n} حساب؟ لا يمكن التراجع ولا استرجاعهم من «المحذوف».`)) return;
    const out = await call('purge', { ids: [...sel], confirm: true });
    if (!out.ok) { setMsg(out.message || out.error); return; }
    setMsg(`تم الحذف النهائي لـ ${out.deleted} حساب`); setSel(new Set()); setPanel(null); invalidate(); load(true);
  }
  function exportRows(list, label) {
    if (!list.length) return;
    const stamp = new Date().toISOString().slice(0, 10);
    download(`creators-${label}-${stamp}.csv`, toExportCsv(list, { withContacts: canManage }));
    setMsg(`تم تصدير ${list.length} حساب${canManage ? '' : ' (بدون بيانات التواصل — لمن يدير البيانات فقط)'}`);
  }

  // review queue = a snapshot of the current result order, so accounts that leave the view after a decision don't shift the queue.
  function openAt(id) { setPanel({ queue: res.rows.map((r) => r.id), id, done: 0 }); }
  function beginReview() {
    setTab('list'); setQInput(''); setQ(''); setFilters(EMPTY); setViewKey('review'); setSort('best');
    const queue = searchCreators(rows, { filters: viewOf('review').filters, sort: 'best', all: true }).rows.map((r) => r.id);
    if (queue.length) setPanel({ queue, id: queue[0], done: 0 });
    else setMsg('ما في حسابات بانتظار المراجعة ✓');
  }
  function panelNav(d) {
    setPanel((p) => {
      if (!p) return p;
      const i = p.queue.indexOf(p.id) + d;
      return i >= 0 && i < p.queue.length ? { ...p, id: p.queue[i] } : p;
    });
  }
  function onPanelSaved(row, { next = false, removed = false } = {}) {
    patchRow(row, removed);
    if (!panel) return;
    if (!next) { if (removed) setPanel(null); return; }
    const nextId = panel.queue[panel.queue.indexOf(panel.id) + 1];
    if (!nextId) { setPanel(null); setMsg(`خلصت المراجعة لهالقائمة ✓ (${panel.done + 1} حساب بهالجلسة)`); return; }
    setPanel({ ...panel, id: nextId, done: panel.done + 1 });
  }

  function saveView() {
    const name = window.prompt('اسم العرض (مثلاً: UGC دمشق):');
    if (!name || !name.trim()) return;
    const next = [...saved.filter((s) => s.name !== name.trim()), { name: name.trim(), view, q: qInput, filters, sort }].slice(-12);
    setSaved(next); writeSaved(next);
  }
  function applySaved(s) { setTab('list'); setViewKey(viewOf(s.view).key); setQInput(s.q || ''); setFilters({ ...EMPTY, ...(s.filters || {}) }); setSort(s.sort || 'best'); }
  function deleteSaved(name) { const next = saved.filter((s) => s.name !== name); setSaved(next); writeSaved(next); }

  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShownSelected = shownRows.length > 0 && shownRows.every((r) => sel.has(r.id));
  // scored row from the current results; an account that left the view after a decision is re-scored on its own
  const panelRow = panel ? (byId.get(panel.id) || (rowById.get(panel.id) && { ...rowById.get(panel.id), ...scoreCreator(rowById.get(panel.id)) })) : null;

  return (
    <div className="p-3 sm:p-4 w-full space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-black text-lg ml-auto">صناع المحتوى</h1>
        {canManage && <button onClick={() => setAdding(true)} className="px-3 py-1.5 rounded-xl bg-gray-900 text-white text-xs font-bold">+ إضافة</button>}
        {canManage && <button onClick={() => setImporting(true)} className="px-3 py-1.5 rounded-xl border text-xs font-bold">⬆ رفع ملف</button>}
        <Link to={ROUTES.SYRIA_LEADS} className="text-xs font-bold text-blue-600">ليدز سوريا ←</Link>
      </div>

      {err && <div role="alert" className="rounded-lg bg-red-50 text-red-700 text-sm p-3 flex gap-2 items-center"><span className="flex-1">{err}</span><button onClick={() => load(true)} className="font-bold underline">إعادة المحاولة</button></div>}
      {msg && <div role="status" className="rounded-lg bg-emerald-50 text-emerald-800 text-sm p-2 flex"><span className="flex-1">{msg}</span><button onClick={() => setMsg('')} className="text-emerald-700" aria-label="إغلاق الرسالة">✕</button></div>}
      {data && !v2 && <div className="rounded-lg bg-amber-50 text-amber-800 text-xs p-2 leading-5">وضع انتقالي: الحقول الجديدة (النوع، المحتوى، المحافظة، الحفظ…) غير متاحة على قاعدة البيانات الحالية.</div>}

      {!showDeleted && <CreatorSummary summary={summary} view={tab === 'list' ? view : ''} onView={setView} />}

      {tab === 'list' && !showDeleted && canManage && (summary?.to_review || 0) > 0 && view !== 'review' && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex flex-wrap items-center gap-2">
          <div className="text-sm text-amber-900 ml-auto"><b>{summary.to_review}</b> حساب بانتظار المراجعة — افتح الحساب، جاوب الأسئلة الثمانية، وقرّر. دقيقة لكل حساب تقريباً.</div>
          <button onClick={beginReview} className="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-black">ابدأ المراجعة ←</button>
        </div>
      )}

      <div className="flex gap-1 border-b">
        {[['list', 'القائمة'], ...(canManage ? [['discover', '🔎 اكتشاف حسابات جديدة']] : [])].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} className={`px-4 py-2 text-sm font-bold -mb-px border-b-2 ${tab === k ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500'}`}>{l}</button>
        ))}
        <label className="flex items-center gap-1 mr-auto text-xs text-gray-600"><input type="checkbox" checked={showDeleted} onChange={(e) => { setShowDeleted(e.target.checked); setSel(new Set()); setPanel(null); }} /> المحذوف</label>
      </div>

      {tab === 'discover' && canManage && (
        <DiscoveryPanel schema={schema} onAdded={(row) => patchRow(row)} onImport={(preset) => setImporting(preset)} />
      )}

      {tab === 'list' && (
        <>
          <CreatorFilters
            qInput={qInput} setQInput={setQInput} understood={understood}
            view={view} setView={setView} summary={summary}
            filters={filters} patchFilters={patchFilters} sort={sort} setSort={setSort}
            total={data ? res.total : null} shown={Math.min(visible, res.total)} onReset={reset} dirty={dirty} v2={v2}
            placeOptions={placeOptions} savedViews={saved} onSaveView={saveView} onApplySaved={applySaved} onDeleteSaved={deleteSaved}
          />

          <div className="flex flex-wrap gap-2 items-center text-xs">
            {shownRows.length > 0 && (
              <label className="flex items-center gap-1"><input type="checkbox" checked={allShownSelected} onChange={() => setSel(allShownSelected ? new Set() : new Set(shownRows.map((r) => r.id)))} /> تحديد المعروض</label>
            )}
            {res.total > 0 && <button onClick={() => window.confirm(`تصدير كل نتائج هذا العرض (${res.total} حساب) إلى CSV؟`) && exportRows(res.rows, view)} className="text-blue-700 font-bold">⬇ تصدير العرض ({res.total})</button>}
            {loading && <span className="text-gray-400" aria-live="polite">جارٍ التحميل…</span>}
          </div>

          {sel.size > 0 && (
            <div className="sticky top-0 z-10 rounded-xl bg-blue-50 border border-blue-200 p-2 flex flex-wrap gap-2 items-center text-xs">
              <b>{sel.size} محدد</b>
              <button onClick={() => exportRows(res.rows.filter((r) => sel.has(r.id)), 'selected')} className="px-3 py-1 rounded-lg border border-blue-300 bg-white font-bold text-blue-800">⬇ تصدير المحدد</button>
              {canManage && !showDeleted && (
                <>
                  <select value={bulk.status} onChange={(e) => setBulk((p) => ({ ...p, status: e.target.value }))} className="border rounded-lg px-2 py-1" aria-label="الحالة للمحدد"><option value="">الحالة…</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_AR[s]}</option>)}</select>
                  <input list="owner-bulk" value={bulk.owner} onChange={(e) => setBulk((p) => ({ ...p, owner: e.target.value }))} placeholder="المسؤول…" className="border rounded-lg px-2 py-1 w-28" aria-label="المسؤول للمحدد" />
                  <datalist id="owner-bulk">{owners.map((o) => <option key={o} value={o} />)}</datalist>
                  <button onClick={applyBulk} disabled={!bulk.status && !bulk.owner} className="px-3 py-1 rounded-lg bg-blue-700 text-white font-bold disabled:opacity-40">تطبيق</button>
                </>
              )}
              {isAdmin && <button onClick={purgeSelected} className="px-3 py-1 rounded-lg bg-red-600 text-white font-bold">🗑 حذف نهائي</button>}
              <button onClick={() => setSel(new Set())} className="text-gray-500 mr-auto">إلغاء التحديد</button>
            </div>
          )}

          {!data && loading && (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-hidden>
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-44 rounded-xl border bg-gray-50 animate-pulse" />)}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {shownRows.map((r) => (
              <CreatorCard
                key={r.id} row={r} v2={v2} canManage={canManage}
                selected={sel.has(r.id)} onSelect={() => toggle(r.id)}
                onOpen={() => openAt(r.id)}
                onSave={() => toggleSave(r)}
              />
            ))}
          </div>
          {data && res.total === 0 && !loading && (
            <div className="text-sm text-gray-500 text-center py-8 space-y-2">
              <div>{rows.length === 0 ? (showDeleted ? 'ما في حسابات محذوفة.' : 'القائمة فاضية — أضف حساباً أو ارفع ملفاً.') : 'ما في نتائج بهالعرض.'}</div>
              {dirty && <button onClick={reset} className="font-bold text-blue-700">إعادة ضبط البحث والفلاتر</button>}
            </div>
          )}
          {res.total > visible && (
            <div className="text-center"><button onClick={() => setVisible((v) => v + STEP)} className="px-5 py-2 rounded-xl border text-sm font-bold">عرض المزيد ({res.total - visible})</button></div>
          )}
        </>
      )}

      {panel && panelRow && (
        <CreatorReviewPanel
          key={`${panelRow.id}:${panelRow.updated_at || ''}`}
          row={panelRow} schema={schema} owners={owners} canManage={canManage} actor={actorName || ''}
          pos={panel.queue.indexOf(panel.id) + 1} total={panel.queue.length} done={panel.done}
          onClose={() => setPanel(null)} onNav={panelNav} onSaved={onPanelSaved}
          onToggleSave={() => toggleSave(panelRow)}
        />
      )}
      {adding && <CreatorEditModal key="new" row={{}} owners={owners} schema={schema} onClose={() => setAdding(false)} onSaved={(row) => { patchRow(row); setAdding(false); setMsg(`أُضيف ${row.name || row.handle}`); }} pos={0} total={0} />}
      {importing && <ImportModal preset={importing === true ? null : importing} onClose={() => setImporting(null)} onDone={() => load(true)} />}
    </div>
  );
}
