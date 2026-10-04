// =============================================================
// CreatorReadOnlyScreen — «صناع المحتوى» عرض للقراءة فقط (بعد إقفال الجدول، Window 1).
// القراءة الوحيدة: Edge Function `creator-workbench-read` (جلسة حقيقية + أدمن فقط، قراءة فقط).
// لا كتابة ولا مزامنة ولا localStorage. التعديل متوقف لحين الشاشة الجديدة (Phase 3).
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@services/supabase';
import { ROUTES } from '@routes/paths';

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
      batch: d.batch || '',
      to: assign.get(r.id) || '',
    };
  }).sort((a, b) => (a.cohort === b.cohort ? (b.followers || 0) - (a.followers || 0) : a.cohort.localeCompare(b.cohort)));
}

export default function CreatorReadOnlyScreen() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [cohort, setCohort] = useState('');
  const [owner, setOwner] = useState('');

  useEffect(() => {
    let alive = true;
    loadRows().then(r => { if (alive) setRows(toList(r)); }).catch(e => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, []);

  const cohorts = useMemo(() => [...new Set((rows || []).map(r => r.cohort).filter(Boolean))], [rows]);
  const owners = useMemo(() => [...new Set((rows || []).map(r => r.to).filter(Boolean))], [rows]);
  const shown = useMemo(() => (rows || []).filter(r =>
    (!cohort || r.cohort === cohort) && (!owner || r.to === owner) &&
    (!q || `${r.name} ${r.handle}`.toLowerCase().includes(q.trim().toLowerCase()))), [rows, q, cohort, owner]);

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-3" dir="rtl">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 leading-6">
        ⏸️ قسم صناع المحتوى <b>متوقف مؤقتاً</b> — هذا عرض <b>للقراءة فقط</b>. لا مراجعة ولا تواصل ولا تعديل الآن؛ كل ما سُجّل محفوظ.
      </div>
      <Link to={ROUTES.SYRIA_LEADS} className="text-xs font-bold text-blue-600">← ليدز سوريا</Link>
      {err && <div className="rounded-lg bg-red-50 text-red-700 text-sm p-3">{err}</div>}
      {!rows && !err && <div className="text-sm text-gray-500">جارٍ التحميل…</div>}
      {rows && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم أو الحساب" className="border rounded-lg px-2 py-1 text-sm" />
            <select value={cohort} onChange={e => setCohort(e.target.value)} className="border rounded-lg px-2 py-1 text-sm">
              <option value="">كل المجموعات</option>
              {cohorts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={owner} onChange={e => setOwner(e.target.value)} className="border rounded-lg px-2 py-1 text-sm">
              <option value="">كل المسؤولين</option>
              {owners.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <span className="text-xs text-gray-500">{shown.length} / {rows.length}</span>
          </div>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-xs">
              <thead className="bg-gray-800 text-white">
                <tr>{['#', 'الاسم', 'المنصة', 'الحساب', 'المتابعون', 'الفئة', 'المدينة', 'التحقق', 'المسؤول', 'المجموعة', 'الدفعة'].map(h => <th key={h} className="p-2 text-right whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.id} className="border-t odd:bg-gray-50">
                    <td className="p-2">{i + 1}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2">{r.platform}</td>
                    <td className="p-2">{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-600">{r.handle}</a> : r.handle}</td>
                    <td className="p-2">{r.followers ?? ''}</td>
                    <td className="p-2">{r.category}</td>
                    <td className="p-2">{r.city}</td>
                    <td className="p-2">{r.ver}</td>
                    <td className="p-2">{r.to}</td>
                    <td className="p-2">{r.cohort}</td>
                    <td className="p-2">{r.batch}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
