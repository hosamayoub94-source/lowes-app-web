// =============================================================
// AdminSettingsScreen — exchange rates + salary settings
// =============================================================
import { useState, useEffect, useCallback } from 'react';

const CURRENCIES = ['USD','TRY','SYP'];
const PAIRS = [['USD','TRY'],['TRY','USD'],['USD','SYP'],['SYP','USD'],['TRY','SYP'],['SYP','TRY']];

async function getDb() { const { supabase } = await import('@services/supabase'); return supabase; }

async function fetchLatestRates() {
  const sb = await getDb();
  const { data, error } = await sb.from('exchange_rates').select('id,from_cur,to_cur,rate,created_at').order('created_at',{ascending:false});
  if (error) throw new Error(error.message);
  const seen = new Set(); const latest = [];
  for (const r of (data??[])) {
    const key = r.from_cur+'_'+r.to_cur;
    if (!seen.has(key)) { seen.add(key); latest.push(r); }
  }
  return latest;
}

async function insertRate(from_cur, to_cur, rate) {
  const sb = await getDb();
  const { error } = await sb.from('exchange_rates').insert({ from_cur, to_cur, rate: Number(rate) });
  if (error) throw new Error(error.message);
}

async function fetchProfiles() {
  const sb = await getDb();
  const { data, error } = await sb.from('profiles').select('id,employee_name,role_type').eq('is_active',true).order('employee_name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchSalarySettings() {
  const sb = await getDb();
  const { data, error } = await sb.from('employee_salary_settings').select('*,profiles(employee_name,role_type)');
  if (error) throw new Error(error.message);
  return (data??[]).map(r => ({ ...r, employee_name: r.profiles?.employee_name??'', role_type: r.profiles?.role_type??'' }));
}

async function upsertSalarySetting(payload) {
  const sb = await getDb();
  const { employee_name, role_type, profiles: _p, ...db } = payload;
  const { error } = await sb.from('employee_salary_settings').upsert(db, { onConflict:'employee_id' });
  if (error) throw new Error(error.message);
}

const TABS = [{ key:'rates', label:'💱 أسعار الصرف' }, { key:'salary', label:'💰 إعدادات الرواتب' }];

export default function AdminSettingsScreen() {
  const [tab, setTab] = useState('rates');
  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-text">⚙️ إعدادات النظام</h1>
        <p className="text-sm text-muted mt-0.5">أسعار الصرف وإعدادات الرواتب</p>
      </div>
      <div className="flex gap-2 border-b border-border pb-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={['px-4 py-2 text-sm font-medium rounded-t-lg transition', tab===t.key?'bg-teal text-white':'text-muted hover:text-text'].join(' ')}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'rates'  && <ExchangeRatesTab />}
      {tab === 'salary' && <SalarySettingsTab />}
    </div>
  );
}

function ExchangeRatesTab() {
  const [rates, setRates]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [editPair, setEditPair] = useState(null);
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [cvtAmt, setCvtAmt]   = useState('');
  const [cvtFrom, setCvtFrom] = useState('USD');
  const [cvtTo, setCvtTo]     = useState('TRY');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRates(await fetchLatestRates()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const getRate = (fc,tc) => rates.find(r => r.from_cur===fc && r.to_cur===tc);

  const handleSave = async () => {
    if (!editPair.rate || isNaN(Number(editPair.rate))) return;
    setSaving(true);
    try {
      await insertRate(editPair.from_cur, editPair.to_cur, editPair.rate);
      await load(); setSaveMsg('✅ تم الحفظ');
      setTimeout(() => { setSaveMsg(''); setEditPair(null); }, 1200);
    } catch (e) { setSaveMsg('❌ ' + e.message); }
    finally { setSaving(false); }
  };

  const cvtRate = cvtFrom === cvtTo ? 1 : getRate(cvtFrom, cvtTo)?.rate;
  const cvtResult = cvtAmt && cvtRate ? (Number(cvtAmt) * Number(cvtRate)).toFixed(2) : null;

  if (loading) return <div className="text-center py-16 text-muted text-sm">جار التحميل…</div>;
  if (error)   return <div className="text-center py-8 text-red-600 text-sm">{error} <button onClick={load} className="underline mr-2">إعادة</button></div>;

  return (
    <div className="space-y-5">
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-semibold text-text text-sm">أسعار الصرف الحالية</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-cream text-xs text-muted">
              <th className="py-2 px-4 text-right">من</th>
              <th className="py-2 px-4 text-right">إلى</th>
              <th className="py-2 px-4 text-center">السعر</th>
              <th className="py-2 px-4 text-center">آخر تحديث</th>
              <th className="py-2 px-4 text-center">تعديل</th>
            </tr></thead>
            <tbody>
              {PAIRS.map(([fc,tc]) => {
                const r = getRate(fc,tc);
                return (
                  <tr key={fc+tc} className="border-t border-border hover:bg-cream/50">
                    <td className="py-3 px-4 font-semibold text-text">{fc}</td>
                    <td className="py-3 px-4 text-muted">→ {tc}</td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-teal">
                      {r ? Number(r.rate).toLocaleString('ar-SA',{maximumFractionDigits:6}) : '—'}
                    </td>
                    <td className="py-3 px-4 text-center text-xs text-muted">
                      {r ? new Date(r.created_at).toLocaleDateString('ar') : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button onClick={() => setEditPair({from_cur:fc,to_cur:tc,rate:r?.rate??''})}
                        className="px-3 py-1 rounded-lg bg-teal/10 text-teal text-xs font-medium hover:bg-teal/20">
                        تعديل
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-5">
        <h2 className="font-semibold text-text text-sm mb-3">🔄 محول العملات</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div><label className="text-xs text-muted mb-1 block">المبلغ</label>
            <input type="number" value={cvtAmt} onChange={e=>setCvtAmt(e.target.value)} placeholder="0.00"
              className="border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text w-32" /></div>
          <div><label className="text-xs text-muted mb-1 block">من</label>
            <select value={cvtFrom} onChange={e=>setCvtFrom(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text">
              {CURRENCIES.map(c=><option key={c}>{c}</option>)}</select></div>
          <div><label className="text-xs text-muted mb-1 block">إلى</label>
            <select value={cvtTo} onChange={e=>setCvtTo(e.target.value)} className="border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text">
              {CURRENCIES.map(c=><option key={c}>{c}</option>)}</select></div>
          {cvtResult !== null && (
            <div className="bg-teal/10 rounded-xl px-4 py-2 text-sm font-bold text-teal">
              = {Number(cvtResult).toLocaleString('ar-SA')} {cvtTo}
            </div>
          )}
        </div>
      </div>

      {editPair && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={()=>setEditPair(null)}>
          <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold text-text mb-3">1 {editPair.from_cur} = ؟ {editPair.to_cur}</h3>
            <input type="number" step="any" value={editPair.rate} autoFocus
              onChange={e=>setEditPair(p=>({...p,rate:e.target.value}))}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text mb-4" />
            {saveMsg && <div className="text-sm mb-3 text-center">{saveMsg}</div>}
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold disabled:opacity-50">{saving?'جار الحفظ…':'حفظ'}</button>
              <button onClick={()=>setEditPair(null)} className="flex-1 py-2 rounded-xl border border-border text-sm text-text">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_SAL = { employee_id:'', base_salary:'', currency:'TRY', internet_allowance:'', food_allowance:'', monthly_target:'', target_commission:'', sales_commission_pct:'', notes:'' };

function SalarySettingsTab() {
  const [settings, setSettings] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [editRow, setEditRow]   = useState(null);
  const [form, setForm]         = useState(EMPTY_SAL);
  const [saving, setSaving]     = useState(false);
  const [saveErr, setSaveErr]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const [s,p] = await Promise.all([fetchSalarySettings(),fetchProfiles()]); setSettings(s); setProfiles(p); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openEdit = (row) => {
    setEditRow(row);
    setForm({ employee_id:row.employee_id, base_salary:row.base_salary??'', currency:row.currency??'TRY',
      internet_allowance:row.internet_allowance??'', food_allowance:row.food_allowance??'',
      monthly_target:row.monthly_target??'', target_commission:row.target_commission??'',
      sales_commission_pct:row.sales_commission_pct??'', notes:row.notes??'' });
    setSaveErr(null);
  };

  const handleSave = async () => {
    if (!form.employee_id) { setSaveErr('اختر موظفاً'); return; }
    setSaving(true); setSaveErr(null);
    try {
      await upsertSalarySetting({ employee_id:form.employee_id, base_salary:Number(form.base_salary)||0,
        currency:form.currency, internet_allowance:Number(form.internet_allowance)||0,
        food_allowance:Number(form.food_allowance)||0, monthly_target:Number(form.monthly_target)||0,
        target_commission:Number(form.target_commission)||0, sales_commission_pct:Number(form.sales_commission_pct)||0,
        notes:form.notes||null, effective_from: new Date().toISOString().slice(0,10) });
      await load(); setEditRow(null);
    } catch (e) { setSaveErr(e.message); }
    finally { setSaving(false); }
  };

  const settingIds = new Set(settings.map(s=>s.employee_id));
  const unsettled  = profiles.filter(p=>!settingIds.has(p.id));

  if (loading) return <div className="text-center py-16 text-muted text-sm">جار التحميل…</div>;
  if (error)   return <div className="text-center py-8 text-red-600 text-sm">{error} <button onClick={load} className="underline mr-2">إعادة</button></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{settings.length} موظف لديه إعدادات راتب</p>
        <button onClick={() => { setEditRow({_new:true}); setForm(EMPTY_SAL); setSaveErr(null); }}
          className="px-4 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90">+ إضافة</button>
      </div>

      {unsettled.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-xs text-yellow-800">
          {unsettled.length} موظف بدون إعدادات: {unsettled.map(p=>p.employee_name).join('، ')}
        </div>
      )}

      {settings.length === 0 ? (
        <div className="text-center py-16"><div className="text-4xl mb-2">💸</div><p className="text-muted text-sm">لا توجد إعدادات بعد</p></div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-cream text-xs text-muted">
                <th className="py-2 px-4 text-right">الموظف</th>
                <th className="py-2 px-4 text-center">الراتب</th>
                <th className="py-2 px-4 text-center">العملة</th>
                <th className="py-2 px-4 text-center">إنترنت</th>
                <th className="py-2 px-4 text-center">طعام</th>
                <th className="py-2 px-4 text-center">عمولة%</th>
                <th className="py-2 px-4 text-center">تعديل</th>
              </tr></thead>
              <tbody>
                {settings.map(s => (
                  <tr key={s.id} className="border-t border-border hover:bg-cream/50">
                    <td className="py-3 px-4 font-medium text-text">{s.employee_name}</td>
                    <td className="py-3 px-4 text-center font-mono">{Number(s.base_salary).toLocaleString()}</td>
                    <td className="py-3 px-4 text-center text-muted">{s.currency}</td>
                    <td className="py-3 px-4 text-center">{Number(s.internet_allowance).toLocaleString()}</td>
                    <td className="py-3 px-4 text-center">{Number(s.food_allowance).toLocaleString()}</td>
                    <td className="py-3 px-4 text-center">{s.sales_commission_pct}%</td>
                    <td className="py-3 px-4 text-center">
                      <button onClick={() => openEdit(s)} className="px-3 py-1 rounded-lg bg-teal/10 text-teal text-xs font-medium hover:bg-teal/20">تعديل</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editRow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={()=>setEditRow(null)}>
          <div className="bg-surface rounded-2xl p-6 w-full max-w-lg shadow-xl overflow-y-auto max-h-[90vh]" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold text-lg text-text mb-4">{editRow._new?'إضافة إعدادات راتب':'تعديل — '+editRow.employee_name}</h3>
            <div className="space-y-3">
              {editRow._new && (
                <div><label className="text-xs text-muted mb-1 block">الموظف</label>
                  <select value={form.employee_id} onChange={e=>setForm(f=>({...f,employee_id:e.target.value}))} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text">
                    <option value="">اختر موظفاً…</option>
                    {profiles.map(p=><option key={p.id} value={p.id}>{p.employee_name}</option>)}
                  </select></div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {[['base_salary','الراتب الأساسي'],['internet_allowance','بدل إنترنت'],
                  ['food_allowance','بدل طعام'],['monthly_target','الهدف الشهري'],
                  ['target_commission','عمولة الهدف'],['sales_commission_pct','نسبة المبيعات %']].map(([k,lbl])=>(
                  <div key={k}>
                    <label className="text-xs text-muted mb-1 block">{lbl}</label>
                    <input type="number" step="any" value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" />
                  </div>
                ))}
              </div>
              <div><label className="text-xs text-muted mb-1 block">العملة</label>
                <select value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text">
                  {CURRENCIES.map(c=><option key={c}>{c}</option>)}</select></div>
              <div><label className="text-xs text-muted mb-1 block">ملاحظات</label>
                <input type="text" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" placeholder="اختياري" /></div>
            </div>
            {saveErr && <div className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveErr}</div>}
            <div className="flex gap-2 mt-5">
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold disabled:opacity-50">{saving?'جار الحفظ…':'حفظ'}</button>
              <button onClick={()=>setEditRow(null)} className="flex-1 py-2 rounded-xl border border-border text-sm text-text">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
