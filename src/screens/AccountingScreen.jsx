// =============================================================
// AccountingScreen — multi-currency ledger (wired to real data)
// =============================================================
import { useState, useMemo } from 'react';
import { useAuth } from '@hooks/useAuth';
import {
  useAccountingBootstrap,
  useAccountingDashboard,
  useAccountingActions,
  useAccountingLoading,
  useCategories,
} from '@modules/accounting/hooks/useAccounting.js';
import {
  ENTRY_TYPE,
  ENTRY_TYPE_LABELS,
  ENTRY_TYPE_ICONS,
  PAYMENT_METHOD,
  PAYMENT_METHOD_LABELS,
  WALLETS,
  TRANSFER_IN,
  TRANSFER_OUT,
  entryColorClass,
} from '@modules/accounting/types/accounting.types.js';
import TreasuryPanel from '@modules/accounting/components/TreasuryPanel';
import { printPaymentVoucher, computeNextVoucherNo } from '@modules/accounting/utils/paymentVoucher';

const TABS = [
  { key: 'all',     label: 'الكل' },
  { key: 'income',  label: 'دخل' },
  { key: 'expense', label: 'مصروف' },
  { key: 'advance', label: 'سلف' },
  { key: 'salary',  label: 'رواتب' },
];

const EMPTY_FORM = {
  entry_type:     ENTRY_TYPE.EXPENSE,
  category:       '',
  description:    '',
  amount_usd:     '',
  amount_try:     '',
  amount_syp:     '',
  payment_method: PAYMENT_METHOD.CASH,
  entry_date:     new Date().toISOString().slice(0, 10),
  reference_no:   '',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtUSD(n) { return n ? `$${Number(n).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 2 })}` : '—'; }
function fmtTRY(n) { return n ? `₺${Number(n).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 2 })}` : '—'; }
function fmtSYP(n) { return n ? `£${Number(n).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 0 })}` : '—'; }

function currentMonth() { return new Date().toISOString().slice(0, 7); }

// ── Excel Export ───────────────────────────────────────────────────────────

async function exportToExcel(entries, monthLabel) {
  const XLSX = await import('xlsx');
  const rows = entries.map(e => ({
    'النوع':        ENTRY_TYPE_LABELS[e.entry_type] ?? e.entry_type,
    'الفئة':        e.category ?? '',
    'الوصف':        e.description,
    'رقم المرجع':   e.reference_no ?? '',
    'المبلغ USD':   Number(e.amount_usd) || 0,
    'المبلغ TRY':   Number(e.amount_try) || 0,
    'المبلغ SYP':   Number(e.amount_syp) || 0,
    'طريقة الدفع':  PAYMENT_METHOD_LABELS[e.payment_method] ?? e.payment_method ?? '',
    'التاريخ':      e.entry_date ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'القيود');
  XLSX.writeFile(wb, `accounting-${monthLabel || 'all'}.xlsx`);
}

// ── CurrencyKPI ────────────────────────────────────────────────────────────

function CurrencyBlock({ currency, symbol, income, expense, net }) {
  const netTone = net >= 0 ? 'text-green-600' : 'text-red-500';
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-2">
      <div className="text-xs font-bold text-muted uppercase tracking-wider">{currency}</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-sm font-bold text-green-600">{symbol}{Number(income).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 0 })}</div>
          <div className="text-[10px] text-muted mt-0.5">دخل</div>
        </div>
        <div>
          <div className="text-sm font-bold text-red-500">{symbol}{Number(expense).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 0 })}</div>
          <div className="text-[10px] text-muted mt-0.5">مصروف</div>
        </div>
        <div>
          <div className={`text-sm font-bold ${netTone}`}>{net >= 0 ? '+' : ''}{symbol}{Math.abs(net).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 0 })}</div>
          <div className="text-[10px] text-muted mt-0.5">صافي</div>
        </div>
      </div>
    </div>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────

export default function AccountingScreen() {
  const { id, role } = useAuth();
  useAccountingBootstrap(id);

  const { entries, isLoading } = useAccountingDashboard();
  const { createEntry, deleteEntry }  = useAccountingActions();
  const loading    = useAccountingLoading();
  const categories = useCategories();

  const isAdmin = role === 'admin' || role === 'manager';

  const [tab, setTab]               = useState('all');
  const [monthFilter, setMonthFilter] = useState(currentMonth());
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saveError, setSaveError]   = useState(null);
  const [exporting, setExporting]   = useState(false);

  // ── Transfer between wallets ───────────────────────────────────────────────
  const [showTransfer, setShowTransfer] = useState(false);
  const [tForm, setTForm] = useState({ from: 'cash_usd', to: 'bank_usd', amount_from: '', amount_to: '', date: new Date().toISOString().slice(0, 10), note: '' });
  const [tError, setTError] = useState(null);

  const walletAmounts = (walletId, val) => {
    const w = WALLETS.find(x => x.id === walletId);
    return {
      amount_usd: w?.amtField === 'amount_usd' ? val : 0,
      amount_try: w?.amtField === 'amount_try' ? val : 0,
      amount_syp: w?.amtField === 'amount_syp' ? val : 0,
    };
  };

  // ── Official receipt/payment voucher (سند قبض/صرف) ──────────────────────────
  const [showVoucher, setShowVoucher] = useState(false);
  const [vForm, setVForm] = useState({ kind: 'receipt', payee: '', purpose: '', wallet: 'cash_usd', amount: '', date: new Date().toISOString().slice(0, 10) });
  const [vError, setVError] = useState(null);

  const handleVoucher = async (andPrint) => {
    const w = WALLETS.find(x => x.id === vForm.wallet);
    const amt = Number(vForm.amount) || 0;
    if (!vForm.payee.trim()) { setVError('اسم المستفيد/الدافع مطلوب'); return; }
    if (amt <= 0) { setVError('أدخل مبلغاً صحيحاً'); return; }
    setVError(null);
    const voucherNo = computeNextVoucherNo(entries);
    const isReceipt = vForm.kind === 'receipt';
    const payload = {
      entry_type:  isReceipt ? ENTRY_TYPE.INCOME : ENTRY_TYPE.EXPENSE,
      category:    isReceipt ? 'سند قبض' : 'سند صرف',
      description: vForm.purpose.trim() || (isReceipt ? 'سند قبض' : 'سند صرف'),
      ...walletAmounts(vForm.wallet, amt),
      payment_method: vForm.wallet,
      entry_date:  vForm.date,
      reference_no: voucherNo,
      notes: `${isReceipt ? 'الدافع' : 'المستفيد'}: ${vForm.payee.trim()}`,
    };
    try {
      await createEntry(payload);
      if (andPrint) {
        printPaymentVoucher(
          { ...payload, entry_date: vForm.date },
          { payeeName: vForm.payee.trim(), voucherNo, authorizedBy: 'hosam ayoub' },
        );
      }
      setShowVoucher(false);
      setVForm(f => ({ ...f, payee: '', purpose: '', amount: '' }));
    } catch (e) { setVError(e.message); }
  };

  const handleTransfer = async () => {
    const from = WALLETS.find(w => w.id === tForm.from);
    const to   = WALLETS.find(w => w.id === tForm.to);
    if (!from || !to || from.id === to.id) { setTError('اختر محفظتين مختلفتين'); return; }
    const amtFrom = Number(tForm.amount_from) || 0;
    const sameCur = from.currency === to.currency;
    const amtTo   = sameCur ? amtFrom : (Number(tForm.amount_to) || 0);
    if (amtFrom <= 0 || amtTo <= 0) { setTError('أدخل مبلغاً صحيحاً'); return; }
    setTError(null);
    const ref = `TRF-${Date.now()}`;
    try {
      // Outflow from source wallet
      await createEntry({
        entry_type: ENTRY_TYPE.TRANSFER, category: TRANSFER_OUT,
        description: `تحويل إلى ${to.label}${tForm.note ? ' — ' + tForm.note : ''}`,
        ...walletAmounts(from.id, amtFrom),
        payment_method: from.id, entry_date: tForm.date, reference_no: ref,
      });
      // Inflow to destination wallet
      await createEntry({
        entry_type: ENTRY_TYPE.TRANSFER, category: TRANSFER_IN,
        description: `تحويل من ${from.label}${tForm.note ? ' — ' + tForm.note : ''}`,
        ...walletAmounts(to.id, amtTo),
        payment_method: to.id, entry_date: tForm.date, reference_no: ref,
      });
      setShowTransfer(false);
      setTForm(t => ({ ...t, amount_from: '', amount_to: '', note: '' }));
    } catch (e) { setTError(e.message); }
  };

  // ── Month filtering ────────────────────────────────────────────────────────
  const monthEntries = useMemo(() =>
    monthFilter
      ? entries.filter(e => (e.entry_date ?? '').startsWith(monthFilter))
      : entries,
  [entries, monthFilter]);

  const filtered = tab === 'all'
    ? monthEntries
    : monthEntries.filter(e => e.entry_type === tab);

  // ── Per-currency KPIs ─────────────────────────────────────────────────────
  const currencyKpis = useMemo(() => {
    const calc = (amtKey) => {
      let income = 0, expense = 0;
      for (const e of monthEntries) {
        if (e.entry_type === ENTRY_TYPE.TRANSFER) continue; // internal move — not income/expense
        const amt = Number(e[amtKey]) || 0;
        if (!amt) continue;
        if (e.entry_type === ENTRY_TYPE.INCOME) income += amt;
        else expense += amt;
      }
      return { income, expense, net: income - expense };
    };
    return {
      USD: calc('amount_usd'),
      TRY: calc('amount_try'),
      SYP: calc('amount_syp'),
    };
  }, [monthEntries]);

  // ── Category options ───────────────────────────────────────────────────────
  const catOptions = categories.filter(c =>
    !form.entry_type || c.entry_type === form.entry_type
  );

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.description.trim()) { setSaveError('الوصف مطلوب'); return; }
    const amt = Number(form.amount_usd) || Number(form.amount_try) || Number(form.amount_syp);
    if (!amt) { setSaveError('أدخل مبلغاً واحداً على الأقل'); return; }
    setSaveError(null);
    try {
      await createEntry({
        entry_type:     form.entry_type,
        category:       form.category || null,
        description:    form.description.trim(),
        amount_usd:     Number(form.amount_usd) || 0,
        amount_try:     Number(form.amount_try) || 0,
        amount_syp:     Number(form.amount_syp) || 0,
        payment_method: form.payment_method,
        entry_date:     form.entry_date,
        reference_no:   form.reference_no.trim() || null,
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (e) {
      setSaveError(e.message);
    }
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm('هل تريد حذف هذا القيد؟')) return;
    await deleteEntry(entryId);
  };

  const handleExport = async () => {
    setExporting(true);
    try { await exportToExcel(filtered, monthFilter); }
    finally { setExporting(false); }
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text">📒 المحاسبة</h1>
          <p className="text-sm text-muted mt-0.5">الإيرادات والمصاريف والصندوق</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Month filter */}
          <input
            type="month"
            value={monthFilter}
            onChange={e => setMonthFilter(e.target.value)}
            className="border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text"
          />
          {/* Export */}
          <button
            onClick={handleExport}
            disabled={exporting || filtered.length === 0}
            className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-text hover:bg-cream transition disabled:opacity-40"
          >
            {exporting ? 'جار التصدير…' : '⬇️ Excel'}
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => { setShowVoucher(true); setVError(null); }}
                className="px-4 py-2 rounded-xl border border-teal/40 text-teal text-sm font-semibold hover:bg-teal/5 transition whitespace-nowrap"
              >
                🧾 سند قبض/صرف
              </button>
              <button
                onClick={() => { setShowTransfer(true); setTError(null); }}
                className="px-4 py-2 rounded-xl border border-teal/40 text-teal text-sm font-semibold hover:bg-teal/5 transition whitespace-nowrap"
              >
                🔄 تحويل
              </button>
              <button
                onClick={() => { setShowForm(true); setForm(EMPTY_FORM); setSaveError(null); }}
                className="px-4 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition whitespace-nowrap"
              >
                + قيد جديد
              </button>
            </>
          )}
        </div>
      </div>

      {/* Treasury Panel */}
      <TreasuryPanel entries={entries} />

      {/* Per-currency KPI blocks */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CurrencyBlock currency="USD" symbol="$"  {...currencyKpis.USD} />
        <CurrencyBlock currency="TRY" symbol="₺"  {...currencyKpis.TRY} />
        <CurrencyBlock currency="SYP" symbol="£"  {...currencyKpis.SYP} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              'px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition',
              tab === t.key
                ? 'bg-teal text-white'
                : 'bg-surface border border-border text-muted hover:border-teal/40',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Entries table */}
      {isLoading ? (
        <div className="text-center py-16 text-muted text-sm">جار التحميل…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-muted text-sm">لا توجد قيود في هذه الفترة</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream text-xs text-muted">
                  <th className="py-2 px-3 text-right">النوع</th>
                  <th className="py-2 px-3 text-right">الوصف</th>
                  <th className="py-2 px-3 text-center">رقم المرجع</th>
                  <th className="py-2 px-3 text-center">USD</th>
                  <th className="py-2 px-3 text-center">TRY</th>
                  <th className="py-2 px-3 text-center">SYP</th>
                  <th className="py-2 px-3 text-center">التاريخ</th>
                  <th className="py-2 px-3 text-center">الدفع</th>
                  <th className="py-2 px-3 text-center">وصل</th>
                  {isAdmin && <th className="py-2 px-3 text-center">حذف</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} className="border-t border-border hover:bg-cream/50 transition">
                    <td className="py-3 px-3">
                      <span className={`text-xs font-semibold ${entryColorClass(e.entry_type)}`}>
                        {ENTRY_TYPE_ICONS[e.entry_type]} {ENTRY_TYPE_LABELS[e.entry_type] ?? e.entry_type}
                      </span>
                      {e.category && <div className="text-xs text-muted mt-0.5">{e.category}</div>}
                    </td>
                    <td className="py-3 px-3 max-w-xs">
                      <p className="text-text text-sm leading-tight">{e.description}</p>
                    </td>
                    <td className="py-3 px-3 text-center text-xs text-muted font-mono">
                      {e.reference_no ?? '—'}
                    </td>
                    <td className={`py-3 px-3 text-center font-mono font-semibold text-xs ${e.amount_usd ? entryColorClass(e.entry_type) : 'text-muted'}`}>
                      {fmtUSD(e.amount_usd)}
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-muted text-xs">
                      {fmtTRY(e.amount_try)}
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-muted text-xs">
                      {fmtSYP(e.amount_syp)}
                    </td>
                    <td className="py-3 px-3 text-center text-xs text-muted">
                      {e.entry_date ? new Date(e.entry_date).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory') : '—'}
                    </td>
                    <td className="py-3 px-3 text-center text-xs text-muted">
                      {PAYMENT_METHOD_LABELS[e.payment_method] ?? e.payment_method ?? '—'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => printPaymentVoucher(e, { authorizedBy: 'hosam ayoub' })}
                        className="text-teal hover:opacity-70 text-base transition"
                        title="طباعة وصل دفع رسمي"
                      >🧾</button>
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handleDelete(e.id)}
                          disabled={loading.action}
                          className="text-red-fg hover:opacity-70 text-xs transition"
                        >
                          حذف
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="border-t-2 border-border bg-cream text-xs font-bold text-muted">
                  <td className="py-2 px-3" colSpan={3}>المجموع ({filtered.length} قيد)</td>
                  <td className="py-2 px-3 text-center text-text">
                    {fmtUSD(filtered.reduce((s, e) => s + (Number(e.amount_usd) || 0), 0))}
                  </td>
                  <td className="py-2 px-3 text-center text-text">
                    {fmtTRY(filtered.reduce((s, e) => s + (Number(e.amount_try) || 0), 0))}
                  </td>
                  <td className="py-2 px-3 text-center text-text">
                    {fmtSYP(filtered.reduce((s, e) => s + (Number(e.amount_syp) || 0), 0))}
                  </td>
                  <td colSpan={isAdmin ? 3 : 2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* New Entry Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-surface rounded-2xl p-6 w-full max-w-lg shadow-xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-text mb-4">قيد جديد</h3>

            <div className="space-y-3">
              {/* Type */}
              <div>
                <label className="text-xs text-muted mb-1 block">النوع</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ENTRY_TYPE_LABELS).map(([k, v]) => (
                    <button
                      key={k}
                      onClick={() => setForm(f => ({ ...f, entry_type: k, category: '' }))}
                      className={[
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition border',
                        form.entry_type === k
                          ? 'bg-teal text-white border-teal'
                          : 'border-border text-muted hover:border-teal/40',
                      ].join(' ')}
                    >
                      {ENTRY_TYPE_ICONS[k]} {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              {catOptions.length > 0 && (
                <div>
                  <label className="text-xs text-muted mb-1 block">الفئة</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text"
                  >
                    <option value="">— اختر فئة —</option>
                    {catOptions.map(c => (
                      <option key={c.id} value={c.name_ar ?? c.name}>{c.name_ar ?? c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="text-xs text-muted mb-1 block">الوصف *</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="وصف القيد…"
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text"
                />
              </div>

              {/* Reference No */}
              <div>
                <label className="text-xs text-muted mb-1 block">رقم الفاتورة / المرجع</label>
                <input
                  type="text"
                  value={form.reference_no}
                  onChange={e => setForm(f => ({ ...f, reference_no: e.target.value }))}
                  placeholder="INV-001 أو اتركه فارغاً"
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text"
                />
              </div>

              {/* Amounts */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'amount_usd', label: 'المبلغ (USD)' },
                  { key: 'amount_try', label: 'المبلغ (TRY)' },
                  { key: 'amount_syp', label: 'المبلغ (SYP)' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-xs text-muted mb-1 block">{label}</label>
                    <input
                      type="number"
                      step="any"
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>

              {/* Payment method + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted mb-1 block">طريقة الدفع</label>
                  <select
                    value={form.payment_method}
                    onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text"
                  >
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">التاريخ</label>
                  <input
                    type="date"
                    value={form.entry_date}
                    onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text"
                  />
                </div>
              </div>
            </div>

            {saveError && (
              <div className="mt-3 text-xs text-red-fg bg-red-bg rounded-lg px-3 py-2 border border-red/20">{saveError}</div>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={handleSubmit}
                disabled={loading.action}
                className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition"
              >
                {loading.action ? 'جار الحفظ…' : 'إضافة'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-text hover:bg-cream transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Voucher Modal (سند قبض / صرف) */}
      {showVoucher && (() => {
        const w = WALLETS.find(x => x.id === vForm.wallet);
        const isReceipt = vForm.kind === 'receipt';
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowVoucher(false)}>
            <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()} dir="rtl">
              <h3 className="font-bold text-lg text-text mb-1">🧾 سند {isReceipt ? 'قبض' : 'صرف'} رسمي</h3>
              <p className="text-xs text-muted mb-4">يُنشئ القيد المالي + رقم سند رسمي ({computeNextVoucherNo(entries)}) قابل للطباعة.</p>
              <div className="space-y-3">
                {/* Kind toggle */}
                <div className="grid grid-cols-2 gap-2">
                  {[['receipt', '📥 سند قبض (لنا)'], ['payment', '🧾 سند صرف (علينا)']].map(([k, lbl]) => (
                    <button key={k} onClick={() => setVForm(f => ({ ...f, kind: k }))}
                      className={['py-2 rounded-xl text-xs font-bold border transition', vForm.kind === k ? 'bg-teal text-white border-teal' : 'border-border text-muted hover:border-teal/40'].join(' ')}>
                      {lbl}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">{isReceipt ? 'الدافع (من استلمنا منه)' : 'المستفيد (من صرفنا له)'} *</label>
                  <input type="text" value={vForm.payee} onChange={e => setVForm(f => ({ ...f, payee: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" placeholder="الاسم…" />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">الغرض / البيان</label>
                  <input type="text" value={vForm.purpose} onChange={e => setVForm(f => ({ ...f, purpose: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" placeholder="مثال: دفعة عمولة مايو" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted mb-1 block">المحفظة</label>
                    <select value={vForm.wallet} onChange={e => setVForm(f => ({ ...f, wallet: e.target.value }))}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text">
                      {WALLETS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">المبلغ ({w?.currency})</label>
                    <input type="number" step="any" value={vForm.amount} onChange={e => setVForm(f => ({ ...f, amount: e.target.value }))}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" placeholder="0" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">التاريخ</label>
                  <input type="date" value={vForm.date} onChange={e => setVForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" />
                </div>
              </div>
              {vError && <div className="mt-3 text-xs text-red-fg bg-red-bg rounded-lg px-3 py-2 border border-red/20">{vError}</div>}
              <div className="flex gap-2 mt-5">
                <button onClick={() => handleVoucher(true)} disabled={loading.action}
                  className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition">
                  {loading.action ? '…' : '💾 حفظ + طباعة'}
                </button>
                <button onClick={() => handleVoucher(false)} disabled={loading.action}
                  className="flex-1 py-2 rounded-xl border border-teal/40 text-teal text-sm font-semibold hover:bg-teal/5 disabled:opacity-50 transition">
                  حفظ فقط
                </button>
                <button onClick={() => setShowVoucher(false)}
                  className="py-2 px-3 rounded-xl border border-border text-sm text-text hover:bg-cream transition">إلغاء</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Transfer Between Wallets Modal */}
      {showTransfer && (() => {
        const fromW = WALLETS.find(w => w.id === tForm.from);
        const toW   = WALLETS.find(w => w.id === tForm.to);
        const sameCur = fromW && toW && fromW.currency === toW.currency;
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowTransfer(false)}>
            <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()} dir="rtl">
              <h3 className="font-bold text-lg text-text mb-1">🔄 تحويل بين المحافظ</h3>
              <p className="text-xs text-muted mb-4">يُسجّل قيدين مرتبطين (صرف من المصدر + قبض في الوجهة).</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted mb-1 block">من محفظة</label>
                    <select value={tForm.from} onChange={e => setTForm(f => ({ ...f, from: e.target.value }))}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text">
                      {WALLETS.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">إلى محفظة</label>
                    <select value={tForm.to} onChange={e => setTForm(f => ({ ...f, to: e.target.value }))}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text">
                      {WALLETS.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className={sameCur ? '' : 'grid grid-cols-2 gap-3'}>
                  <div>
                    <label className="text-xs text-muted mb-1 block">المبلغ المُرسَل ({fromW?.currency})</label>
                    <input type="number" step="any" value={tForm.amount_from}
                      onChange={e => setTForm(f => ({ ...f, amount_from: e.target.value }))}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" placeholder="0" />
                  </div>
                  {!sameCur && (
                    <div>
                      <label className="text-xs text-muted mb-1 block">المبلغ المُستلَم ({toW?.currency})</label>
                      <input type="number" step="any" value={tForm.amount_to}
                        onChange={e => setTForm(f => ({ ...f, amount_to: e.target.value }))}
                        className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" placeholder="0" />
                    </div>
                  )}
                </div>
                {!sameCur && <p className="text-[11px] text-amber-fg">عملتان مختلفتان — أدخل المبلغ المستلَم بعد التحويل.</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted mb-1 block">التاريخ</label>
                    <input type="date" value={tForm.date} onChange={e => setTForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">ملاحظة (اختياري)</label>
                    <input type="text" value={tForm.note} onChange={e => setTForm(f => ({ ...f, note: e.target.value }))}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" placeholder="سبب التحويل…" />
                  </div>
                </div>
              </div>
              {tError && <div className="mt-3 text-xs text-red-fg bg-red-bg rounded-lg px-3 py-2 border border-red/20">{tError}</div>}
              <div className="flex gap-2 mt-5">
                <button onClick={handleTransfer} disabled={loading.action}
                  className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition">
                  {loading.action ? 'جار التحويل…' : 'تنفيذ التحويل'}
                </button>
                <button onClick={() => setShowTransfer(false)}
                  className="flex-1 py-2 rounded-xl border border-border text-sm text-text hover:bg-cream transition">إلغاء</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
