// FxMonthlyRatesTab — S3a: إدخال أسعار الصرف الشهرية (أدمن). الكتابة عبر الدالة الوحيدة fx_set_monthly_rate؛ الربحية لها جدولها الخاص.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadFxAdminData, saveMonthlyRate } from '@services/fxRatesService';
import { FX_CURRENCIES, FX_PURPOSES, PURPOSE_LABEL, buildMonthlyGrid, currentMonthKey, legacyConsistency, missingExactForMonth, monthsBack, validateRateInput } from '@utils/fxRatesAdmin';

const STATE = {
  exact: ['bg-emerald-500/10 text-emerald-700', 'مؤكَّد'],
  approximate: ['bg-amber-500/10 text-amber-700', 'تقريبي'],
  carried: ['bg-orange-500/10 text-orange-700', 'مُرحَّل'],
  missing: ['bg-red-500/10 text-red-700', 'لا سعر'],
};

export default function FxMonthlyRatesTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [purpose, setPurpose] = useState('delivery_accounting');
  const month0 = currentMonthKey();
  const [form, setForm] = useState({ currency: 'TRY', month: month0, rate: '', quality: 'exact', note: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await loadFxAdminData();
    if (r.error && !r.rows.length) setError(r.error); else { setError(r.error || null); setData(r); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows || [];
  const months = useMemo(() => monthsBack(8, month0), [month0]);
  const grid = useMemo(() => buildMonthlyGrid(rows, purpose, months), [rows, purpose, months]);
  const missingNow = useMemo(() => ['delivery_accounting', 'payroll'].map((p) => [p, missingExactForMonth(rows, p, month0)]).filter(([, m]) => m.length), [rows, month0]);
  const drift = useMemo(() => legacyConsistency(rows, data?.legacyLatest, month0), [rows, data, month0]);
  const check = validateRateInput({ purpose, ...form });

  const save = async () => {
    if (!check.ok) { setMsg('❌ ' + check.errors[0]); return; }
    setBusy(true); setMsg('');
    try { await saveMonthlyRate({ purpose, currency: form.currency, month: form.month, rate: form.rate, quality: form.quality, note: form.note }); setMsg('✅ حُفظ السعر (والقديم محفوظ كسجل)'); setForm({ ...form, rate: '', note: '' }); await load(); }
    catch (e) { setMsg('❌ ' + e.message); } finally { setBusy(false); }
  };

  if (error && !data) return <div className="text-center py-8"><p className="text-red-600 text-sm mb-2">{error}</p><button onClick={load} className="text-teal text-sm underline">إعادة المحاولة</button></div>;
  if (!data) return <div className="text-center py-16 text-muted text-sm">جار التحميل…</div>;

  return (
    <div className="space-y-4" dir="rtl">
      {missingNow.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-3 text-xs space-y-1">
          <p className="font-black text-red-700">⏰ لا سعر مؤكَّد لشهر {month0.slice(0, 7)}:</p>
          {missingNow.map(([p, m]) => <p key={p}>{PURPOSE_LABEL[p]}: {m.join('، ')}</p>)}
          <p className="text-muted">حتى يُدخَل تظهر أرقام الشهر «مُرحَّلة/تقديرية». أدخلها أول الشهر.</p>
        </div>
      )}
      {drift.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <p className="font-black text-amber-700">⚠️ تعارض مع جدول الأسعار القديم (تقرؤه الرواتب/الصندوق):</p>
          {drift.map((d) => <p key={d.currency}>{d.currency}: الشهري {d.monthly} ≠ القديم {d.legacy} — أُدخل السعر من التبويب القديم دون المرآة؟ أعد إدخاله هنا.</p>)}
        </div>
      )}

      <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {FX_PURPOSES.map(([k, l]) => <button key={k} onClick={() => { setPurpose(k); setMsg(''); }} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${purpose === k ? 'bg-teal text-navy' : 'bg-surface-alt text-muted'}`}>{l}</button>)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead><tr className="text-muted"><th className="p-1">الشهر</th>{FX_CURRENCIES.map((c) => <th key={c}>{c} لكل 1$</th>)}</tr></thead>
            <tbody>{grid.map((g) => (
              <tr key={g.month} className="border-t border-border">
                <td className="p-1 font-bold">{g.month.slice(0, 7)}</td>
                {FX_CURRENCIES.map((c) => { const cell = g.cells[c]; const [cls, label] = STATE[cell.state]; return (
                  <td key={c} className="p-1"><span className={`inline-block rounded-lg px-2 py-0.5 ${cls}`}>{cell.rate ?? '—'} · {label}{cell.from ? ` من ${cell.from.slice(0, 7)}` : ''}</span></td>
                ); })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted">الربحية لها جدولها الخاص (شاشة الربحية). التقريبي لا يُرحَّل لشهر آخر. الإدخال للأدمن فقط وكل تغيير يُحفظ كسجل.</p>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-4 space-y-2">
        <p className="text-sm font-black">إدخال سعر شهري — {PURPOSE_LABEL[purpose]}</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="border border-border rounded-xl px-2 py-2 bg-surface-alt">{FX_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
          <input type="month" value={form.month.slice(0, 7)} onChange={(e) => setForm({ ...form, month: `${e.target.value}-01` })} className="border border-border rounded-xl px-2 py-2 bg-surface-alt" />
          <input type="number" min="0" step="0.0001" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder={`${form.currency} لكل 1$`} className="border border-border rounded-xl px-2 py-2 bg-surface-alt" />
          <select value={form.quality} onChange={(e) => setForm({ ...form, quality: e.target.value })} className="border border-border rounded-xl px-2 py-2 bg-surface-alt"><option value="exact">مؤكَّد</option><option value="approximate">تقريبي</option></select>
          <button onClick={save} disabled={busy || !check.ok} className="rounded-xl bg-teal text-navy font-bold py-2 disabled:opacity-40">{busy ? '…' : 'حفظ'}</button>
        </div>
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="ملاحظة/مرجع السعر" className="w-full border border-border rounded-xl px-2 py-2 text-xs bg-surface-alt" />
        {form.rate !== '' && !check.ok && <p className="text-xs text-red-600">{check.errors[0]}</p>}
        {check.ok && check.warnings.map((w) => <p key={w} className="text-xs text-amber-700">⚠️ {w}</p>)}
        {msg && <p className="text-xs">{msg}</p>}
        <p className="text-[11px] text-muted">الشهر الحالي لمحاسبة التسليمات (مؤكَّد) يُنسخ تلقائياً إلى جدول الأسعار القديم ضمن العملية نفسها لتبقى الرواتب والصندوق متسقَين.</p>
      </div>

      <details className="bg-surface border border-border rounded-2xl p-4 text-xs">
        <summary className="font-black cursor-pointer">سجل التغييرات ({rows.filter((r) => r.purpose === purpose).length})</summary>
        <table className="w-full text-right mt-2">
          <thead><tr className="text-muted"><th>الشهر</th><th>العملة</th><th>السعر</th><th>الحالة</th><th>الجودة</th><th>المصدر</th></tr></thead>
          <tbody>{rows.filter((r) => r.purpose === purpose).slice(0, 80).map((r, i) => (
            <tr key={r.id || i} className="border-t border-border"><td>{String(r.period_month).slice(0, 7)}</td><td>{r.currency}</td><td>{r.units_per_usd}</td><td>{r.status === 'confirmed' ? 'ساري' : 'مستبدَل'}</td><td>{r.rate_quality === 'approximate' ? 'تقريبي' : 'مؤكَّد'}</td><td className="text-muted">{String(r.source).split(':')[0]}</td></tr>
          ))}</tbody>
        </table>
      </details>
    </div>
  );
}
