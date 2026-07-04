// =============================================================
// AdminSettingsScreen — exchange rates + salary settings
// Tables: exchange_rates (from_cur, to_cur, rate)
//         employee_salary_settings (per employee)
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { fetchAllRows } from '@utils/fetchAllRows';

const CURRENCIES = ['USD', 'TRY', 'SYP'];
const PAIRS = [
  ['USD', 'TRY'], ['TRY', 'USD'],
  ['USD', 'SYP'], ['SYP', 'USD'],
  ['TRY', 'SYP'], ['SYP', 'TRY'],
];

// ── Supabase helpers ───────────────────────────────────────────────────────

async function getSupabase() {
  const { supabase } = await import('@services/supabase');
  return supabase;
}

async function fetchLatestRates() {
  const sb = await getSupabase();
  const data = await fetchAllRows(() => sb
    .from('exchange_rates')
    .select('id, from_cur, to_cur, rate, created_at')
    .order('created_at', { ascending: false }));
  // Keep only latest rate per pair
  const seen = new Set();
  const latest = [];
  for (const r of (data ?? [])) {
    const key = `${r.from_cur}_${r.to_cur}`;
    if (!seen.has(key)) { seen.add(key); latest.push(r); }
  }
  return latest;
}

async function insertRate({ from_cur, to_cur, rate, userId }) {
  const sb = await getSupabase();
  const { error } = await sb.from('exchange_rates').insert({ from_cur, to_cur, rate: Number(rate), set_by: userId });
  if (error) throw new Error(error.message);
}

async function fetchProfiles() {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('profiles')
    .select('id, employee_name, role_type')
    .eq('is_active', true)
    .order('employee_name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function fetchSalarySettings() {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('employee_salary_settings')
    .select('*, profiles!employee_salary_settings_employee_id_fkey(employee_name, role_type)')
    .order('employee_id');
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({
    ...r,
    employee_name: r.profiles?.employee_name ?? '',
    role_type:     r.profiles?.role_type ?? '',
  }));
}

async function upsertSalarySetting(payload) {
  const sb = await getSupabase();
  const { employee_name, role_type, profiles: _p, ...dbPayload } = payload;
  const { data, error } = await sb
    .from('employee_salary_settings')
    .upsert(dbPayload, { onConflict: 'employee_id' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Component ──────────────────────────────────────────────────────────────

const TABS = [
  { key: 'rates',         label: '💱 أسعار الصرف'    },
  { key: 'salary',        label: '💰 إعدادات الرواتب' },
  { key: 'announcements', label: '📢 الإعلانات'        },
];

export default function AdminSettingsScreen() {
  const [tab, setTab] = useState('rates');

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-text">⚙️ إعدادات النظام</h1>
        <p className="text-sm text-muted mt-0.5">أسعار الصرف وإعدادات الرواتب</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-border pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              'px-4 py-2 text-sm font-medium rounded-t-lg transition',
              tab === t.key
                ? 'bg-teal text-navy'
                : 'text-muted hover:text-text',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'rates'         && <ExchangeRatesTab />}
      {tab === 'salary'        && <SalarySettingsTab />}
      {tab === 'announcements' && <AnnouncementsTab />}
    </div>
  );
}

// ── Announcements Tab ──────────────────────────────────────────────────────

function AnnouncementsTab() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);
  const [title,     setTitle]     = useState('');
  const [body,      setBody]      = useState('');
  const [isPinned,  setIsPinned]  = useState(false);
  const [isEmergency, setIsEmergency] = useState(false);
  const [msg,       setMsg]       = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const sb = await getSupabase();
      const { data, error: e } = await sb
        .from('announcements')
        .select('id, title, body, is_pinned, is_emergency, created_by, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (e) throw new Error(e.message);
      setAnnouncements(data ?? []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handlePost = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) { setMsg({ type: 'err', text: 'العنوان والمحتوى مطلوبان' }); return; }
    setSaving(true); setMsg(null);
    try {
      const sb = await getSupabase();
      const { error: e } = await sb.from('announcements').insert({
        title:        title.trim(),
        body:         body.trim(),
        message:      body.trim(),
        is_active:    true,
        is_pinned:    isPinned,
        is_emergency: isEmergency,
        created_by:   'الإدارة',
      });
      if (e) throw new Error(e.message);
      setTitle(''); setBody(''); setIsPinned(false); setIsEmergency(false);
      setMsg({ type: 'ok', text: '✅ تم نشر الإعلان بنجاح' });
      await load();
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذا الإعلان؟')) return;
    const sb = await getSupabase();
    const { error } = await sb.from('announcements').delete().eq('id', id);
    if (error) { window.alert('تعذّر حذف الإعلان: ' + error.message); return; }
    setAnnouncements(a => a.filter(x => x.id !== id));
  };

  return (
    <div className="space-y-5 mt-2" dir="rtl">
      {/* Compose */}
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-sm font-bold text-text mb-3">📝 إعلان جديد</p>
        <form onSubmit={handlePost} className="space-y-3">
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="عنوان الإعلان…"
            className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40"
          />
          <textarea
            value={body} onChange={e => setBody(e.target.value)}
            placeholder="محتوى الإعلان…"
            rows={4}
            className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40 resize-none"
          />
          <div className="flex items-center gap-4 text-sm text-muted">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isPinned} onChange={e => setIsPinned(e.target.checked)} className="accent-teal" />
              📌 مثبّت
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isEmergency} onChange={e => setIsEmergency(e.target.checked)} className="accent-red-500" />
              🚨 عاجل
            </label>
          </div>
          {msg && <p className={`text-xs font-semibold ${msg.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>}
          <button type="submit" disabled={saving}
            className="w-full py-2.5 rounded-xl bg-teal text-navy text-sm font-bold hover:opacity-90 disabled:opacity-50 transition">
            {saving ? 'جاري النشر…' : '📢 نشر الإعلان'}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-bold text-text">آخر الإعلانات</p>
        </div>
        {loading ? (
          <p className="text-sm text-muted px-4 py-6 animate-pulse">جاري التحميل…</p>
        ) : error ? (
          <p className="text-sm text-red-500 px-4 py-4">⚠️ {error}</p>
        ) : announcements.length === 0 ? (
          <p className="text-sm text-muted px-4 py-6 text-center">لا توجد إعلانات بعد</p>
        ) : (
          <div className="divide-y divide-border/50">
            {announcements.map(a => (
              <div key={a.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text truncate">{a.title}</span>
                    {a.is_pinned    && <span className="text-[10px] bg-teal/10 text-teal px-1.5 py-0.5 rounded-full font-bold">مثبّت</span>}
                    {a.is_emergency && <span className="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded-full font-bold">عاجل</span>}
                  </div>
                  <p className="text-xs text-muted mt-0.5 line-clamp-2">{a.body}</p>
                  <p className="text-[11px] text-muted/60 mt-1">
                    {new Date(a.created_at).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <button onClick={() => handleDelete(a.id)} className="text-xs text-red-400 hover:text-red-600 shrink-0 mt-1 transition">حذف</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Exchange Rates Tab ─────────────────────────────────────────────────────

function ExchangeRatesTab() {
  const [rates, setRates]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [editPair, setEditPair] = useState(null); // { from_cur, to_cur, rate }
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRates(await fetchLatestRates()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getRateForPair = (fc, tc) =>
    rates.find(r => r.from_cur === fc && r.to_cur === tc);

  const openEdit = (fc, tc) => {
    const existing = getRateForPair(fc, tc);
    setEditPair({ from_cur: fc, to_cur: tc, rate: existing?.rate ?? '' });
    setSaveMsg('');
  };

  const handleSave = async () => {
    if (!editPair.rate || isNaN(Number(editPair.rate))) return;
    setSaving(true);
    try {
      await insertRate({ ...editPair });
      await load();
      setSaveMsg('✅ تم الحفظ');
      setTimeout(() => { setSaveMsg(''); setEditPair(null); }, 1200);
    } catch (e) {
      setSaveMsg('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Currency converter
  const [cvtAmount, setCvtAmount]   = useState('');
  const [cvtFrom, setCvtFrom]       = useState('USD');
  const [cvtTo, setCvtTo]           = useState('TRY');
  const cvtRate = cvtFrom === cvtTo ? 1 : getRateForPair(cvtFrom, cvtTo)?.rate;
  const cvtResult = cvtAmount && cvtRate ? (Number(cvtAmount) * Number(cvtRate)).toFixed(2) : null;

  if (loading) return <div className="text-center py-16 text-muted text-sm">جار التحميل…</div>;
  if (error)   return (
    <div className="text-center py-8">
      <p className="text-red-fg text-sm mb-2">{error}</p>
      <button onClick={load} className="text-teal text-sm underline">إعادة المحاولة</button>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Rates grid */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="font-semibold text-text text-sm">أسعار الصرف الحالية</h2>
          <p className="text-xs text-muted">انقر على سعر لتعديله</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream text-xs text-muted">
                <th className="py-2 px-4 text-right">من</th>
                <th className="py-2 px-4 text-right">إلى</th>
                <th className="py-2 px-4 text-center">السعر</th>
                <th className="py-2 px-4 text-center">آخر تحديث</th>
                <th className="py-2 px-4 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {PAIRS.map(([fc, tc]) => {
                const r = getRateForPair(fc, tc);
                return (
                  <tr key={`${fc}-${tc}`} className="border-t border-border hover:bg-cream/50 transition">
                    <td className="py-3 px-4 font-semibold text-text">{fc}</td>
                    <td className="py-3 px-4 text-muted">→ {tc}</td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-teal">
                      {r ? Number(r.rate).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 6 }) : '—'}
                    </td>
                    <td className="py-3 px-4 text-center text-xs text-muted">
                      {r ? new Date(r.created_at).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory') : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => openEdit(fc, tc)}
                        className="px-3 py-1 rounded-lg bg-teal/10 text-teal text-xs font-medium hover:bg-teal/20 transition"
                      >
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

      {/* Currency converter */}
      <div className="bg-surface border border-border rounded-2xl p-5">
        <h2 className="font-semibold text-text text-sm mb-3">🔄 محول العملات</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted mb-1 block">المبلغ</label>
            <input
              type="number"
              value={cvtAmount}
              onChange={e => setCvtAmount(e.target.value)}
              placeholder="0.00"
              className="border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text w-32"
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">من</label>
            <select value={cvtFrom} onChange={e => setCvtFrom(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text"
            >
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">إلى</label>
            <select value={cvtTo} onChange={e => setCvtTo(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text"
            >
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          {cvtResult !== null && (
            <div className="bg-teal/10 rounded-xl px-4 py-2 text-sm font-bold text-teal">
              = {Number(cvtResult).toLocaleString('ar-SA-u-nu-latn')} {cvtTo}
            </div>
          )}
          {cvtAmount && !cvtRate && cvtFrom !== cvtTo && (
            <div className="text-xs text-red-fg">سعر الصرف غير متوفر</div>
          )}
        </div>
      </div>

      {/* Edit Rate Modal */}
      {editPair && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditPair(null)}>
          <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-text mb-4">تعديل سعر الصرف</h3>
            <p className="text-sm text-muted mb-3">1 {editPair.from_cur} = ؟ {editPair.to_cur}</p>
            <input
              type="number"
              step="any"
              value={editPair.rate}
              onChange={e => setEditPair(p => ({ ...p, rate: e.target.value }))}
              placeholder="أدخل السعر"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text mb-4"
              autoFocus
            />
            {saveMsg && (
              <div className="text-sm mb-3 text-center">{saveMsg}</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 rounded-xl bg-teal text-navy text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition"
              >
                {saving ? 'جار الحفظ…' : 'حفظ'}
              </button>
              <button
                onClick={() => setEditPair(null)}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-text hover:bg-cream transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Salary Settings Tab ────────────────────────────────────────────────────

const EMPTY_SAL = {
  employee_id:          '',
  base_salary:          '',
  currency:             'TRY',
  internet_allowance:   '',
  food_allowance:       '',
  monthly_target:       '',
  target_commission:    '',
  sales_commission_pct: '',
  notes:                '',
};

function SalarySettingsTab() {
  const [settings, setSettings]   = useState([]);
  const [profiles, setProfiles]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [editRow, setEditRow]     = useState(null);
  const [form, setForm]           = useState(EMPTY_SAL);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, p] = await Promise.all([fetchSalarySettings(), fetchProfiles()]);
      setSettings(s);
      setProfiles(p);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (row) => {
    setEditRow(row);
    setForm({
      employee_id:          row.employee_id,
      base_salary:          row.base_salary ?? '',
      currency:             row.currency ?? 'TRY',
      internet_allowance:   row.internet_allowance ?? '',
      food_allowance:       row.food_allowance ?? '',
      monthly_target:       row.monthly_target ?? '',
      target_commission:    row.target_commission ?? '',
      sales_commission_pct: row.sales_commission_pct ?? '',
      notes:                row.notes ?? '',
    });
    setSaveError(null);
  };

  const openNew = () => {
    setEditRow({ _new: true });
    setForm({ ...EMPTY_SAL });
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!form.employee_id) { setSaveError('اختر موظفاً'); return; }
    setSaving(true); setSaveError(null);
    try {
      const payload = {
        employee_id:          form.employee_id,
        base_salary:          Number(form.base_salary) || 0,
        currency:             form.currency,
        internet_allowance:   Number(form.internet_allowance) || 0,
        food_allowance:       Number(form.food_allowance) || 0,
        monthly_target:       Number(form.monthly_target) || 0,
        target_commission:    Number(form.target_commission) || 0,
        sales_commission_pct: Number(form.sales_commission_pct) || 0,
        notes:                form.notes || null,
        effective_from:       new Date().toISOString().slice(0, 10),
      };
      await upsertSalarySetting(payload);
      await load();
      setEditRow(null);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Employees without salary settings
  const settingIds = new Set(settings.map(s => s.employee_id));
  const unsettled = profiles.filter(p => !settingIds.has(p.id));

  if (loading) return <div className="text-center py-16 text-muted text-sm">جار التحميل…</div>;
  if (error)   return (
    <div className="text-center py-8">
      <p className="text-red-fg text-sm mb-2">{error}</p>
      <button onClick={load} className="text-teal text-sm underline">إعادة المحاولة</button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{settings.length} موظف لديه إعدادات راتب</p>
        <button
          onClick={openNew}
          className="px-4 py-2 rounded-xl bg-teal text-navy text-sm font-semibold hover:bg-teal/90 transition"
        >
          + إضافة
        </button>
      </div>

      {unsettled.length > 0 && (
        <div className="bg-amber-bg border border-amber/20 rounded-xl px-4 py-3 text-xs text-amber-fg">
          {unsettled.length} موظف بدون إعدادات راتب: {unsettled.map(p => p.employee_name).join('، ')}
        </div>
      )}

      {settings.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-2">💸</div>
          <p className="text-muted text-sm">لا توجد إعدادات رواتب بعد</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream text-xs text-muted">
                  <th className="py-2 px-4 text-right">الموظف</th>
                  <th className="py-2 px-4 text-center">الراتب الأساسي</th>
                  <th className="py-2 px-4 text-center">العملة</th>
                  <th className="py-2 px-4 text-center">بدل إنترنت</th>
                  <th className="py-2 px-4 text-center">بدل طعام</th>
                  <th className="py-2 px-4 text-center">نسبة مبيعات %</th>
                  <th className="py-2 px-4 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {settings.map(s => (
                  <tr key={s.id} className="border-t border-border hover:bg-cream/50 transition">
                    <td className="py-3 px-4 font-medium text-text">{s.employee_name}</td>
                    <td className="py-3 px-4 text-center font-mono">{Number(s.base_salary).toLocaleString()}</td>
                    <td className="py-3 px-4 text-center text-muted">{s.currency}</td>
                    <td className="py-3 px-4 text-center">{Number(s.internet_allowance).toLocaleString()}</td>
                    <td className="py-3 px-4 text-center">{Number(s.food_allowance).toLocaleString()}</td>
                    <td className="py-3 px-4 text-center">{s.sales_commission_pct}%</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => openEdit(s)}
                        className="px-3 py-1 rounded-lg bg-teal/10 text-teal text-xs font-medium hover:bg-teal/20 transition"
                      >
                        تعديل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit/Add Modal */}
      {editRow && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditRow(null)}>
          <div className="bg-surface rounded-2xl p-6 w-full max-w-lg shadow-xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-text mb-4">
              {editRow._new ? 'إضافة إعدادات راتب' : `تعديل — ${editRow.employee_name}`}
            </h3>

            <div className="space-y-3">
              {editRow._new && (
                <div>
                  <label className="text-xs text-muted mb-1 block">الموظف</label>
                  <select
                    value={form.employee_id}
                    onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text"
                  >
                    <option value="">اختر موظفاً…</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.employee_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'base_salary',          label: 'الراتب الأساسي' },
                  { key: 'internet_allowance',   label: 'بدل إنترنت' },
                  { key: 'food_allowance',       label: 'بدل طعام' },
                  { key: 'monthly_target',       label: 'الهدف الشهري' },
                  { key: 'target_commission',    label: 'عمولة الهدف' },
                  { key: 'sales_commission_pct', label: 'نسبة المبيعات %' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-xs text-muted mb-1 block">{label}</label>
                    <input
                      type="number"
                      step="any"
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="text-xs text-muted mb-1 block">العملة</label>
                <select
                  value={form.currency}
                  onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text"
                >
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted mb-1 block">ملاحظات</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text"
                  placeholder="اختياري"
                />
              </div>
            </div>

            {saveError && (
              <div className="mt-3 text-xs text-red-fg bg-red-bg border border-red/20 rounded-lg px-3 py-2">{saveError}</div>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 rounded-xl bg-teal text-navy text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition"
              >
                {saving ? 'جار الحفظ…' : 'حفظ'}
              </button>
              <button
                onClick={() => setEditRow(null)}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-text hover:bg-cream transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
