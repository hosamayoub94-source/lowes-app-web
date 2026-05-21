// =============================================================
// AccountingDashboard — Integrated Accounting Ledger main page
// =============================================================
import { useState } from 'react';
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

const TYPE_TABS = [
  { key: 'all',     label: 'الكل' },
  { key: 'income',  label: 'دخل' },
  { key: 'expense', label: 'مصاريف' },
  { key: 'advance', label: 'سلف' },
  { key: 'salary',  label: 'رواتب' },
];

const EMPTY_FORM = {
  entry_type: ENTRY_TYPE.EXPENSE,
  category:   '',
  description: '',
  amount_usd: '',
  amount_try: '',
  payment_method: PAYMENT_METHOD.CASH,
  entry_date: new Date().toISOString().slice(0, 10),
};

export function AccountingDashboard() {
  const { id, role } = useAuth();
  useAccountingBootstrap(id);

  const { entries, kpis, breakdown, isLoading } = useAccountingDashboard();
  const categories = useCategories();
  const { createEntry, deleteEntry, setFilters, resetFilters } = useAccountingActions();
  const loading = useAccountingLoading();

  const isAdmin = role === ROLES.ADMIN || role === ROLES.MANAGER;

  const [activeTab, setActiveTab] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const filtered = activeTab === 'all'
    ? entries
    : entries.filter(e => e.entry_type === activeTab);

  const filteredCategories = categories.filter(c =>
    form.entry_type === 'all' || c.entry_type === form.entry_type
  );

  const handleSubmit = async () => {
    await createEntry({
      ...form,
      amount_usd: Number(form.amount_usd) || 0,
      amount_try: Number(form.amount_try) || 0,
      amount_syp: 0,
    });
    setShowForm(false);
    setForm({ ...EMPTY_FORM });
  };

  return (
    <div className="min-h-screen bg-cream p-4 md:p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">📒 دفتر الحسابات</h1>
          <p className="text-sm text-muted mt-0.5">السجل المالي المتكامل</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition"
          >
            + قيد جديد
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'إجمالي الدخل',     value: `$${Number(kpis.income).toFixed(0)}`,   icon: '💚', color: 'text-green-600' },
          { label: 'إجمالي المصاريف',   value: `$${Number(kpis.expense).toFixed(0)}`,  icon: '🔴', color: 'text-red-500' },
          { label: 'إجمالي السلف',       value: `$${Number(kpis.advance).toFixed(0)}`,  icon: '💵', color: 'text-orange-500' },
          { label: 'الرصيد الصافي',     value: `$${Number(kpis.balance).toFixed(0)}`,  icon: '⚖️', color: kpis.balance >= 0 ? 'text-green-600' : 'text-red-500' },
        ].map(k => (
          <div key={k.label} className="bg-surface border border-border rounded-xl p-4">
            <div className="text-2xl mb-1">{k.icon}</div>
            <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-muted mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Ledger entries */}
        <div className="lg:col-span-2">
          {/* Tabs */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {TYPE_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={[
                  'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition',
                  activeTab === t.key
                    ? 'bg-teal text-white'
                    : 'bg-surface border border-border text-muted hover:border-teal/40',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted text-sm">جار التحميل…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-2">📒</div>
              <p className="text-muted text-sm">لا توجد قيود</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(e => (
                <div key={e.id} className="bg-surface border border-border rounded-xl p-3 flex items-center gap-3">
                  <span className="text-xl">{ENTRY_TYPE_ICONS[e.entry_type] ?? '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{e.description}</p>
                    <p className="text-xs text-muted">{e.category} · {e.entry_date}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${entryColorClass(e.entry_type)}`}>
                      {e.entry_type === 'income' ? '+' : '-'}${Number(e.amount_usd).toFixed(0)}
                    </p>
                    <p className="text-xs text-muted">{PAYMENT_METHOD_LABELS[e.payment_method] ?? e.payment_method}</p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => deleteEntry(e.id)}
                      className="text-xs text-red-400 hover:text-red-600 transition shrink-0 mr-1"
                      title="حذف"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Category breakdown */}
        <div>
          <h2 className="text-sm font-semibold text-muted mb-3">حسب التصنيف</h2>
          {breakdown.length === 0 ? (
            <p className="text-xs text-muted">لا توجد بيانات</p>
          ) : (
            <div className="space-y-2">
              {breakdown.slice(0, 8).map(b => (
                <div key={b.label} className="bg-surface border border-border rounded-xl p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-text font-medium truncate">{b.label}</span>
                    <span className="text-xs font-bold text-text">${b.total.toFixed(0)}</span>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal rounded-full"
                      style={{ width: `${Math.min(100, (b.total / (kpis.income || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New Entry Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-text mb-4">قيد جديد</h3>

            {/* Entry type */}
            <div className="mb-3">
              <label className="text-xs text-muted mb-1 block">النوع</label>
              <div className="grid grid-cols-3 gap-1.5">
                {Object.entries(ENTRY_TYPE_LABELS).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setForm(f => ({ ...f, entry_type: k, category: '' }))}
                    className={[
                      'py-1.5 rounded-lg text-xs font-medium transition border',
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

            <div className="space-y-3 mb-4">
              {/* Category */}
              <div>
                <label className="text-xs text-muted mb-1 block">التصنيف</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text"
                >
                  <option value="">اختر التصنيف</option>
                  {filteredCategories.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-muted mb-1 block">الوصف</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text"
                  placeholder="اكتب وصفاً…"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Amount USD */}
                <div>
                  <label className="text-xs text-muted mb-1 block">المبلغ (USD)</label>
                  <input
                    type="number"
                    value={form.amount_usd}
                    onChange={e => setForm(f => ({ ...f, amount_usd: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text"
                    placeholder="0"
                  />
                </div>
                {/* Amount TRY */}
                <div>
                  <label className="text-xs text-muted mb-1 block">المبلغ (TRY)</label>
                  <input
                    type="number"
                    value={form.amount_try}
                    onChange={e => setForm(f => ({ ...f, amount_try: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Payment method */}
                <div>
                  <label className="text-xs text-muted mb-1 block">طريقة الدفع</label>
                  <select
                    value={form.payment_method}
                    onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text"
                  >
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                {/* Date */}
                <div>
                  <label className="text-xs text-muted mb-1 block">التاريخ</label>
                  <input
                    type="date"
                    value={form.entry_date}
                    onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={loading.action || !form.description}
                className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition"
              >
                حفظ
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
    </div>
  );
}

export default AccountingDashboard;
