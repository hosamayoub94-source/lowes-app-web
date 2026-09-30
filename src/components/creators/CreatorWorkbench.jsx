// =============================================================
// CreatorWorkbench — Creator Review & Outreach Workbench (props-only: no auth, no supabase, no network).
//   الطابور 1 (46) → مراجعة بشرية 8 أسئلة → أحكام → قائمة التجربة (حتى 30، بلا حشو) → متابعة تشغيلية → نتائج + تقرير قرار.
// Nothing is sent from here: "نسخ رسالة" only copies text. Storage: `store` (browser storage + JSON export).
// =============================================================
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import * as V from '@services/creatorReview';
import * as PL from '@services/creatorPilot';
import ReviewCard from './ReviewCard';
import { ResultsPanel, IssuesPanel, ReportPanel } from './PilotPanels';
import { SLOT_AR, VERDICT_COLOR, fmtN, download } from './uiData';
import { Pill, Btn, VerdictPill } from './ui';

export default function CreatorWorkbench({ reviewer, store, canReview = true, canOutreach = true, employees = [] }) {
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
  const [filter, setFilter] = useState({ tier: 'all', status: 'all', verdict: 'all', mine: false });
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
  const scoped = useMemo(() => (meta.pilot ? queue.filter(q => q.queue_tier === 1) : queue), [queue, meta.pilot]);
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
  const toggleTeam = name => { const next = teamNames.includes(name) ? teamNames.filter(n => n !== name) : [...teamNames, name]; setTeamNames(next); store.saveTeam?.(next); };
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
    return true;
  }), [scoped, latest, filter, assign, reviewer, strict]);

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
  const redistribute = () => { persist(V.assignReviewers(scoped, teamNames.length ? teamNames : [reviewer]), setAssign, store.saveAssign, 'التوزيع'); flash('أُعيد توزيع الطابور'); };
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

  const TABS = [['queue', 'الطابور'], ['review', 'مراجعة'], ['waves', 'التجربة'], ['outreach', 'المتابعة'], ['results', 'النتائج'], ['issues', 'ملاحظات'], ['report', 'التقرير'], ['data', 'البيانات']];
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
          {Object.entries(progress.verdicts).map(([k, n]) => <Pill key={k} cls={VERDICT_COLOR[k]}>{V.VERDICT_LABEL_AR[k]}: {n}</Pill>)}
          {progress.median_seconds !== null && <Pill>وسيط الوقت {progress.median_seconds}s ({progress.within_target}/{progress.timed} ضمن 90s)</Pill>}
        </div>
      </div>
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
                {canReview && <Btn kind="primary" onClick={() => { const nx = nextPending(null); if (nx) openReview(nx); else flash('لا يوجد شيء للمراجعة'); }}>ابدأ المراجعة ←</Btn>}
              </div>
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
                  <input type="checkbox" checked={teamNames.includes(e.name)} onChange={() => toggleTeam(e.name)} />{e.name}
                </label>
              ))}
              {teamNames.filter(n => !employees.some(e => e.name === n)).map(n => (
                <label key={n} className="flex items-center gap-1 rounded-xl border px-2 py-1 bg-surface-alt border-navy font-bold cursor-pointer"><input type="checkbox" checked onChange={() => toggleTeam(n)} />{n}</label>
              ))}
              {!employees.length && !teamNames.length && <span className="text-muted">تعذّر تحميل قائمة المستخدمين</span>}
            </div>
            <p className="text-[11px] text-muted">الاختيار يُحفظ ويظهر لكل الفريق. التوزيع يعتمد على هذه الأسماء نفسها، فيعمل فلتر «حساباتي فقط» لكل مراجع.</p>
            {scoped.length > 0 && <Btn kind="primary" onClick={redistribute} disabled={!teamNames.length}>{assigned.size ? 'إعادة توزيع الطابور على الفريق' : 'توزيع الطابور على الفريق'}</Btn>}
            <p className="text-[11px] text-muted">{scoped.length} مبدع في الطابور · {teamNames.map(n => `${n}: ${[...assigned.values()].filter(v => v === n).length}`).join(' · ') || 'لم يُحدَّد فريق بعد'}</p>
            <details className="text-muted">
              <summary className="cursor-pointer font-bold">خيار احتياطي للمسؤول: تحميل الطابور من ملف</summary>
              <div className="pt-2 space-y-1"><p>الطابور يُحمَّل تلقائياً من قاعدة البيانات. استخدم الملف فقط لاستبدال الطابور (workbench_queue.json).</p><input type="file" accept=".json,application/json" onChange={loadQueueFile} /></div>
            </details>
          </div>
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
