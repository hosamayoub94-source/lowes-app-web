// =============================================================
// CreatorReadOnlyScreen — «صناع المحتوى» عرض للقراءة فقط (بعد إقفال الجدول، Window 1).
// القراءة الوحيدة: Edge Function `creator-workbench-read` (جلسة حقيقية + أدمن فقط، قراءة فقط).
// لا كتابة ولا مزامنة ولا localStorage. التعديل متوقف لحين الشاشة الجديدة (Phase 3).
// الافتراضي: «مجالنا» (بشرة/عناية/مكياج/شعر) من المجموعة الأصلية المتحقَّق منها؛ دفعة الاكتشاف (بلا فئة، تحقق C) منفصلة وموسومة «غير مؤكد».
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@services/supabase';
import { ROUTES } from '@routes/paths';

const NICHE = ['skincare', 'beauty', 'makeup', 'hair'];
const CAT_AR = { skincare: 'عناية بالبشرة', beauty: 'جمال', makeup: 'مكياج', hair: 'شعر', fashion: 'أزياء', motherhood: 'أمومة', wellness: 'صحة', food: 'طعام', art: 'فن', fitness: 'لياقة', entertainment: 'ترفيه', music: 'موسيقى' };
const VIEWS = [
  { id: 'niche', label: 'مجالنا (بشرة · عناية · مكياج · شعر)', test: r => r.cohort !== 'discovery' && NICHE.includes(r.category) },
  { id: 'original', label: 'كل المجموعة الأصلية', test: r => r.cohort !== 'discovery' },
  { id: 'discovery', label: 'اكتشاف (غير مؤكد)', test: r => r.cohort === 'discovery' },
  { id: 'all', label: 'الكل', test: () => true },
];

function fmt(n) {
  if (n == null || n === '') return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

async function loadRows() {
  const { data, error } = await supabase.functions.invoke('creator-workbench-read', { body: {} });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.clone().json(); if (j?.error) msg = j.error; } catch { /* not json */ }
    if (error.context?.status === 401) msg = 'جلستك بلا هوية حقيقية — سجّل خروج ثم ادخل بالـPIN.';
    if (error.context?.status === 403) msg = 'هذا العرض للأدمن فقط.';
    throw new Error(msg);
  }
  if (!data?.ok) throw new Error(data?.error || 'تعذّر تحميل البيانات');
  return data.rows || [];
}

function toList(rows) {
  const assign = new Map();
  rows.filter(r => r.kind === 'assign').forEach(r => assign.set(r.id, r.data?.to || ''));
  return rows.filter(r => r.kind === 'queue').map(r => {
    const d = r.data || {};
    const p = (d.platforms && d.platforms[0]) || {};
    return {
      id: r.id,
      name: d.display_name || '',
      platform: p.platform || '',
      handle: p.handle || '',
      url: /^https?:\/\//.test(p.profile_url || '') ? p.profile_url : '',
      followers: d.follower_count ?? p.followers ?? null,
      category: d.main_category || '',
      city: d.creator_city || '',
      ver: d.verification_level || '',
      cohort: d.cohort || 'original',
      to: assign.get(r.id) || '',
    };
  }).sort((a, b) => {
    const na = NICHE.includes(a.category) ? 0 : 1;
    const nb = NICHE.includes(b.category) ? 0 : 1;
    if ((a.cohort === 'discovery') !== (b.cohort === 'discovery')) return a.cohort === 'discovery' ? 1 : -1;
    if (na !== nb) return na - nb;
    return (b.followers || 0) - (a.followers || 0);
  });
}

export default function CreatorReadOnlyScreen() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState('niche');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [owner, setOwner] = useState('');

  useEffect(() => {
    let alive = true;
    loadRows().then(r => { if (alive) setRows(toList(r)); }).catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, []);

  const counts = useMemo(() => Object.fromEntries(VIEWS.map(v => [v.id, (rows || []).filter(v.test).length])), [rows]);
  const inView = useMemo(() => (rows || []).filter(VIEWS.find(v => v.id === view).test), [rows, view]);
  const cats = useMemo(() => [...new Set(inView.map(r => r.category).filter(Boolean))], [inView]);
  const owners = useMemo(() => [...new Set(inView.map(r => r.to).filter(Boolean))], [inView]);
  const shown = useMemo(() => inView.filter(r =>
    (!cat || r.category === cat) && (!owner || r.to === owner) &&
    (!q || `${r.name} ${r.handle}`.toLowerCase().includes(q.trim().toLowerCase()))), [inView, q, cat, owner]);

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-3" dir="rtl">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 leading-6">
        ⏸️ قسم صناع المحتوى <b>متوقف مؤقتاً</b> — هذا عرض <b>للقراءة فقط</b>. لا إضافة ولا حذف ولا مراجعة الآن؛ كل ما سُجّل محفوظ.
      </div>
      <Link to={ROUTES.SYRIA_LEADS} className="text-xs font-bold text-blue-600">← ليدز سوريا</Link>
      {err && <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3">{err}</div>}
      {!rows && !err && <div className="text-sm text-gray-500">جارٍ التحميل…</div>}
      {rows && (
        <>
          <div className="flex flex-wrap gap-2">
            {VIEWS.map(v => (
              <button key={v.id} onClick={() => { setView(v.id); setCat(''); setOwner(''); }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border ${view === v.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700'}`}>
                {v.label} <span className="opacity-70">({counts[v.id]})</span>
              </button>
            ))}
          </div>
          {view === 'discovery' && (
            <div className="rounded-lg bg-gray-100 text-gray-700 text-xs p-2 leading-6">
              هذه حسابات من قوائم عامة (مثل التصوير والترفيه)، بلا فئة ومستوى التحقق C. <b>غير مؤكدة ومعظمها خارج مجالنا.</b>
            </div>
          )}
          <div className="flex flex-wrap gap-2 items-center">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم أو الحساب" className="border rounded-lg px-2 py-1 text-sm" />
            <select value={cat} onChange={e => setCat(e.target.value)} className="border rounded-lg px-2 py-1 text-sm">
              <option value="">كل الفئات</option>
              {cats.map(c => <option key={c} value={c}>{CAT_AR[c] || c}</option>)}
            </select>
            <select value={owner} onChange={e => setOwner(e.target.value)} className="border rounded-lg px-2 py-1 text-sm">
              <option value="">كل المسؤولين</option>
              {owners.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <span className="text-xs text-gray-500">{shown.length} نتيجة</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {shown.map(r => (
              <div key={r.id} className="rounded-xl border bg-white p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-gray-900 truncate">{r.name || r.handle}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-600">@{r.handle}</a> : `@${r.handle}`}
                    {' · '}{r.platform}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                    {r.category && <span className={`px-2 py-0.5 rounded-full ${NICHE.includes(r.category) ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>{CAT_AR[r.category] || r.category}</span>}
                    {r.city && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{r.city}</span>}
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">تحقق {r.ver || '—'}</span>
                    {r.cohort === 'discovery' && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">غير مؤكد</span>}
                    {r.to && <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{r.to}</span>}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div className="text-base font-black text-gray-900">{fmt(r.followers)}</div>
                  <div className="text-[10px] text-gray-400">متابع</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
