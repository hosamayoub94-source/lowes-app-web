// =============================================================
// AccountingDashboard v2 — full ledger with edit, delete,
// invoice export, date filter, SYP support, and Lozy integration
// =============================================================
import { useState, useMemo, useRef } from 'react';
import { useAuth } from '@hooks/useAuth';
import {
  useAccountingBootstrap,
  useAccountingDashboard,
  useAccountingActions,
  useCategories,
  useAccountingLoading,
} from '../hooks/useAccounting.js';
import {
  ENTRY_TYPE,
  ENTRY_TYPE_LABELS,
  ENTRY_TYPE_ICONS,
  PAYMENT_METHOD,
  PAYMENT_METHOD_LABELS,
  entryColorClass,
} from '../types/accounting.types.js';
import { ROLES } from '@data/teams';

// ── Constants ─────────────────────────────────────────────────────────────────
const TYPE_TABS = [
  { key: 'all',      label: 'الكل' },
  { key: 'income',   label: '💚 دخل' },
  { key: 'expense',  label: '🔴 مصاريف' },
  { key: 'advance',  label: '💵 سلف' },
  { key: 'salary',   label: '💰 رواتب' },
  { key: 'transfer', label: '🔄 تحويل' },
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
  notes:          '',
};

// ── Invoice printer ────────────────────────────────────────────────────────────
function printInvoice(entries, kpis, dateRange) {
  const now = new Date().toLocaleDateString('ar-SY', { year: 'numeric', month: 'long', day: 'numeric' });
  const from = dateRange.from || '—';
  const to   = dateRange.to   || '—';

  const rows = entries.map(e => `
    <tr>
      <td>${e.entry_date}</td>
      <td>${ENTRY_TYPE_LABELS[e.entry_type] ?? e.entry_type}</td>
      <td>${e.category || '—'}</td>
      <td>${e.description}</td>
      <td>${PAYMENT_METHOD_LABELS[e.payment_method] ?? e.payment_method}</td>
      <td style="color:${e.entry_type==='income'?'#16a34a':'#dc2626'}">
        ${e.entry_type==='income'?'+':'-'}$${Number(e.amount_usd).toFixed(2)}
      </td>
      ${Number(e.amount_try) ? `<td>${Number(e.amount_try).toFixed(0)} ₺</td>` : '<td>—</td>'}
      ${Number(e.amount_syp) ? `<td>${Number(e.amount_syp).toLocaleString()} ل.س</td>` : '<td>—</td>'}
    </tr>
  `).join('');

  const html = `<!DOCTYPE html><html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>كشف حسابات — Lowe's Professional</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Tajawal',sans-serif;color:#1c1627;background:#fff;padding:32px;font-size:13px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2d1b4e;padding-bottom:16px;margin-bottom:24px}
  .brand{font-size:22px;font-weight:800;color:#2d1b4e}
  .brand small{display:block;font-size:11px;color:#b48c3c;font-weight:600}
  .meta{text-align:left;font-size:11px;color:#666;line-height:1.7}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
  .kpi{border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px}
  .kpi .val{font-size:18px;font-weight:800}
  .kpi .lbl{font-size:10px;color:#666;margin-top:2px}
  .green{color:#16a34a} .red{color:#dc2626} .orange{color:#ea580c} .navy{color:#2d1b4e}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#2d1b4e;color:#fff;padding:8px 10px;text-align:right;font-size:12px}
  td{padding:7px 10px;border-bottom:1px solid #f3f4f6;font-size:12px}
  tr:nth-child(even) td{background:#faf8f6}
  .footer{margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;font-size:11px;color:#999;display:flex;justify-content:space-between}
  @media print{body{padding:16px}}
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Lowe's Professional <small>لويس برو — الكوزمتك الاحترافي</small></div>
      <div style="font-size:11px;color:#666;margin-top:6px">كشف حسابات رسمي</div>
    </div>
    <div class="meta">
      <div>تاريخ الإصدار: ${now}</div>
      <div>الفترة: ${from} → ${to}</div>
      <div>عدد القيود: ${entries.length}</div>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="val green">$${Number(kpis.income).toFixed(0)}</div><div class="lbl">إجمالي الدخل</div></div>
    <div class="kpi"><div class="val red">$${Number(kpis.expense).toFixed(0)}</div><div class="lbl">إجمالي المصاريف</div></div>
    <div class="kpi"><div class="val orange">$${Number(kpis.advance).toFixed(0)}</div><div class="lbl">إجمالي السلف</div></div>
    <div class="kpi"><div class="val navy">$${Number(kpis.balance).toFixed(0)}</div><div class="lbl">الرصيد الصافي</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>التاريخ</th><th>النوع</th><th>التصنيف</th><th>الوصف</th>
        <th>طريقة الدفع</th><th>USD</th><th>TRY</th><th>SYP</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="footer">
    <span>Lowe's Professional © ${new Date().getFullYear()}</span>
    <span>هذه الوثيقة صادرة إلكترونياً ولا تحتاج توقيعاً</span>
  </div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.onload = () => w.print();
}

// ── Entry Form (create / edit) ────────────────────────────────────────────────
function EntryForm({ initial, categories, onSave, onClose, loading }) {
  const [form, setForm] = useState(initial);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const filteredCats = categories.filter(c =>
    c.entry_type === form.entry_type
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-surface rounded-t-3xl sm:rounded-2xl p-5 w-full sm:max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg text-text">
            {initial.id ? '✏️ تعديل القيد' : '+ قيد جديد'}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-text text-xl">✕</button>
        </div>

        {/* Type selector */}
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {Object.entries(ENTRY_TYPE_LABELS).map(([k, v]) => (
            <button key={k}
              onClick={() => set('entry_type', k)}
              className={[
                'py-2 rounded-xl text-xs font-semibold transition border',
                form.entry_type === k
                  ? 'bg-navy text-white border-navy'
                  : 'border-border text-muted hover:border-navy/40',
              ].join(' ')}>
              {ENTRY_TYPE_ICONS[k]} {v}
            </button>
          ))}
        </div>

        <div className="space-y-3 mb-4">
          {/* Category */}
          <div>
            <label className="text-xs text-muted mb-1 block">التصنيف</label>
            <select value={form.category}
              onChange={e => set('category', e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-cream text-text">
              <option value="">اختر التصنيف</option>
              {filteredCats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-muted mb-1 block">الوصف <span className="text-red-400">*</span></label>
            <input type="text" value={form.description}
              onChange={e => set('description', e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-cream text-text"
              placeholder="اكتب وصفاً مفصلاً…" />
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted mb-1 block">USD $</label>
              <input type="number" value={form.amount_usd}
                onChange={e => set('amount_usd', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-cream text-text" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">TRY ₺</label>
              <input type="number" value={form.amount_try}
                onChange={e => set('amount_try', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-cream text-text" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">SYP ل.س</label>
              <input type="number" value={form.amount_syp}
                onChange={e => set('amount_syp', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-cream text-text" placeholder="0" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Payment method */}
            <div>
              <label className="text-xs text-muted mb-1 block">طريقة الدفع</label>
              <select value={form.payment_method}
                onChange={e => set('payment_method', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-cream text-text">
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) =>
                  <option key={k} value={k}>{v}</option>
                )}
              </select>
            </div>
            {/* Date */}
            <div>
              <label className="text-xs text-muted mb-1 block">التاريخ</label>
              <input type="date" value={form.entry_date}
                onChange={e => set('entry_date', e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-cream text-text" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-muted mb-1 block">ملاحظات</label>
            <textarea value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-cream text-text resize-none"
              placeholder="أي معلومات إضافية…" />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => onSave(form)}
            disabled={loading || !form.description}
            className="flex-1 py-3 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 disabled:opacity-50 transition">
            {loading ? 'جار الحفظ…' : (initial.id ? 'حفظ التعديلات' : 'إضافة القيد')}
          </button>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-border text-sm text-text hover:bg-cream transition">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export function AccountingDashboard() {
  const { id, role } = useAuth();
  useAccountingBootstrap(id);

  const { entries, kpis, breakdown, isLoading } = useAccountingDashboard();
  const categories = useCategories();
  const { createEntry, updateEntry, deleteEntry, setFilters, resetFilters } = useAccountingActions();
  const loading = useAccountingLoading();

  const isAdmin = role === ROLES.ADMIN || role === ROLES.MANAGER;

  const [activeTab,  setActiveTab]  = useState('all');
  const [showForm,   setShowForm]   = useState(false);
  const [editEntry,  setEditEntry]  = useState(null);
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [search,     setSearch]     = useState('');
  const [confirmDel, setConfirmDel] = useState(null);

  // Client-side filter (tab + search + date)
  const filtered = useMemo(() => {
    let list = entries;
    if (activeTab !== 'all')
      list = list.filter(e => e.entry_type === activeTab);
    if (search.trim())
      list = list.filter(e =>
        (e.description || '').includes(search) || (e.category || '').includes(search)
      );
    if (dateFrom)
      list = list.filter(e => e.entry_date >= dateFrom);
    if (dateTo)
      list = list.filter(e => e.entry_date <= dateTo);
    return list;
  }, [entries, activeTab, search, dateFrom, dateTo]);

  // KPIs for filtered view
  const filteredKpis = useMemo(() => {
    const income  = filtered.filter(e => e.entry_type==='income').reduce((s,e) => s+Number(e.amount_usd),0);
    const expense = filtered.filter(e => e.entry_type==='expense').reduce((s,e) => s+Number(e.amount_usd),0);
    const advance = filtered.filter(e => e.entry_type==='advance').reduce((s,e) => s+Number(e.amount_usd),0);
    const salary  = filtered.filter(e => e.entry_type==='salary').reduce((s,e) => s+Number(e.amount_usd),0);
    const balance = income - expense - salary;
    return { income, expense, advance, salary, balance };
  }, [filtered]);

  const handleSave = async (form) => {
    const data = {
      ...form,
      amount_usd: Number(form.amount_usd) || 0,
      amount_try: Number(form.amount_try) || 0,
      amount_syp: Number(form.amount_syp) || 0,
    };
    if (form.id) {
      await updateEntry(form.id, data);
    } else {
      await createEntry(data);
    }
    setShowForm(false);
    setEditEntry(null);
  };

  const handleDelete = async (id) => {
    await deleteEntry(id);
    setConfirmDel(null);
  };

  const handleApplyDates = () => {
    setFilters({ from: dateFrom || null, to: dateTo || null });
  };

  const handleResetDates = () => {
    setDateFrom('');
    setDateTo('');
    resetFilters();
  };

  return (
    <div className="min-h-screen bg-cream pb-24 md:pb-8" dir="rtl">
      <div className="max-w-5xl mx-auto p-4 md:p-6">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text">📒 دفتر الحسابات</h1>
            <p className="text-sm text-muted mt-0.5">السجل المالي المتكامل — Lowe's Professional</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isAdmin && (
              <>
                <button onClick={() => { setEditEntry(null); setShowForm(true); }}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-white transition"
                  style={{ background: 'linear-gradient(135deg, rgb(var(--color-navy)) 0%, rgb(var(--color-teal)) 100%)' }}>
                  + قيد جديد
                </button>
                <button
                  onClick={() => printInvoice(filtered, filteredKpis, { from: dateFrom, to: dateTo })}
                  className="px-4 py-2 rounded-xl text-sm font-bold border border-border text-text hover:bg-surface transition">
                  🖨️ فاتورة رسمية
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'الدخل',      value: `$${Number(filteredKpis.income).toFixed(0)}`,   icon: '💚', color: 'text-green-600' },
            { label: 'المصاريف',   value: `$${Number(filteredKpis.expense).toFixed(0)}`,  icon: '🔴', color: 'text-red-500' },
            { label: 'السلف',      value: `$${Number(filteredKpis.advance).toFixed(0)}`,  icon: '💵', color: 'text-orange-500' },
            { label: 'الرواتب',    value: `$${Number(filteredKpis.salary).toFixed(0)}`,   icon: '💰', color: 'text-blue-600' },
            { label: 'الرصيد الصافي', value: `$${Number(filteredKpis.balance).toFixed(0)}`, icon: '⚖️',
              color: filteredKpis.balance >= 0 ? 'text-green-600' : 'text-red-500' },
          ].map(k => (
            <div key={k.label} className="bg-surface border border-border/60 rounded-2xl p-4">
              <div className="text-xl mb-1">{k.icon}</div>
              <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
              <div className="text-xs text-muted mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>

        {/* ── Filters ── */}
        <div className="bg-surface border border-border/60 rounded-2xl p-4 mb-4 flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs text-muted mb-1 block">بحث</label>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ابحث في الوصف أو التصنيف…"
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" />
          </div>
          {/* Date from */}
          <div>
            <label className="text-xs text-muted mb-1 block">من تاريخ</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" />
          </div>
          {/* Date to */}
          <div>
            <label className="text-xs text-muted mb-1 block">إلى تاريخ</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" />
          </div>
          <button onClick={handleApplyDates}
            className="px-4 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition">
            تطبيق
          </button>
          {(dateFrom || dateTo || search) && (
            <button onClick={() => { setSearch(''); handleResetDates(); }}
              className="px-4 py-2 rounded-xl border border-border text-sm text-muted hover:text-text transition">
              مسح
            </button>
          )}
        </div>

        {/* ── Type Tabs ── */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {TYPE_TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition shrink-0',
                activeTab === t.key
                  ? 'bg-navy text-white'
                  : 'bg-surface border border-border text-muted hover:border-navy/40',
              ].join(' ')}>
              {t.label}
            </button>
          ))}
          <span className="text-xs text-muted flex items-center shrink-0 mr-auto">
            {filtered.length} قيد
          </span>
        </div>

        {/* ── Main layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Ledger entries list */}
          <div className="lg:col-span-2 space-y-2">
            {isLoading ? (
              <div className="text-center py-16 text-muted text-sm">جار التحميل…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">📒</div>
                <p className="text-muted text-sm">لا توجد قيود في هذه الفترة</p>
              </div>
            ) : (
              filtered.map(e => (
                <div key={e.id}
                  className="bg-surface border border-border/60 rounded-2xl p-3.5 flex items-center gap-3 hover:border-navy/20 transition group">
                  {/* Icon */}
                  <span className="text-2xl shrink-0">{ENTRY_TYPE_ICONS[e.entry_type] ?? '📄'}</span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text truncate">{e.description}</p>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                      <span className="text-xs text-muted">{e.category || '—'}</span>
                      <span className="text-xs text-muted">·</span>
                      <span className="text-xs text-muted">{e.entry_date}</span>
                      <span className="text-xs text-muted">·</span>
                      <span className="text-xs text-muted">{PAYMENT_METHOD_LABELS[e.payment_method] ?? e.payment_method}</span>
                    </div>
                    {e.notes && <p className="text-xs text-muted/70 mt-0.5 truncate">{e.notes}</p>}
                  </div>

                  {/* Amounts */}
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className={`text-sm font-bold ${entryColorClass(e.entry_type)}`}>
                      {e.entry_type==='income' ? '+' : '-'}${Number(e.amount_usd).toFixed(0)}
                    </p>
                    {Number(e.amount_try) > 0 && (
                      <p className="text-xs text-muted">{Number(e.amount_try).toLocaleString()} ₺</p>
                    )}
                    {Number(e.amount_syp) > 0 && (
                      <p className="text-xs text-muted">{Number(e.amount_syp).toLocaleString()} ل.س</p>
                    )}
                  </div>

                  {/* Admin actions */}
                  {isAdmin && (
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => { setEditEntry(e); setShowForm(true); }}
                        className="p-1.5 rounded-lg text-navy/60 hover:text-navy hover:bg-navy/10 transition"
                        title="تعديل">
                        ✏️
                      </button>
                      <button onClick={() => setConfirmDel(e)}
                        className="p-1.5 rounded-lg text-red-400/60 hover:text-red-600 hover:bg-red-50 transition"
                        title="حذف">
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Sidebar: breakdown */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-text">حسب التصنيف</h2>
            {breakdown.length === 0 ? (
              <p className="text-xs text-muted">لا توجد بيانات</p>
            ) : (
              breakdown.slice(0, 10).map(b => (
                <div key={b.label} className="bg-surface border border-border/60 rounded-xl p-3">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-semibold text-text truncate">{b.label}</span>
                    <span className="text-xs font-bold text-text">${b.total.toFixed(0)}</span>
                  </div>
                  <div className="h-1.5 bg-border/40 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (b.total / (kpis.income || 1)) * 100)}%`,
                        background: 'linear-gradient(90deg, rgb(var(--color-navy)), rgb(var(--color-teal)))',
                      }} />
                  </div>
                  <p className="text-[10px] text-muted mt-1">{b.count} قيود</p>
                </div>
              ))
            )}

            {/* Quick summary box */}
            <div className="bg-navy/5 dark:bg-white/5 rounded-xl p-4 mt-4">
              <p className="text-xs font-bold text-navy dark:text-white mb-2">ملخص الفترة</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted">إجمالي القيود</span>
                  <span className="font-semibold text-text">{filtered.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">من تاريخ</span>
                  <span className="font-semibold text-text">{dateFrom || 'الكل'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">إلى تاريخ</span>
                  <span className="font-semibold text-text">{dateTo || 'الكل'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Entry Form Modal ── */}
      {showForm && (
        <EntryForm
          initial={editEntry ? { ...editEntry } : { ...EMPTY_FORM }}
          categories={categories}
          loading={loading.action}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditEntry(null); }}
        />
      )}

      {/* ── Delete Confirm ── */}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setConfirmDel(null)}>
          <div className="bg-surface rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-text mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-muted mb-1">هل تريد حذف هذا القيد؟</p>
            <p className="text-sm font-semibold text-text mb-4 bg-cream rounded-lg px-3 py-2">
              {ENTRY_TYPE_ICONS[confirmDel.entry_type]} {confirmDel.description}
              <span className="text-xs text-muted block mt-0.5">{confirmDel.entry_date}</span>
            </p>
            <div className="flex gap-2">
              <button onClick={() => handleDelete(confirmDel.id)}
                disabled={loading.action}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 disabled:opacity-50 transition">
                {loading.action ? 'جار الحذف…' : 'نعم، احذف'}
              </button>
              <button onClick={() => setConfirmDel(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm text-text hover:bg-cream transition">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AccountingDashboard;
