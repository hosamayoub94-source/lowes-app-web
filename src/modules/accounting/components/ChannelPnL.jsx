// =============================================================
// ChannelPnL — الربح/الخسارة لكل قناة (مصدر/جهة) لفترة.
//   وارد/صادر/صافي بكل عملة + صافي موحّد بالدولار (تقريبي) — يجيب على
//   «من أي مصدر وصلني، لأي جهة دفعت، ووين أربح ووين أخسر».
//   فلترة بالنوع/المسكّرة + فرز. يستثني التحويلات الداخلية.
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import { computeChannelPnL } from './channelPnL.logic.js';
import { CCY, blank } from './sourceBreakdown.logic.js';
import { fetchExchangeRates } from '../services/accountingService.js';
import { upsertExchangeRate } from '../../payroll/services/payrollService.js';

// العملات القابلة للتحديث (مقابل الدولار) — التي تُستخدم في عمود «≈ بالدولار».
const RATE_CCY = [
  { to: 'TRY', label: 'الليرة التركية', sym: '₺' },
  { to: 'SYP', label: 'الليرة السورية', sym: 'ل.س' },
];

const KIND_LABEL = {
  shipping: '🚚 شحن', distributor: '🤝 موزّع', marketer: '📣 مسوّق', online: '🛒 أونلاين',
  supplier: '🏭 مورّد', recurring: '🔁 متكرر', expense: '💸 مصروف', other: '📌 أخرى',
};

function fmt(n, c) {
  if (!n) return null;
  return `${c.sym}${Number(n).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: c.maxFrac })}`;
}
function MoneyCell({ amounts, tone }) {
  const lines = CCY.map(c => ({ c, txt: fmt(amounts[c.key], c) })).filter(x => x.txt);
  if (!lines.length) return <span className="text-muted">—</span>;
  return <div className="space-y-0.5">{lines.map(({ c, txt }) => <div key={c.key} className={`font-mono text-xs font-semibold ${tone}`}>{txt}</div>)}</div>;
}
function NetCell({ net }) {
  const lines = CCY.map(c => {
    const v = net[c.key] || 0;
    if (!v) return null;
    const tone = v >= 0 ? 'text-green-600' : 'text-red-500';
    return { key: c.key, tone, txt: `${v >= 0 ? '+' : '−'}${c.sym}${Number(Math.abs(v)).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: c.maxFrac })}` };
  }).filter(Boolean);
  if (!lines.length) return <span className="text-muted">—</span>;
  return <div className="space-y-0.5">{lines.map(l => <div key={l.key} className={`font-mono text-xs font-bold ${l.tone}`}>{l.txt}</div>)}</div>;
}
const usdFmt = (n) => `${n >= 0 ? '+' : '−'}$${Math.abs(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export default function ChannelPnL({
  entries = [],
  channels = [],
  title = '📈 الربح/الخسارة لكل قناة',
  subtitle = 'لكل مصدر: وارد − صادر = صافي (وين نربح وين نخسر)',
}) {
  const [rateMap, setRateMap] = useState({});
  const [rateMeta, setRateMeta] = useState({}); // { TRY: { rate, date }, … } لأحدث صف مستخدَم
  const [showRates, setShowRates] = useState(false);
  const [kind, setKind] = useState('all');
  const [showClosed, setShowClosed] = useState(true);
  const [sort, setSort] = useState('usd');

  async function loadRates() {
    try {
      const rows = await fetchExchangeRates();
      const m = {};
      const meta = {};
      // الصفوف مرتّبة تنازلياً حسب التاريخ → أول ظهور لكل عملة = أحدث سعر.
      for (const r of rows || []) {
        const from = r.from_currency ?? r.from_cur;
        const to   = r.to_currency ?? r.to_cur;
        if (from === 'USD' && to && m[to] === undefined) {
          m[to] = Number(r.rate) || 0;
          meta[to] = { rate: Number(r.rate) || 0, date: r.effective_date ?? r.effectiveDate ?? null };
        }
      }
      return { m, meta };
    } catch {
      return null;
    }
  }

  useEffect(() => {
    let alive = true;
    loadRates().then(res => {
      if (!alive || !res) return;
      setRateMap(res.m);
      setRateMeta(res.meta);
    });
    return () => { alive = false; };
  }, []);

  async function refreshRates() {
    const res = await loadRates();
    if (res) { setRateMap(res.m); setRateMeta(res.meta); }
  }

  const { rows } = useMemo(
    () => computeChannelPnL(entries, { channels, rates: rateMap }),
    [entries, channels, rateMap],
  );

  const kindsPresent = useMemo(() => {
    const s = new Set();
    rows.forEach(r => { if (r.channel?.kind) s.add(r.channel.kind); });
    return Array.from(s);
  }, [rows]);

  const view = useMemo(() => {
    let list = rows;
    if (kind !== 'all') list = list.filter(r => r.channel?.kind === kind);
    if (!showClosed) list = list.filter(r => !r.channel || r.channel.is_active);
    const sorted = [...list];
    if (sort === 'usd') sorted.sort((a, b) => b.usdNet - a.usdNet);
    else if (sort === 'count') sorted.sort((a, b) => b.count - a.count);
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    return sorted;
  }, [rows, kind, showClosed, sort]);

  const viewTotals = useMemo(() => {
    const t = { in: blank(), out: blank(), usdNet: 0 };
    for (const r of view) {
      for (const c of CCY) { t.in[c.key] += r.in[c.key]; t.out[c.key] += r.out[c.key]; }
      t.usdNet += r.usdNet;
    }
    return t;
  }, [view]);

  const SEL = 'border border-border rounded-lg px-2 py-1 text-xs bg-cream text-text';

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden" dir="rtl">
      <div className="px-4 py-3 border-b border-border bg-cream/60 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-text">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={kind} onChange={e => setKind(e.target.value)} className={SEL}>
            <option value="all">كل الأنواع</option>
            {kindsPresent.map(k => <option key={k} value={k}>{KIND_LABEL[k] || k}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} className={SEL}>
            <option value="usd">الأعلى ربحاً ($)</option>
            <option value="count">الأكثر حركة</option>
            <option value="name">الاسم</option>
          </select>
          <label className="flex items-center gap-1 text-[11px] text-muted">
            <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} /> المسكّرة
          </label>
        </div>
      </div>

      {view.length === 0 ? (
        <div className="text-center py-10 text-muted text-sm">لا توجد حركة في هذه الفترة</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream text-xs text-muted">
                <th className="py-2 px-3 text-right">القناة / المصدر</th>
                <th className="py-2 px-3 text-center">⬇️ وارد</th>
                <th className="py-2 px-3 text-center">⬆️ صادر</th>
                <th className="py-2 px-3 text-center">صافي</th>
                <th className="py-2 px-3 text-center">≈ بالدولار</th>
              </tr>
            </thead>
            <tbody>
              {view.map(r => (
                <tr key={r.key} className="border-t border-border hover:bg-cream/50 transition align-top">
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-text">
                      {r.channel?.icon ? r.channel.icon + ' ' : ''}{r.name}
                      {r.channel && !r.channel.is_active && <span className="text-[10px] text-amber-600"> ⏸</span>}
                    </div>
                    <div className="text-[10px] text-muted mt-0.5">
                      {r.channel ? (KIND_LABEL[r.channel.kind] || r.channel.kind) + ' · ' : ''}{r.count} حركة
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center"><MoneyCell amounts={r.in}  tone="text-green-600" /></td>
                  <td className="py-2.5 px-3 text-center"><MoneyCell amounts={r.out} tone="text-red-500" /></td>
                  <td className="py-2.5 px-3 text-center"><NetCell net={r.net} /></td>
                  <td className={`py-2.5 px-3 text-center font-mono text-xs font-bold ${r.usdNet >= 0 ? 'text-green-600' : 'text-red-500'}`}>{usdFmt(r.usdNet)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-cream text-xs font-bold align-top">
                <td className="py-2 px-3 text-muted">الإجمالي ({view.length} قناة)</td>
                <td className="py-2 px-3 text-center"><MoneyCell amounts={viewTotals.in}  tone="text-green-600" /></td>
                <td className="py-2 px-3 text-center"><MoneyCell amounts={viewTotals.out} tone="text-red-500" /></td>
                <td className="py-2 px-3 text-center text-muted">—</td>
                <td className={`py-2 px-3 text-center font-mono ${viewTotals.usdNet >= 0 ? 'text-green-600' : 'text-red-500'}`}>{usdFmt(viewTotals.usdNet)}</td>
              </tr>
            </tfoot>
          </table>
          <div className="px-4 py-2 text-[10px] text-muted border-t border-border/40 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span>≈ بالدولار تقريبي حسب سعر الصرف المُستخدَم — الأعمدة بكل عملة هي المرجع الدقيق.</span>
              {RATE_CCY.map(rc => {
                const mt = rateMeta[rc.to];
                if (!mt || !mt.rate) return null;
                return (
                  <span key={rc.to} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cream border border-border/60 font-mono">
                    1$ = {Number(mt.rate).toLocaleString('en-US')} {rc.sym}
                    {mt.date && <span className="text-muted/70">({mt.date})</span>}
                  </span>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setShowRates(true)}
              className="px-2 py-1 rounded-lg border border-border bg-surface hover:bg-cream text-[10px] font-semibold text-text"
            >
              تحديث الأسعار
            </button>
          </div>
        </div>
      )}

      {showRates && (
        <RateModal
          rateMeta={rateMeta}
          onClose={() => setShowRates(false)}
          onSaved={refreshRates}
        />
      )}
    </div>
  );
}

// مودال بسيط لتحديث أسعار الصرف (USD→TRY / USD→SYP) عبر upsertExchangeRate.
function RateModal({ rateMeta, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(() => {
    const f = {};
    for (const rc of RATE_CCY) f[rc.to] = rateMeta[rc.to]?.rate ? String(rateMeta[rc.to].rate) : '';
    return f;
  });
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setErr('');
    setSaving(true);
    try {
      const jobs = RATE_CCY
        .filter(rc => form[rc.to] && Number(form[rc.to]) > 0)
        .map(rc => upsertExchangeRate({
          from_currency: 'USD',
          to_currency: rc.to,
          rate: Number(form[rc.to]),
          effective_date: date,
        }));
      if (!jobs.length) { setErr('أدخل سعراً واحداً على الأقل.'); setSaving(false); return; }
      await Promise.all(jobs);
      await onSaved();
      onClose();
    } catch (e) {
      setErr(e?.message || 'تعذّر الحفظ.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-text">تحديث أسعار الصرف</h4>
          <button type="button" onClick={onClose} className="text-muted hover:text-text text-lg leading-none">×</button>
        </div>
        <p className="text-[11px] text-muted">السعر = كم وحدة من العملة مقابل 1 دولار.</p>
        {RATE_CCY.map(rc => (
          <label key={rc.to} className="block">
            <span className="text-xs text-text font-semibold">{rc.label} (1$ = ؟ {rc.sym})</span>
            <input
              type="number" min="0" step="any" inputMode="decimal"
              value={form[rc.to]}
              onChange={e => setForm(f => ({ ...f, [rc.to]: e.target.value }))}
              className="mt-1 w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-cream text-text font-mono"
              placeholder={rateMeta[rc.to]?.rate ? String(rateMeta[rc.to].rate) : '0'}
            />
          </label>
        ))}
        <label className="block">
          <span className="text-xs text-text font-semibold">تاريخ السريان</span>
          <input
            type="date" value={date} onChange={e => setDate(e.target.value)}
            className="mt-1 w-full border border-border rounded-lg px-2 py-1.5 text-sm bg-cream text-text"
          />
        </label>
        {err && <div className="text-[11px] text-red-500">{err}</div>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted hover:bg-cream">إلغاء</button>
          <button type="button" onClick={save} disabled={saving} className="px-3 py-1.5 rounded-lg bg-teal text-white text-xs font-semibold disabled:opacity-60">
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  );
}
