// =============================================================
// CreatorWorkbench — Creator Review & Outreach Workbench (props-only: no auth, no supabase, no network).
//   الطابور 1 (46) → مراجعة بشرية 8 أسئلة → أحكام → قائمة التجربة (حتى 30، بلا حشو) → متابعة تشغيلية → نتائج + تقرير قرار.
// Nothing is sent from here: "نسخ رسالة" only copies text. Storage: `store` (browser storage + JSON export).
// =============================================================
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import * as V from '@services/creatorReview';
import * as PL from '@services/creatorPilot';
import * as Q from '@services/creatorQueueEdit';
import { SYRIA_CITIES } from '@services/creatorLogic';
import ReviewCard from './ReviewCard';
import { ResultsPanel, IssuesPanel, ReportPanel } from './PilotPanels';
import { SLOT_AR, VERDICT_COLOR, PLAT_AR, CITY_AR, fmtN, download } from './uiData';
import { Pill, Btn, VerdictPill } from './ui';

const FOLLOWER_BANDS = { lt5k: [0, 5000], '5k20k': [5000, 20000], '20k100k': [20000, 100000], gt100k: [100000, Infinity] };
const FOLLOWER_BAND_AR = { lt5k: 'أقل من 5K', '5k20k': '5K – 20K', '20k100k': '20K – 100K', gt100k: 'أكثر من 100K' };
const selCls = 'bg-surface border border-border rounded-lg px-2 py-1';

export default function CreatorWorkbench({ reviewer, store, canReview = true, canOutreach = true, employees = [], isAdmin = false }) {
  const [tab, setTab] = useState('queue');
  const [queue, setQueue] = useState(() => store.loadQueue());
  const [reviews, setReviews] = useState(() => store.loadReviews());
  const [waves, setWaves] = useState(() => store.loadWaves());
  const [members, setMembersState] = useState(() => store.loadMembers());
  const membersRef = useRef(members); // always the latest list, so quick successive updates never overwrite each other
  const [assign, setAssign] = useState(() => store.loadAssign());
  const [issues, setIssues] = useState(() => store.loadIssues());
  const [meta, setMeta] = useState(() => ({ pilot: true, merge_rejected: 0, ...store.loadMeta() }));
  const [current, setCurrent] = useState(null);
  const [filter, setFilter] = useState({ tier: 'all', status: 'all', verdict: 'all', mine: false, sort: 'default', followers: 'all', platform: 'all', category: 'all', who: 'all' });
  const [msg, setMsg] = useState(null);
  const [alloc, setAlloc] = useState(PL.PILOT_ALLOCATION);
  const [quotas, setQuotas] = useState(V.DEFAULT_WAVE_QUOTAS);
  const [waveName, setWaveName] = useState('Pilot 01 — Retinol');
  const [activeWave, setActiveWave] = useState(null);
  const [teamNames, setTeamNames] = useState(() => store.loadTeam?.() || []); // exact app user names, shared with the team
  const [showWhy, setShowWhy] = useState(false);

  const [sync, setSync] = useState(null); // shared-table status: { ok, error, at }
  const reload = useCallback(() => { setQueue(store.loadQueue()); setReviews(store.loadReviews()); setWaves(store.loadWaves()); membersRef.current = store.loadMembers(); setMembersState(membersRef.current); setAssign(store.loadAssign()); setIssues(store.loadIssues()); setTeamNames(store.loadTeam?.() || []); }, [store]);
  useEffect(() => {
    if (!store.sync) return undefined;
    let alive = true;
    const run = () => store.sync().then(r => { if (!alive) return; setSync({ ok: r.ok, error: r.error, at: new Date() }); if (r.ok) reload(); });
    run(); const t = setInterval(run, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [store, reload]);

  const strict = meta.pilot;
  // Two separate cohorts, never mixed in numbers: the original pilot queue vs the Discovery batches (cohort:'discovery').
  const [cohort, setCohortState] = useState(() => { try { return window.localStorage.getItem('lowes:creators:v1:cw_cohort') === 'discovery' ? 'discovery' : 'pilot'; } catch { return 'pilot'; } });
  const setCohort = c => { setCohortState(c); setTab('queue'); setCurrent(null); try { window.localStorage.setItem('lowes:creators:v1:cw_cohort', c); } catch { /* per-browser preference only */ } };
  const inCohort = useCallback(q => (cohort === 'discovery' ? q.cohort === 'discovery' : !q.cohort), [cohort]);
  const scoped = useMemo(() => queue.filter(inCohort).filter(q => (cohort === 'discovery' || !meta.pilot ? true : q.queue_tier === 1)).filter(q => !q.removed), [queue, meta.pilot, cohort, inCohort]);
  const cohortCounts = useMemo(() => ({ pilot: queue.filter(q => !q.cohort && !q.removed && (!meta.pilot || q.queue_tier === 1)).length, discovery: queue.filter(q => q.cohort === 'discovery' && !q.removed).length }), [queue, meta.pilot]);
  const removedList = useMemo(() => queue.filter(q => q.removed && inCohort(q)), [queue, inCohort]);
  const [removing, setRemoving] = useState(null); // { id, reason } — inline confirmation before a creator leaves the queue
  const [addForm, setAddForm] = useState({ profile_url: '', display_name: '', followers: '', main_category: '', city: '', source: '', note: '', assign_to: '' });
  const assigned = useMemo(() => new Map(scoped.filter(q => assign[q.id]).map(q => [q.id, assign[q.id]])), [scoped, assign]);
  const flash = t => { setMsg(t); setTimeout(() => setMsg(null), 6000); };
  // any failed browser-storage write is logged automatically as a persistence issue
  const setMembers = v => { membersRef.current = v; setMembersState(v); };
  const persist = (v, setter, saver, what) => {
    setter(v);
    if (saver(v) === false) { const i = PL.newIssue({ type: 'persistence', text: `تعذّر حفظ ${what} في التخزين المحلي (ممتلئ أو معطّل)`, by: reviewer }); store.saveIssue(i); setIssues(store.loadIssues()); flash('⚠ تعذّر الحفظ المحلي — صدّر الآن'); }
  };

  const latest = useMemo(() => V.latestReviews(reviews), [reviews]);
  const eff = useMemo(() => queue.map(q => (latest.has(q.id) ? V.applyReview(q, latest.get(q.id), new Date(), { strict }) : q)), [queue, latest, strict]);
  const byId = useMemo(() => Object.fromEntries(eff.map(e => [e.id, e])), [eff]);
  const verdictOf = useCallback((r, q) => V.deriveVerdict(r, q, { strict }), [strict]);
  const progress = useMemo(() => V.queueProgress(scoped, latest, verdictOf), [scoped, latest, verdictOf]);
  const reviewedItems = useMemo(() => scoped.filter(q => latest.has(q.id)).map(q => ({ creator: { ...byId[q.id], id: q.id }, review: latest.get(q.id), verdict: V.deriveVerdict(latest.get(q.id), q, { strict }) })), [scoped, latest, byId, strict]);
  const usedElsewhere = useMemo(() => new Set(members.filter(m => m.wave_id !== activeWave).map(m => m.creator_id)), [members, activeWave]);
  const pilotPlan = useMemo(() => PL.buildPilot(reviewedItems, alloc, { maxTotal: 30, onlyTier: meta.pilot ? 1 : null, excludeIds: [...usedElsewhere] }), [reviewedItems, alloc, meta.pilot, usedElsewhere]);
  const wavePreview = useMemo(() => V.buildWave(reviewedItems, quotas, { excludeIds: [...usedElsewhere] }), [reviewedItems, quotas, usedElsewhere]);
  const toggleTeam = name => { if (!isAdmin) return; const next = teamNames.includes(name) ? teamNames.filter(n => n !== name) : [...teamNames, name]; setTeamNames(next); store.saveTeam?.(next); };
  const waveMembers = useMemo(() => members.filter(m => m.wave_id === activeWave), [members, activeWave]);
  const fn = useMemo(() => V.funnel(waveMembers), [waveMembers]);
  const actions = useMemo(() => V.nextActions(waveMembers), [waveMembers]);

  const list = useMemo(() => scoped.filter(q => {
    if (filter.tier !== 'all' && String(q.queue_tier) !== filter.tier) return false;
    const has = latest.has(q.id);
    if (filter.status === 'pending' && has) return false;
    if (filter.status === 'reviewed' && !has) return false;
    if (filter.verdict !== 'all') { if (!has || V.deriveVerdict(latest.get(q.id), q, { strict }).primary !== filter.verdict) return false; }
    if (filter.mine && assign[q.id] && assign[q.id] !== reviewer) return false;
    if (filter.who !== 'all' && assign[q.id] !== filter.who) return false;
    if (filter.followers !== 'all') { const f = q.follower_count; const [lo, hi] = FOLLOWER_BANDS[filter.followers]; if (f == null || f < lo || f >= hi) return false; }
    if (filter.platform !== 'all' && !q.platforms.some(p => p.platform === filter.platform)) return false;
    if (filter.category !== 'all' && (q.main_category || '—') !== filter.category) return false;
    return true;
  }).sort((a, b) => (filter.sort === 'followers_desc' ? (b.follower_count ?? -1) - (a.follower_count ?? -1) : filter.sort === 'followers_asc' ? (a.follower_count ?? Infinity) - (b.follower_count ?? Infinity) : 0)), [scoped, latest, filter, assign, reviewer, strict]);
  const categories = useMemo(() => [...new Set(scoped.map(q => q.main_category || '—'))].sort(), [scoped]);
  const platformsInQueue = useMemo(() => [...new Set(scoped.flatMap(q => q.platforms.map(p => p.platform)))].sort(), [scoped]);
  // independent progress per reviewer: reviewed / assigned (a creator counts as done once anyone reviewed it)
  const perReviewer = useMemo(() => {
    const names = [...new Set([...teamNames, ...assigned.values()])];
    return names.map(n => { const mine = scoped.filter(q => assign[q.id] === n); return { name: n, total: mine.length, done: mine.filter(q => latest.has(q.id)).length }; });
  }, [teamNames, assigned, scoped, assign, latest]);

  const nextPending = useCallback(fromId => {
    const pend = scoped.filter(q => !latest.has(q.id) && (!filter.mine || !assign[q.id] || assign[q.id] === reviewer));
    const idx = fromId ? pend.findIndex(q => q.id === fromId) : -1;
    return (pend[idx + 1] || pend.find(q => q.id !== fromId))?.id || null;
  }, [scoped, latest, assign, reviewer, filter.mine]);

  const openReview = id => { setCurrent(id); setTab('review'); };
  const saveReview = review => {
    const r = store.saveReview(review);
    if (!r.ok) { flash('تعذّر الحفظ: ' + (r.errors || []).join(', ')); return; }
    setReviews(store.loadReviews());
    const nx = nextPending(review.creator_id);
    setCurrent(nx); if (!nx) { setTab('queue'); flash('انتهى الطابور ✅'); }
  };
  const setPilot = on => { const m = { ...meta, pilot: on }; setMeta(m); store.saveMeta({ pilot: on }); };

  const loadQueueFile = async e => {
    const file = e.target.files?.[0]; if (!file) return;
    if (!isAdmin) { flash('تحميل الطابور للمسؤول فقط'); e.target.value = ''; return; }
    try {
      const j = JSON.parse(await file.text());
      const recs = j.records || j;
      if (!Array.isArray(recs) || !recs.every(r => r.id && r.display_name && Array.isArray(r.platforms))) throw new Error('صيغة الطابور غير صحيحة');
      persist(recs, setQueue, store.saveQueue, 'الطابور');
      const a = V.assignReviewers(recs.filter(r => !meta.pilot || r.queue_tier === 1), teamNames.length ? teamNames : [reviewer]);
      persist(a, setAssign, store.saveAssign, 'التوزيع');
      flash(`تم تحميل ${recs.length} مبدعاً (${recs.filter(r => r.queue_tier === 1).length} في الطابور 1)`);
    } catch (err) { flash('فشل التحميل: ' + err.message); }
    e.target.value = '';
  };
  const importAll = async e => {
    const file = e.target.files?.[0]; if (!file) return;
    const r = store.importAll(await file.text());
    if (r.ok) {
      setReviews(store.loadReviews()); setWaves(store.loadWaves()); setMembers(store.loadMembers()); setAssign(store.loadAssign()); setIssues(store.loadIssues());
      if (r.reviews_rejected) { const m = { ...meta, merge_rejected: (meta.merge_rejected || 0) + r.reviews_rejected }; setMeta(m); store.saveMeta({ merge_rejected: m.merge_rejected }); }
      flash(`دُمج: ${r.reviews_added} مراجعة (${r.reviews_rejected} مرفوضة)`);
    } else { const i = PL.newIssue({ type: 'export_merge', text: 'فشل استيراد ملف: ' + r.error, by: reviewer }); store.saveIssue(i); setIssues(store.loadIssues()); flash('فشل الاستيراد: ' + r.error); }
    e.target.value = '';
  };
  const redistribute = () => {
    if (!isAdmin) { flash('إعادة التوزيع للمسؤول فقط'); return; }
    if (assigned.size && !window.confirm(`سيُعاد توزيع ${scoped.length} مبدع على ${teamNames.length} مراجعين وتتغير المسؤوليات الحالية للجميع. متابعة؟`)) return;
    persist({ ...assign, ...V.assignReviewers(scoped, teamNames.length ? teamNames : [reviewer]) }, setAssign, store.saveAssign, 'التوزيع'); flash('أُعيد توزيع الطابور'); }; // merge: never drop the other cohort's assignments
  // team edits to the queue (admin): add a creator by hand / remove (soft, reversible) / restore
  const addCreator = () => {
    if (!isAdmin) { flash('إضافة المبدعين للمسؤول فقط'); return; }
    const r = Q.buildManualRecord(addForm, queue, reviewer);
    if (!r.ok) { flash('تعذّرت الإضافة: ' + r.errors.join(' · ')); return; }
    const load = n => [...assigned.values()].filter(v => v === n).length;
    const who = addForm.assign_to || [...teamNames].sort((a, b) => load(a) - load(b))[0] || reviewer;
    const rec = cohort === 'discovery' ? { ...r.record, queue_tier: 5, cohort: 'discovery', batch: 'manual' } : r.record; // added inside Discovery stays in Discovery
    persist([...queue, rec], setQueue, store.saveQueue, 'الطابور');
    persist({ ...assign, [rec.id]: who }, setAssign, store.saveAssign, 'التوزيع');
    setAddForm({ profile_url: '', display_name: '', followers: '', main_category: '', city: '', source: '', note: '', assign_to: '' });
    flash(`أُضيف «${r.record.display_name}» وأُسند إلى ${who}`);
  };
  const confirmRemove = () => {
    if (!isAdmin || !removing) return;
    const rec = queue.find(q => q.id === removing.id); if (!rec) { setRemoving(null); return; }
    persist(queue.map(q => (q.id === rec.id ? Q.removeFromQueue(q, reviewer, removing.reason) : q)), setQueue, store.saveQueue, 'الطابور');
    if (current === rec.id) setCurrent(null);
    flash(`أُزيل «${rec.display_name}» من الطابور (يمكن استعادته من تبويب البيانات)`); setRemoving(null);
  };
  const restoreCreator = id => { if (!isAdmin) return; persist(queue.map(q => (q.id === id ? Q.restoreToQueue(q) : q)), setQueue, store.saveQueue, 'الطابور'); flash('أُعيد المبدع إلى الطابور'); };
  const addIssue = i => { const r = store.saveIssue(i); if (r.ok) setIssues(store.loadIssues()); else flash('تعذّر حفظ الملاحظة'); };

  const memberFor = (waveId, cid, slot, kind) => {
    const c = byId[cid] || {}; const rv = latest.get(cid) || {};
    const m = V.newMember(waveId, cid, { segment: rv.segment || null, kind, slot, attrs: { creator_type: c.creator_type || 'unknown', follower_tier: c.tier || 'unknown', platform: c.platforms?.[0]?.platform || 'unknown', pilot_group: PL.pilotGroupOf(slot, kind) } });
    return { ...m, channel: PL.bestChannel(c.contacts) };
  };
  const createPilot = () => {
    if (!pilotPlan.total) { flash('لا يوجد مؤهَّلون بعد — أكمل المراجعة الصارمة أولاً.'); return; }
    const id = 'W' + Date.now().toString(36);
    const w = { id, name: waveName, pilot: true, created_at: new Date().toISOString(), created_by: reviewer, allocation: alloc, shortage: pilotPlan.shortage, message: pilotPlan.message };
    const ms = pilotPlan.slots.flatMap(s => s.selected.map(cid => memberFor(id, cid, s.key, s.key === 'ugc_capable' ? 'ugc' : 'gift')));
    persist([...waves, w], setWaves, store.saveWaves, 'الموجة'); persist([...membersRef.current, ...ms], setMembers, store.saveMembers, 'الأعضاء');
    setActiveWave(id); setTab('outreach'); flash(`قائمة التجربة: ${ms.length} مبدع` + (pilotPlan.message ? ' — ' + pilotPlan.message : ''));
  };
  const createWave = () => {
    if (!wavePreview.total) { flash('لا يوجد مراجَعون مؤهَّلون بعد'); return; }
    const id = 'W' + Date.now().toString(36);
    const w = { id, name: waveName, created_at: new Date().toISOString(), created_by: reviewer, quotas, shortage: wavePreview.shortfall, message: wavePreview.message };
    const ms = wavePreview.slots.flatMap(s => s.selected.map(cid => memberFor(id, cid, s.key, s.key === 'ugc_capable' ? 'ugc' : (V.deriveVerdict(latest.get(cid), byId[cid], { strict }).primary === 'paid_inquiry' ? 'paid' : 'gift'))));
    persist([...waves, w], setWaves, store.saveWaves, 'الموجة'); persist([...membersRef.current, ...ms], setMembers, store.saveMembers, 'الأعضاء');
    setActiveWave(id); setTab('outreach'); flash(`أُنشئت ${waveName} بـ ${ms.length} مبدع` + (wavePreview.message ? ' — ' + wavePreview.message : ''));
  };
  const updateMember = (m, f) => {
    try { const cur = membersRef.current.find(x => x.wave_id === m.wave_id && x.creator_id === m.creator_id) || m; const nm = f(cur); persist(membersRef.current.map(x => (x.wave_id === m.wave_id && x.creator_id === m.creator_id ? nm : x)), setMembers, store.saveMembers, 'المتابعة'); }
    catch (err) { flash(err.message); }
  };
  const distribute = () => {
    if (!teamNames.length) { flash('اكتب أسماء الفريق أولاً (تبويب البيانات)'); return; }
    const d = {}; waveMembers.forEach((m, i) => { d[m.creator_id] = teamNames[i % teamNames.length]; });
    persist(membersRef.current.map(m => (m.wave_id === activeWave && !m.assigned_to ? { ...m, assigned_to: d[m.creator_id], ...(m.status === 'selected' ? { status: 'assigned', history: [...m.history, { status: 'assigned', at: new Date().toISOString(), by: reviewer }] } : {}) } : m)), setMembers, store.saveMembers, 'المتابعة');
    flash('وُزّعت الحسابات بالتساوي');
  };

  const ALL_TABS = [['queue', 'الطابور'], ['review', 'مراجعة'], ['waves', 'التجربة'], ['outreach', 'المتابعة'], ['results', 'النتائج'], ['issues', 'ملاحظات'], ['report', 'التقرير'], ['data', 'البيانات']];
  // Discovery cohort = review only. Pilot waves / outreach / results / report stay about the original 46 so the numbers never mix.
  const TABS = cohort === 'discovery' ? ALL_TABS.filter(([k]) => ['queue', 'review', 'issues', 'data'].includes(k)) : ALL_TABS;
  const curItem = current ? scoped.find(q => q.id === current) : null;

  return (
    <div className="space-y-3" dir="rtl">
      <div className="bg-surface border border-border rounded-2xl p-3 space-y-2">
        <div className="flex justify-between items-center">
          <h2 className="text-base font-extrabold text-text">🧪 مراجعة وتواصل المبدعين {meta.pilot && <Pill cls="bg-blue-50 text-blue-700 border-blue-200">وضع التجربة · الطابور 1 · مراجعة صارمة</Pill>}</h2>
          <span className="text-[11px] text-muted">المراجع: <b>{reviewer}</b></span>
        </div>
        <div className="h-2 bg-surface-alt rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${progress.pct}%` }} /></div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <Pill>تمت مراجعة {progress.reviewed}/{progress.total}</Pill>
          {sync && <Pill>{sync.ok ? '☁ متزامن مع الفريق' : '⚠ غير متزامن: ' + (sync.error || '')}</Pill>}
          {perReviewer.map(p => <Pill key={p.name} cls="bg-green-50 text-green-700 border-green-200">{p.name}: {p.done}/{p.total}</Pill>)}
          {Object.entries(progress.verdicts).map(([k, n]) => <Pill key={k} cls={VERDICT_COLOR[k]}>{V.VERDICT_LABEL_AR[k]}: {n}</Pill>)}
          {progress.median_seconds !== null && <Pill>وسيط الوقت {progress.median_seconds}s ({progress.within_target}/{progress.timed} ضمن 90s)</Pill>}
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="الطابور">
        <button type="button" onClick={() => setCohort('pilot')} className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${cohort === 'pilot' ? 'bg-navy text-white border-navy' : 'bg-surface text-text border-border'}`}>عينة التجربة الأصلية ({cohortCounts.pilot})</button>
        <button type="button" onClick={() => setCohort('discovery')} className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${cohort === 'discovery' ? 'bg-navy text-white border-navy' : 'bg-surface text-text border-border'}`}>اكتشاف — دفعات بعد بدء التجربة ({cohortCounts.discovery})</button>
      </div>
      {cohort === 'discovery' && <p className="text-[11px] bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">مبدعون مكتشفون بعد بدء التجربة. نتائجهم منفصلة تماماً عن عينة الـ46 الأصلية ولا تدخل بتقرير التجربة. المراجعة هنا نفسها (8 أسئلة)، ولا يوجد تواصل/موجات.</p>}
      <div className="flex gap-1.5 overflow-x-auto pb-1">{TABS.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} className={`text-xs font-bold px-3 py-1.5 rounded-lg border whitespace-nowrap ${tab === k ? 'bg-navy text-white border-navy' : 'bg-surface text-text border-border'}`}>{l}</button>)}</div>
      {msg && <p className="text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2" role="status">{msg}</p>}

      {tab === 'queue' && (
        <div className="space-y-2">
          {scoped.length === 0 && <div className="bg-surface border border-dashed border-border rounded-2xl p-4 text-xs space-y-2"><p className="font-bold">الطابور فارغ.</p><p className="text-muted">حمّل ملف الطابور من تبويب «البيانات». الملف داخلي — لا يُنشر علناً.</p><Btn kind="primary" onClick={() => setTab('data')}>إلى البيانات</Btn></div>}
          {scoped.length > 0 && (
            <>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {!meta.pilot && <select value={filter.tier} onChange={e => setFilter({ ...filter, tier: e.target.value })} className="bg-surface border border-border rounded-lg px-2 py-1"><option value="all">كل الطوابير</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select>}
                <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })} className="bg-surface border border-border rounded-lg px-2 py-1"><option value="all">الكل</option><option value="pending">لم تُراجَع</option><option value="reviewed">تمت مراجعتها</option></select>
                <select value={filter.verdict} onChange={e => setFilter({ ...filter, verdict: e.target.value })} className="bg-surface border border-border rounded-lg px-2 py-1"><option value="all">كل الأحكام</option>{V.VERDICTS.map(v => <option key={v} value={v}>{V.VERDICT_LABEL_AR[v]}</option>)}</select>
                <label className="flex items-center gap-1"><input type="checkbox" checked={filter.mine} onChange={e => setFilter({ ...filter, mine: e.target.checked })} />حساباتي فقط</label>
                <select aria-label="الفرز" value={filter.sort} onChange={e => setFilter({ ...filter, sort: e.target.value })} className={selCls}><option value="default">ترتيب الطابور</option><option value="followers_desc">المتابعون: الأكثر أولاً</option><option value="followers_asc">المتابعون: الأقل أولاً</option></select>
                <select aria-label="المتابعون" value={filter.followers} onChange={e => setFilter({ ...filter, followers: e.target.value })} className={selCls}><option value="all">كل المتابعين</option>{Object.entries(FOLLOWER_BAND_AR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <select aria-label="المنصة" value={filter.platform} onChange={e => setFilter({ ...filter, platform: e.target.value })} className={selCls}><option value="all">كل المنصات</option>{platformsInQueue.map(p => <option key={p} value={p}>{PLAT_AR[p] || p}</option>)}</select>
                <select aria-label="الفئة" value={filter.category} onChange={e => setFilter({ ...filter, category: e.target.value })} className={selCls}><option value="all">كل الفئات</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
                <select aria-label="المراجع" value={filter.who} onChange={e => setFilter({ ...filter, who: e.target.value })} className={selCls}><option value="all">كل المراجعين</option>{perReviewer.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}</select>
                {canReview && <Btn kind="primary" onClick={() => { const nx = nextPending(null); if (nx) openReview(nx); else flash('لا يوجد شيء للمراجعة'); }}>ابدأ المراجعة ←</Btn>}
              </div>
              {removing && (() => { const rec = queue.find(q => q.id === removing.id); return rec && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2 text-xs" role="alertdialog">
                  <p className="font-bold">إزالة «{rec.display_name}» من الطابور؟</p>
                  {latest.has(rec.id) && <p className="text-red-700">له مراجعة محفوظة: تبقى محفوظة لكنه سيُستثنى من أرقام التجربة والتقرير.</p>}
                  <select value={removing.reason} onChange={e => setRemoving({ ...removing, reason: e.target.value })} className={selCls}>{Q.REMOVE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}</select>
                  <div className="flex gap-2"><Btn kind="danger" onClick={confirmRemove}>تأكيد الإزالة</Btn><Btn onClick={() => setRemoving(null)}>إلغاء</Btn></div>
                </div>); })()}
              <p className="text-[11px] text-muted">{list.length} نتيجة</p>
              {list.map(q => {
                const r = latest.get(q.id); const v = r ? V.deriveVerdict(r, q, { strict }) : null; const comp = r ? V.reviewCompleteness(r) : null;
                return (
                  <div key={q.id} className="bg-surface border border-border rounded-xl px-3 py-2 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-text truncate">{q.display_name}</p>
                      <p className="text-[10px] text-muted truncate" dir="ltr">{q.platforms.map(p => `${p.platform[0]}:@${p.handle}`).join('  ')} · {fmtN(q.follower_count)} · {q.main_category || '—'}{assign[q.id] ? ` · ${assign[q.id]}` : ''}{comp && !comp.complete ? ` · ${comp.done}/8` : ''}</p>
                    </div>
                    {v ? <VerdictPill v={v.primary} /> : <Pill>بانتظار المراجعة</Pill>}
                    {canReview && <Btn onClick={() => openReview(q.id)}>{r ? 'تعديل' : 'راجع'}</Btn>}
                    {isAdmin && <Btn kind="danger" title="إزالة من الطابور (قابلة للاستعادة)" onClick={() => setRemoving({ id: q.id, reason: Q.REMOVE_REASONS[0] })}>حذف</Btn>}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {tab === 'review' && (
        curItem
          ? <ReviewCard key={curItem.id + (latest.get(curItem.id)?.reviewed_at || '')} item={curItem} prior={latest.get(curItem.id)} reviewer={reviewer} strict={strict} position={latest.has(curItem.id) ? 'إعادة مراجعة' : `متبقي ${progress.remaining}`} onSave={saveReview} onSkip={() => setCurrent(nextPending(curItem.id))} />
          : <div className="bg-surface border border-border rounded-2xl p-4 text-xs space-y-2"><p className="font-bold">اختر مبدعاً من الطابور أو ابدأ المراجعة.</p><Btn kind="primary" onClick={() => { const nx = nextPending(null); if (nx) setCurrent(nx); else setTab('queue'); }}>ابدأ</Btn></div>
      )}

      {tab === 'waves' && (
        <div className="space-y-2">
          {meta.pilot ? (
            <div className="bg-surface border border-border rounded-2xl p-3 space-y-2">
              <p className="text-sm font-extrabold">قائمة التجربة (حتى 30) — من الطابور 1 ومن المراجَعين والمؤهَّلين فقط</p>
              <p className="text-[11px] text-muted">الأعداد أهداف لا حصص إلزامية. الاختيار ليس «الأعلى نقاطاً»: يوزَّع على شرائح المتابعين والمنصات ووسائل التواصل والمدن. النقص يُذكر ولا يُعوَّض من شريحة أخرى.</p>
              <input value={waveName} onChange={e => setWaveName(e.target.value)} className="w-full bg-surface-alt border border-border rounded-lg px-2 py-1.5 text-xs" />
              {pilotPlan.slots.map(s => (
                <div key={s.key} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-32">{SLOT_AR[s.key]}</span>
                    <input type="number" min="0" value={alloc.find(a => a.key === s.key)?.target ?? 0} onChange={e => setAlloc(alloc.map(a => (a.key === s.key ? { ...a, target: Math.max(0, Number(e.target.value) || 0) } : a)))} className="w-14 bg-surface-alt border border-border rounded-lg px-2 py-1" />
                    <span className={s.shortage ? 'text-amber-700 font-bold' : 'text-green-700 font-bold'}>{s.count}/{s.target}{s.shortage ? ` — نقص ${s.shortage}` : ' ✓'}</span>
                  </div>
                  {showWhy && s.selected.map(id => <p key={id} className="text-[10px] text-muted mr-4" dir="ltr">{byId[id]?.display_name}: score {s.why[id].score.toFixed(0)} (base {s.why[id].base}, tier −{s.why[id].penalties.tier}, platform −{s.why[id].penalties.platform}, channel −{s.why[id].penalties.channel}, city −{s.why[id].penalties.city}) · {s.why[id].attrs.tier}/{s.why[id].attrs.platform}/{s.why[id].attrs.channel || 'dm'}</p>)}
                </div>
              ))}
              <p className={`text-xs font-bold ${pilotPlan.shortage ? 'text-amber-700' : 'text-green-700'}`}>{pilotPlan.total}/{pilotPlan.target} · مراجَعون {pilotPlan.counts_in_scope.reviewed} · مؤهَّلون {pilotPlan.counts_in_scope.qualified}{pilotPlan.paid_inquiry_qualified.length ? ` · استفسار مدفوع (خارج التجربة): ${pilotPlan.paid_inquiry_qualified.length}` : ''}{pilotPlan.leftovers_qualified_not_selected.length ? ` · مؤهَّلون لم يدخلوا: ${pilotPlan.leftovers_qualified_not_selected.length}` : ''}</p>
              {pilotPlan.message && <p className="text-[11px] text-amber-700">{pilotPlan.message}</p>}
              {pilotPlan.paid_inquiry_qualified.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 text-[11px] space-y-0.5">
                  <p className="font-bold">Paid Inquiry (مسار منفصل — خارج تجربة الهدايا)</p>
                  {pilotPlan.paid_inquiry_qualified.map(id => <p key={id}>• {byId[id]?.display_name}: المراجع أوصى باستفسار مدفوع (سعر/تفاوض/عائد) — لم يدخل تجربة الهدايا كي لا يشوّه قياسها</p>)}
                </div>
              )}
              <div className="flex gap-2 items-center"><label className="text-[11px] flex items-center gap-1"><input type="checkbox" checked={showWhy} onChange={e => setShowWhy(e.target.checked)} />اعرض سبب الاختيار</label>{canOutreach && <Btn kind="good" onClick={createPilot} disabled={!pilotPlan.total}>إنشاء قائمة التجربة</Btn>}</div>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-2xl p-3 space-y-2">
              <p className="text-sm font-extrabold">بناء موجة من المراجَعين بشرياً فقط</p>
              <input value={waveName} onChange={e => setWaveName(e.target.value)} className="w-full bg-surface-alt border border-border rounded-lg px-2 py-1.5 text-xs" />
              {quotas.map((qt, i) => (
                <div key={qt.key} className="flex items-center gap-2 text-xs"><span className="w-32">{qt.label}</span>
                  <input type="number" min="0" value={qt.target} onChange={e => setQuotas(quotas.map((x, j) => (j === i ? { ...x, target: Math.max(0, Number(e.target.value) || 0) } : x)))} className="w-16 bg-surface-alt border border-border rounded-lg px-2 py-1" />
                  <span className={wavePreview.slots[i].shortfall ? 'text-amber-700 font-bold' : 'text-green-700 font-bold'}>{wavePreview.slots[i].count}/{qt.target}</span></div>
              ))}
              <p className="text-xs font-bold">{wavePreview.total}/{wavePreview.target} {wavePreview.message || ''}</p>
              {canOutreach && <Btn kind="good" onClick={createWave} disabled={!wavePreview.total}>إنشاء الموجة</Btn>}
            </div>
          )}
          {waves.map(w => <div key={w.id} className="bg-surface border border-border rounded-xl px-3 py-2 flex items-center gap-2 text-xs"><b className="flex-1">{w.name}</b><span className="text-muted">{members.filter(m => m.wave_id === w.id).length} مبدع</span><Btn onClick={() => { setActiveWave(w.id); setTab('outreach'); }}>فتح</Btn></div>)}
        </div>
      )}

      {tab === 'outreach' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <select value={activeWave || ''} onChange={e => setActiveWave(e.target.value || null)} className="bg-surface border border-border rounded-lg px-2 py-1"><option value="">اختر موجة</option>{waves.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
            {canOutreach && activeWave && <Btn onClick={distribute}>توزيع بالتساوي على الفريق</Btn>}
            {activeWave && <Btn onClick={() => download('pilot-members.csv', V.waveToCsv(waves.find(w => w.id === activeWave)?.name, waveMembers, byId))}>⬇ CSV</Btn>}
          </div>
          {activeWave && (
            <>
              <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
                {['contacted', 'replied', 'interested', 'accepted', 'address_received', 'product_sent', 'received', 'content_received', 'posted'].map(s => <div key={s} className="bg-surface border border-border rounded-xl p-1.5"><p className="text-base font-extrabold text-text">{fn.rates[s]?.count ?? fn[s]}</p><p className="text-muted">{V.OUTREACH_LABEL_AR[s]}</p></div>)}
              </div>
              {actions.length > 0 && <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 text-[11px] space-y-0.5"><p className="font-bold">مطلوب اليوم (اقتراحات، لا إرسال آلي):</p>{actions.map(a => <p key={a.creator_id + a.action}>• {byId[a.creator_id]?.display_name}: {a.action} — {a.note}</p>)}</div>}
              {waveMembers.map(m => {
                const c = byId[m.creator_id] || {}; const idx = V.OUTREACH_STAGES.indexOf(m.status); const nextStage = V.OUTREACH_STAGES[idx + 1];
                const canGo = nextStage && V.canAdvance(m, nextStage);
                const skip = (m.status === 'replied' && V.canAdvance(m, 'accepted').ok) ? 'accepted' : null;
                const goTo = st => updateMember(m, x => V.advance(x, st, reviewer, new Date(), (st === 'posted' || st === 'content_received') ? { content_url: x.content_url || window.prompt('رابط المحتوى (مطلوب)') || null, content_kind: x.kind === 'ugc' ? 'ugc' : 'post' } : {}));
                return (
                  <div key={m.creator_id} className="bg-surface border border-border rounded-xl p-2 space-y-1.5">
                    <div className="flex items-center gap-2"><b className="text-sm flex-1 truncate">{c.display_name}</b><Pill>{V.OUTREACH_LABEL_AR[m.status] || m.status}</Pill><Pill>{SLOT_AR[m.slot] || m.slot || m.kind}</Pill></div>
                    <div className="flex flex-wrap gap-1.5 items-center text-[11px]">
                      <select value={m.assigned_to || ''} disabled={!canOutreach} onChange={e => updateMember(m, x => ({ ...x, assigned_to: e.target.value || null }))} className="bg-surface-alt border border-border rounded-lg px-1 py-1"><option value="">بدون مسؤول</option>{teamNames.concat(m.assigned_to && !teamNames.includes(m.assigned_to) ? [m.assigned_to] : []).map(n => <option key={n} value={n}>{n}</option>)}</select>
                      <select value={m.channel || ''} disabled={!canOutreach} onChange={e => updateMember(m, x => ({ ...x, channel: e.target.value || null }))} className="bg-surface-alt border border-border rounded-lg px-1 py-1"><option value="">وسيلة التواصل *</option>{V.CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}</select>
                      {canOutreach && nextStage && <Btn onClick={() => goTo(nextStage)} disabled={!canGo?.ok} title={canGo?.reason}>→ {V.OUTREACH_LABEL_AR[nextStage]}</Btn>}
                      {canOutreach && skip && <Btn onClick={() => goTo(skip)}>→ {V.OUTREACH_LABEL_AR[skip]} (بدون «مهتم»)</Btn>}
                      {canOutreach && m.status === 'contacted' && <Btn onClick={() => updateMember(m, x => V.logFollowup(x, reviewer))}>متابعة #{m.followups + 1}</Btn>}
                      {canOutreach && !V.OUTREACH_TERMINALS.includes(m.status) && m.status !== 'posted' && ['declined', 'no_response', 'do_not_contact'].map(t => <Btn key={t} kind="danger" disabled={!V.canAdvance(m, t).ok} title={V.canAdvance(m, t).reason} onClick={() => updateMember(m, x => V.advance(x, t, reviewer))}>{V.OUTREACH_LABEL_AR[t]}</Btn>)}
                      <Btn onClick={() => { navigator.clipboard?.writeText(V.outreachMessage({ name: c.display_name, kind: m.kind })); flash('نُسخت الرسالة — أرسلها يدوياً بنفسك (لا إرسال آلي)'); }}>نسخ رسالة</Btn>
                    </div>
                    {canGo && !canGo.ok && nextStage === 'contacted' && <p className="text-[10px] text-amber-700">{canGo.reason}</p>}
                    <input value={m.notes || ''} onChange={e => updateMember(m, x => ({ ...x, notes: e.target.value }))} placeholder="ملاحظات" className="w-full bg-surface-alt border border-border rounded-lg px-2 py-1 text-[11px]" />
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {tab === 'results' && <ResultsPanel members={activeWave ? waveMembers : members} />}
      {tab === 'issues' && <IssuesPanel issues={issues} creators={scoped} reviewer={reviewer} onAdd={addIssue} />}
      {tab === 'report' && <ReportPanel queue={scoped} reviews={reviews} members={members} issues={issues} mergeRejected={meta.merge_rejected || 0} strict={strict} />}

      {tab === 'data' && (
        <div className="space-y-2 text-xs">
          <div className="bg-surface border border-border rounded-2xl p-3 space-y-2">
            <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={meta.pilot} onChange={e => setPilot(e.target.checked)} />وضع التجربة: الطابور 1 فقط + مراجعة صارمة (8 أسئلة كاملة وإلا Needs Review)</label>
            <p className="font-extrabold">1) الفريق — اختر المراجعين (حسابات النظام)</p>
            <div className="flex flex-wrap gap-2">
              {employees.map(e => (
                <label key={e.name} className={`flex items-center gap-1 rounded-xl border px-2 py-1 cursor-pointer ${teamNames.includes(e.name) ? 'bg-surface-alt border-navy font-bold' : 'bg-surface'}`}>
                  <input type="checkbox" disabled={!isAdmin} checked={teamNames.includes(e.name)} onChange={() => toggleTeam(e.name)} />{e.name}
                </label>
              ))}
              {teamNames.filter(n => !employees.some(e => e.name === n)).map(n => (
                <label key={n} className="flex items-center gap-1 rounded-xl border px-2 py-1 bg-surface-alt border-navy font-bold cursor-pointer"><input type="checkbox" disabled={!isAdmin} checked onChange={() => toggleTeam(n)} />{n}</label>
              ))}
              {!employees.length && !teamNames.length && <span className="text-muted">تعذّر تحميل قائمة المستخدمين</span>}
            </div>
            {!isAdmin && <p className="text-[11px] font-bold text-amber-700">اختيار الفريق وتوزيع الطابور للمسؤول فقط.</p>}
            <p className="text-[11px] text-muted">الاختيار يُحفظ ويظهر لكل الفريق. التوزيع يعتمد على هذه الأسماء نفسها، فيعمل فلتر «حساباتي فقط» لكل مراجع.</p>
            {scoped.length > 0 && <Btn kind="primary" onClick={redistribute} disabled={!isAdmin || !teamNames.length}>{assigned.size ? 'إعادة توزيع الطابور على الفريق' : 'توزيع الطابور على الفريق'}</Btn>}
            <p className="text-[11px] text-muted">{scoped.length} مبدع في الطابور · {teamNames.map(n => `${n}: ${[...assigned.values()].filter(v => v === n).length}`).join(' · ') || 'لم يُحدَّد فريق بعد'}</p>
            {isAdmin && <details className="text-muted">
              <summary className="cursor-pointer font-bold">خيار احتياطي للمسؤول: تحميل الطابور من ملف</summary>
              <div className="pt-2 space-y-1"><p>الطابور يُحمَّل تلقائياً من قاعدة البيانات. استخدم الملف فقط لاستبدال الطابور (workbench_queue.json).</p><input type="file" accept=".json,application/json" onChange={loadQueueFile} /></div>
            </details>}
          </div>
          {isAdmin && (
            <div className="bg-surface border border-border rounded-2xl p-3 space-y-2">
              <p className="font-extrabold">إضافة مبدع جديد إلى الطابور</p>
              <p className="text-[11px] text-muted">يُحفظ مع اسمك وتاريخ الإضافة ومصدر الاكتشاف، ويُعلَّم «أُضيف يدوياً» ليظهر بالتقرير. المجهول يبقى فارغاً (لا تخمّن).</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[['display_name', 'الاسم *'], ['profile_url', 'رابط البروفايل * (Instagram/TikTok…)'], ['followers', 'المتابعون (اتركه فارغاً إن لم تعرف)'], ['source', 'مصدر الاكتشاف * (رابط أو وصف)']].map(([k, ph]) => (
                  <input key={k} value={addForm[k]} onChange={e => setAddForm({ ...addForm, [k]: e.target.value })} placeholder={ph} aria-label={ph} dir="auto" className="bg-surface-alt border border-border rounded-xl px-2 py-1.5" />
                ))}
                <select aria-label="الفئة" value={addForm.main_category} onChange={e => setAddForm({ ...addForm, main_category: e.target.value })} className={selCls}><option value="">الفئة (اختياري)</option>{Q.MANUAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                <select aria-label="المدينة" value={addForm.city} onChange={e => setAddForm({ ...addForm, city: e.target.value })} className={selCls}><option value="">المدينة (اختياري)</option>{SYRIA_CITIES.map(c => <option key={c} value={c}>{CITY_AR[c] || c}</option>)}</select>
                <select aria-label="إسناد إلى" value={addForm.assign_to} onChange={e => setAddForm({ ...addForm, assign_to: e.target.value })} className={selCls}><option value="">إسناد تلقائي (الأقل حملاً)</option>{teamNames.map(n => <option key={n} value={n}>{n}</option>)}</select>
                <input value={addForm.note} onChange={e => setAddForm({ ...addForm, note: e.target.value })} placeholder="ملاحظة (اختياري)" aria-label="ملاحظة" dir="auto" className="bg-surface-alt border border-border rounded-xl px-2 py-1.5" />
              </div>
              <Btn kind="primary" onClick={addCreator}>+ إضافة إلى الطابور</Btn>
              {removedList.length > 0 && (
                <div className="pt-2 space-y-1">
                  <p className="font-bold">المحذوفون ({removedList.length}) — قابلون للاستعادة</p>
                  {removedList.map(q => (
                    <div key={q.id} className="flex items-center gap-2 bg-surface-alt rounded-xl px-2 py-1">
                      <span className="flex-1 min-w-0 truncate">{q.display_name} <span className="text-muted">· {q.removed.reason} · {q.removed.by || ''}</span></span>
                      <Btn onClick={() => restoreCreator(q.id)}>استعادة</Btn>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="bg-surface border border-border rounded-2xl p-3 space-y-2">
            <p className="font-extrabold">2) النسخ الاحتياطي والتصدير</p>
            <p className="text-muted">العمل يُحفظ تلقائياً ويتزامن مع الفريق. التصدير للنسخ الاحتياطي أو لتوليد التقارير فقط.</p>
            <div className="flex flex-wrap gap-2">
              <Btn kind="primary" onClick={() => download(`creator-workbench-${reviewer}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(store.exportAll(), null, 1), 'application/json')}>⬇ تصدير الكل (JSON)</Btn>
              <label className="text-xs font-bold rounded-xl px-3 py-2 border bg-surface cursor-pointer">⬆ استيراد ودمج<input type="file" accept=".json" onChange={importAll} className="hidden" /></label>
              <Btn onClick={() => download('creator-reviews.csv', V.reviewsToCsv(reviewedItems))}>⬇ المراجعات (CSV)</Btn>
              <Btn kind="danger" onClick={() => { if (window.confirm('مسح نسخة هذا المتصفح؟ بيانات الفريق المشتركة لا تُمسح وتعود عند المزامنة.')) { store.clearAll(); setQueue([]); setReviews([]); setWaves([]); setMembers([]); setAssign({}); setIssues([]); setTeamNames([]); setCurrent(null); } }}>مسح نسخة هذا المتصفح</Btn>
            </div>
            <p className="text-[11px] text-muted">{reviews.length} مراجعة · {waves.length} موجة · {members.length} عضو · {issues.length} ملاحظة · صفوف مرفوضة عند الدمج: {meta.merge_rejected || 0}</p>
          </div>
        </div>
      )}
    </div>
  );
}
