// =============================================================
// AccountingScreen — multi-currency ledger (wired to real data)
// =============================================================
import { useState, useMemo } from 'react';
import { useAuth } from '@hooks/useAuth';
import { useToast } from '@hooks/useToast';
import { Tabs } from '@components/ui/Tabs';
import {
  useAccountingBootstrap,
  useAccountingDashboard,
  useAccountingActions,
  useAccountingLoading,
  useCategories,
  useChannels,
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
  BOOK,
  filterByBook,
  entryColorClass,
} from '@modules/accounting/types/accounting.types.js';
import AccountingReport from '@modules/accounting/components/AccountingReport';
import ChannelPnL from '@modules/accounting/components/ChannelPnL';
import ChannelStatement from '@modules/accounting/components/ChannelStatement';
import ChannelRemapTool from '@modules/accounting/components/ChannelRemapTool';
import TreasuryPanel from '@modules/accounting/components/TreasuryPanel';
import OperationalBalanceCard from '@modules/accounting/components/OperationalBalanceCard';
import {
  filterOperational,
  computeBookBalance,
  OP_ALL_SOURCES,
  OP_INCOME_SOURCES,
  OP_EXPENSE_SOURCES,
} from '@modules/accounting/components/operationalAccount';
import { printPaymentVoucher, computeNextVoucherNo } from '@modules/accounting/utils/paymentVoucher';

const TABS = [
  { key: 'all',      label: 'الكل' },
  { key: 'income',   label: '🟢 استلامات' },
  { key: 'expense',  label: '🔴 مصاريف' },
  { key: 'transfer', label: '🔄 تحويلات/تسليمات' },
];

// نوعا القيد في هذا القسم فقط: استلام + مصروف (لا رواتب/سلف/تحويل).
const SECTION_TYPES = [
  { key: ENTRY_TYPE.INCOME,  label: '🟢 استلام' },
  { key: ENTRY_TYPE.EXPENSE, label: '🔴 مصروف' },
];

const EMPTY_FORM = {
  entry_type:     ENTRY_TYPE.EXPENSE,
  category:       '',
  channel_id:     '',
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
          <div className="text-[10px] text-muted mt-0.5">استلامات</div>
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
  const { createEntry, createTransfer, updateEntry, deleteEntry }  = useAccountingActions();
  const loading    = useAccountingLoading();
  const categories = useCategories();
  const channels   = useChannels();
  const toast      = useToast();

  const isAdmin = role === 'admin' || role === 'manager';
  // المحاسبون (فادي ووسيم) ومدير المبيعات يقدرون يسجّلون قيوداً ومصادر — الحذف/التعديل للأدمن/المدير فقط.
  const canEnter = isAdmin || role === 'accountant' || role === 'sales_manager';

  const [tab, setTab]               = useState('all');
  const [monthFilter, setMonthFilter] = useState(currentMonth());
  // فلترة فترة مخصّصة (ربع/سنة/مدى) — بديلة عن الشهر الواحد.
  const [rangeMode, setRangeMode]   = useState(false);
  const [fromDate, setFromDate]     = useState('');
  const [toDate, setToDate]         = useState('');
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saveError, setSaveError]   = useState(null);
  const [exporting, setExporting]   = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showStatement, setShowStatement] = useState(false);
  const [showRemap, setShowRemap] = useState(false);

  // ── Transfer between wallets ───────────────────────────────────────────────
  const [showTransfer, setShowTransfer] = useState(false);
  const [tForm, setTForm] = useState({ from: 'cash_usd', to: 'bank_usd', amount_from: '', amount_to: '', date: new Date().toISOString().slice(0, 10), note: '' });
  const [tError, setTError] = useState(null);

  // ── Handover to central treasury (تسليم الرصيد للإدارة المالية) ─────────────
  const [showHandover, setShowHandover] = useState(false);
  const [hForm, setHForm] = useState({ wallet: 'cash_usd', amount: '', date: new Date().toISOString().slice(0, 10), note: '' });
  const [hError, setHError] = useState(null);

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
      book:        BOOK.OPERATIONAL,
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
        entry_type: ENTRY_TYPE.TRANSFER, category: TRANSFER_OUT, book: BOOK.OPERATIONAL,
        description: `تحويل إلى ${to.label}${tForm.note ? ' — ' + tForm.note : ''}`,
        ...walletAmounts(from.id, amtFrom),
        payment_method: from.id, entry_date: tForm.date, reference_no: ref,
      });
      // Inflow to destination wallet
      await createEntry({
        entry_type: ENTRY_TYPE.TRANSFER, category: TRANSFER_IN, book: BOOK.OPERATIONAL,
        description: `تحويل من ${from.label}${tForm.note ? ' — ' + tForm.note : ''}`,
        ...walletAmounts(to.id, amtTo),
        payment_method: to.id, entry_date: tForm.date, reference_no: ref,
      });
      setShowTransfer(false);
      setTForm(t => ({ ...t, amount_from: '', amount_to: '', note: '' }));
    } catch (e) { setTError(e.message); }
  };

  // تسليم الرصيد للإدارة المالية = تحويل من الكتاب التشغيلي → المركزي (بساقين).
  const handleHandover = async () => {
    const amt = Number(hForm.amount) || 0;
    if (amt <= 0) { setHError('أدخل مبلغاً صحيحاً'); return; }
    setHError(null);
    try {
      await createTransfer({
        amount: amt, wallet: hForm.wallet,
        fromBook: BOOK.OPERATIONAL, toBook: BOOK.CENTRAL,
        date: hForm.date, note: hForm.note,
      });
      toast.success('تم تسليم الرصيد للإدارة المالية ✅');
      setShowHandover(false);
      setHForm(f => ({ ...f, amount: '', note: '' }));
    } catch (e) { setHError(e.message); }
  };

  // ── قيود الكتاب التشغيلي (فادي/وسيم) فقط ───────────────────────────────────
  const bookEntries = useMemo(() => filterByBook(entries, BOOK.OPERATIONAL), [entries]);
  // جدول العمليات = استلام + مصروف (بلا تحويلات).
  const opEntries = useMemo(() => filterOperational(bookEntries), [bookEntries]);
  // الرصيد التراكمي (مراعٍ للتحويلات: تسليم/توريد) = الكاش الموجود لديهم.
  const opBalance = useMemo(() => computeBookBalance(entries, BOOK.OPERATIONAL), [entries]);

  // ── Month filtering ────────────────────────────────────────────────────────
  // مُسنِّف الفترة: إمّا شهر واحد (YYYY-MM) أو مدى تواريخ مخصّص (من/إلى).
  const inPeriod = useMemo(() => {
    if (rangeMode) {
      const f = fromDate || '0000-00-00';
      const t = toDate || '9999-99-99';
      return (e) => { const d = e.entry_date ?? ''; return d >= f && d <= t; };
    }
    if (monthFilter) return (e) => (e.entry_date ?? '').startsWith(monthFilter);
    return () => true;
  }, [rangeMode, fromDate, toDate, monthFilter]);

  const periodLabel = rangeMode
    ? `${fromDate || '…'} → ${toDate || '…'}`
    : (monthFilter || 'كل الفترات');

  const monthEntries = useMemo(() => opEntries.filter(inPeriod), [opEntries, inPeriod]);

  // التحويلات/التسليمات للكتاب التشغيلي (لا تظهر بجدول الاستلام/المصروف) — أثر تدقيقي.
  const monthTransfers = useMemo(
    () => bookEntries.filter(e => e.entry_type === ENTRY_TYPE.TRANSFER && inPeriod(e)),
    [bookEntries, inPeriod],
  );

  const filtered = tab === 'all'
    ? monthEntries
    : tab === 'transfer'
      ? monthTransfers
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

  // كل «الجهات / المصادر» المعروفة = التصنيفات + أي مصدر استُخدم سابقاً في القيود.
  // (المصدر نصّ حر في حقل category — فإضافة مصدر جديد = مجرّد كتابته.)
  const knownSources = useMemo(() => {
    const set = new Set(OP_ALL_SOURCES); // مصادر جاهزة: شحن/أجور/مشتريات/قيمة بضاعة مباعة/توريد…
    categories.forEach(c => { const n = c.name_ar ?? c.name; if (n) set.add(n); });
    opEntries.forEach(e => { if (e.category) set.add(e.category); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [categories, opEntries]);

  // مصادر مقترحة حسب نوع القيد المختار حالياً (تظهر أولاً كاقتراح سريع).
  const suggestedSources = form.entry_type === ENTRY_TYPE.INCOME ? OP_INCOME_SOURCES : OP_EXPENSE_SOURCES;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.description.trim()) { setSaveError('الوصف مطلوب'); return; }
    const amt = Number(form.amount_usd) || Number(form.amount_try) || Number(form.amount_syp);
    if (!amt) { setSaveError('أدخل مبلغاً واحداً على الأقل'); return; }
    setSaveError(null);
    try {
      await createEntry({
        entry_type:     form.entry_type,
        book:           BOOK.OPERATIONAL,
        category:       form.category || null,
        channel_id:     form.channel_id || null,
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
    try { await exportToExcel(filtered, rangeMode ? `${fromDate || 'بداية'}_${toDate || 'نهاية'}` : monthFilter); }
    finally { setExporting(false); }
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text">🚚 المصاريف والشحن</h1>
          <p className="text-sm text-muted mt-0.5">مصاريف وإيرادات التشغيل وشركات الشحن — الوارد والصادر لكل جهة شهرياً</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period filter: month or custom range */}
          {rangeMode ? (
            <div className="flex items-center gap-1">
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="border border-border rounded-xl px-2 py-2 text-sm bg-surface text-text" title="من" />
              <span className="text-muted text-xs">→</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="border border-border rounded-xl px-2 py-2 text-sm bg-surface text-text" title="إلى" />
            </div>
          ) : (
            <input
              type="month"
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text"
            />
          )}
          <button
            onClick={() => setRangeMode(v => !v)}
            className="px-3 py-2 rounded-xl border border-border text-xs font-semibold text-text hover:bg-cream transition whitespace-nowrap"
            title="تبديل بين شهر واحد ومدى تواريخ مخصّص"
          >
            {rangeMode ? '📅 شهر' : '🗓️ مدى مخصّص'}
          </button>
          {/* Report toggle */}
          <button
            onClick={() => setShowReport(v => !v)}
            className={`px-4 py-2 rounded-xl border text-sm font-semibold transition ${showReport ? 'bg-teal text-navy border-teal' : 'border-border text-text hover:bg-cream'}`}
          >
            📊 تقرير
          </button>
          {/* كشف حساب تراكمي لكل موزّع/مسوّق (له/عليه) — مستقلّ عن الشهر */}
          <button
            onClick={() => setShowStatement(true)}
            className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-text hover:bg-cream transition"
          >
            📒 كشف حساب
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowRemap(true)}
              className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-text hover:bg-cream transition"
              title="ربط القيود القديمة (نصّ حر) بالقنوات المُدارة"
            >
              🔗 ربط بالقنوات
            </button>
          )}
          {/* Export */}
          <button
            onClick={handleExport}
            disabled={exporting || filtered.length === 0}
            className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-text hover:bg-cream transition disabled:opacity-40"
          >
            {exporting ? 'جار التصدير…' : '⬇️ Excel'}
          </button>
          {canEnter && (
            <>
              <button
                onClick={() => { setShowVoucher(true); setVError(null); }}
                className="px-4 py-2 rounded-xl border border-teal/40 text-teal text-sm font-semibold hover:bg-teal/5 transition whitespace-nowrap"
              >
                🧾 سند قبض/صرف
              </button>
              <button
                onClick={() => { setShowForm(true); setForm(EMPTY_FORM); setSaveError(null); }}
                className="px-4 py-2 rounded-xl bg-teal text-navy text-sm font-semibold hover:bg-teal/90 transition whitespace-nowrap"
              >
                + قيد جديد
              </button>
            </>
          )}
        </div>
      </div>

      {/* الرصيد الموجود حالياً لدى فادي ووسيم (تُسوّيه الإدارة المالية آخر الشهر) */}
      <OperationalBalanceCard
        balance={opBalance}
        title="💼 الرصيد الموجود حالياً (لدى فادي ووسيم)"
        subtitle="إجمالي الاستلامات ناقص المصاريف والتحويلات — سلّمه للإدارة المالية عند الحاجة"
      >
        {canEnter && (
          <button
            onClick={() => { setShowHandover(true); setHError(null); }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-navy text-white hover:opacity-90 transition"
          >
            ⬆️ رفع/تسليم الرصيد للخزينة
          </button>
        )}
      </OperationalBalanceCard>

      {/* لوحة المحافظ — شو معنا بكل محفظة (ل.س / دولار / شام بالعملتين) لدى فادي/وسيم */}
      <TreasuryPanel entries={bookEntries} />
      <p className="text-[11px] text-muted -mt-3 px-1">
        ℹ️ مجموع المحافظ هنا قد يختلف عن «الرصيد الموجود» أعلاه: لوحة المحافظ تشمل كل حركات الكتاب (تحويلات بين المحافظ أيضاً)،
        بينما الرصيد الموجود = استلامات − مصاريف − ما سُلّم للإدارة المالية.
      </p>

      {/* Financial report (period = current month filter) */}
      {showReport && (
        <div className="bg-surface border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-text">📊 التقرير المالي</h3>
            <span className="text-xs text-muted">{periodLabel} · {monthEntries.length} قيد</span>
          </div>
          <AccountingReport entries={monthEntries} periodLabel={periodLabel} />
        </div>
      )}

      {/* Per-currency KPI blocks */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CurrencyBlock currency="USD" symbol="$"  {...currencyKpis.USD} />
        <CurrencyBlock currency="TRY" symbol="₺"  {...currencyKpis.TRY} />
        <CurrencyBlock currency="SYP" symbol="£"  {...currencyKpis.SYP} />
      </div>

      {/* الربح/الخسارة لكل قناة (شركة شحن/أونلاين/موزّع…) — للشهر المحدد */}
      <ChannelPnL
        entries={monthEntries}
        channels={channels}
        title={`🚚 التدفّق النقدي لكل قناة — ${periodLabel}`}
        subtitle="وارد/صادر/صافي لكل مصدر (تدفّق نقدي — ليس هامش الربح الصافي؛ الأخير يحتاج تكلفة البضاعة في /profitability)"
      />

      {/* Tabs (موحّد) */}
      <Tabs tabs={TABS} value={tab} onChange={setTab} />

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
                <div className="grid grid-cols-2 gap-2">
                  {SECTION_TYPES.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setForm(f => ({ ...f, entry_type: key, category: '', channel_id: '' }))}
                      className={[
                        'px-3 py-2 rounded-lg text-sm font-semibold transition border',
                        form.entry_type === key
                          ? 'bg-teal text-navy border-teal'
                          : 'border-border text-muted hover:border-teal/40',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* القناة المُدارة (شركة شحن/موزّع/أونلاين…) — مُبرَزة: ربطها يغني التقرير بدل النصّ الحر */}
              {channels.length > 0 && (
                <div className="rounded-xl border-2 border-teal/40 bg-teal/5 p-3">
                  <label className="text-xs font-bold text-teal mb-1 flex items-center gap-1">
                    📌 اربط القناة / المصدر <span className="font-normal text-muted">(يغني التقرير — مُستحسَن)</span>
                  </label>
                  <select
                    value={form.channel_id}
                    onChange={e => {
                      const ch = channels.find(c => c.id === e.target.value);
                      setForm(f => ({ ...f, channel_id: e.target.value, category: ch ? ch.name_ar : f.category }));
                    }}
                    className="w-full border border-teal/40 rounded-xl px-3 py-2 text-sm bg-surface text-text font-semibold"
                  >
                    <option value="">— بلا قناة (اكتب المصدر يدوياً) —</option>
                    {channels
                      .filter(c => c.is_active && (form.entry_type === ENTRY_TYPE.INCOME ? c.allows_income : c.allows_expense))
                      .map(c => <option key={c.id} value={c.id}>{c.icon || '📌'} {c.name_ar}</option>)}
                  </select>
                </div>
              )}

              {/* الجهة / المصدر — أزرار سريعة + كتابة حرة (= إضافة مصدر جديد) */}
              <div>
                <label className="text-xs text-muted mb-1 block">
                  {form.entry_type === ENTRY_TYPE.INCOME ? 'مصدر الاستلام' : 'بند المصروف'} (اختر أو اكتب جديداً)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {suggestedSources.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, category: s }))}
                      className={[
                        'px-2.5 py-1 rounded-lg text-xs font-medium border transition',
                        form.category === s ? 'bg-teal text-navy border-teal' : 'border-border text-muted hover:border-teal/40',
                      ].join(' ')}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  list="acct-source-list"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  placeholder="أو اكتب بنداً/مصدراً جديداً…"
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text"
                />
                <datalist id="acct-source-list">
                  {knownSources.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>

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
                className="flex-1 py-2 rounded-xl bg-teal text-navy text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition"
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
                      className={['py-2 rounded-xl text-xs font-bold border transition', vForm.kind === k ? 'bg-teal text-navy border-teal' : 'border-border text-muted hover:border-teal/40'].join(' ')}>
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
                  className="flex-1 py-2 rounded-xl bg-teal text-navy text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition">
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
                  className="flex-1 py-2 rounded-xl bg-teal text-navy text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition">
                  {loading.action ? 'جار التحويل…' : 'تنفيذ التحويل'}
                </button>
                <button onClick={() => setShowTransfer(false)}
                  className="flex-1 py-2 rounded-xl border border-border text-sm text-text hover:bg-cream transition">إلغاء</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Handover to central treasury Modal (تسليم الرصيد للإدارة المالية) */}
      {showHandover && (() => {
        const hW = WALLETS.find(x => x.id === hForm.wallet);
        const hCur = hW?.currency || 'USD';
        const curBal = hCur === 'TRY' ? opBalance.amount_try : hCur === 'SYP' ? opBalance.amount_syp : opBalance.amount_usd;
        const curSym = hCur === 'TRY' ? '₺' : hCur === 'SYP' ? 'ل.س' : '$';
        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowHandover(false)}>
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()} dir="rtl">
            <h3 className="font-bold text-lg text-text mb-1">⬆️ تسليم الرصيد للإدارة المالية</h3>
            <p className="text-xs text-muted mb-4">يُسجَّل تحويلاً ينقص رصيدكم ويزيد الخزينة المركزية (بلا تأثير على الربح/الخسارة).</p>
            <div className="space-y-3">
              {/* الرصيد الحالي بالعملة + تسليم الكل */}
              <div className="flex items-center justify-between rounded-xl bg-cream border border-border px-3 py-2">
                <span className="text-xs text-muted">الرصيد الحالي ({hCur})</span>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold font-mono ${curBal >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {curBal >= 0 ? '' : '−'}{curSym}{Math.abs(Number(curBal) || 0).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 2 })}
                  </span>
                  <button type="button" disabled={curBal <= 0}
                    onClick={() => setHForm(f => ({ ...f, amount: String(Math.max(0, Number(curBal) || 0)) }))}
                    className="px-2 py-1 rounded-lg text-[11px] font-bold border border-navy/40 text-navy hover:bg-navy/5 disabled:opacity-40">
                    سلّم الكل
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted mb-1 block">المحفظة</label>
                  <select value={hForm.wallet} onChange={e => setHForm(f => ({ ...f, wallet: e.target.value, amount: '' }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text">
                    {WALLETS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">المبلغ ({hCur})</label>
                  <input type="number" step="any" value={hForm.amount} onChange={e => setHForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">التاريخ</label>
                <input type="date" value={hForm.date} onChange={e => setHForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">ملاحظة (اختياري)</label>
                <input type="text" value={hForm.note} onChange={e => setHForm(f => ({ ...f, note: e.target.value }))}
                  className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" placeholder="تسليم شهر…" />
              </div>
            </div>
            {hError && <div className="mt-3 text-xs text-red-fg bg-red-bg rounded-lg px-3 py-2 border border-red/20">{hError}</div>}
            <div className="flex gap-2 mt-5">
              <button onClick={handleHandover} disabled={loading.action}
                className="flex-1 py-2 rounded-xl bg-navy text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition">
                {loading.action ? '…' : 'تأكيد التسليم'}
              </button>
              <button onClick={() => setShowHandover(false)}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-text hover:bg-cream transition">إلغاء</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* كشف حساب تراكمي لكل قناة/موزّع (كل الزمن — غير مقيّد بالشهر) */}
      {showStatement && (
        <ChannelStatement entries={bookEntries} channels={channels} onClose={() => setShowStatement(false)} />
      )}

      {/* أداة ربط القيود القديمة بالقنوات (أدمن فقط — تعدّل بيانات فعلية) */}
      {showRemap && isAdmin && (
        <ChannelRemapTool
          entries={opEntries}
          channels={channels}
          updateEntry={updateEntry}
          onClose={() => setShowRemap(false)}
        />
      )}
    </div>
  );
}
