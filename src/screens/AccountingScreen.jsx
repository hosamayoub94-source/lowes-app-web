// =============================================================
// AccountingScreen — wired to real accounting service
// =============================================================
import { useState } from 'react';
import { useAuth } from '@hooks/useAuth';
import {
  useAccountingBootstrap, useAccountingDashboard,
  useAccountingActions, useAccountingLoading, useCategories,
} from '@modules/accounting/hooks/useAccounting.js';
import {
  ENTRY_TYPE, ENTRY_TYPE_LABELS, ENTRY_TYPE_ICONS,
  PAYMENT_METHOD, PAYMENT_METHOD_LABELS, entryColorClass,
} from '@modules/accounting/types/accounting.types.js';

const TABS = [
  {key:'all',label:'الكل'},{key:'income',label:'دخل'},
  {key:'expense',label:'مصروف'},{key:'advance',label:'سلف'},{key:'salary',label:'رواتب'},
];

const EMPTY_FORM = {
  entry_type: ENTRY_TYPE.EXPENSE, category:'', description:'',
  amount_usd:'', amount_try:'', amount_syp:'',
  payment_method: PAYMENT_METHOD.CASH, entry_date: new Date().toISOString().slice(0,10),
};

const TONE_CLASSES = { green:'text-green-600', red:'text-red-500', orange:'text-orange-500', teal:'text-teal' };

export default function AccountingScreen() {
  const { id, role } = useAuth();
  useAccountingBootstrap(id);

  const { entries, kpis, isLoading } = useAccountingDashboard();
  const { createEntry, deleteEntry }  = useAccountingActions();
  const loading    = useAccountingLoading();
  const categories = useCategories();

  const isAdmin = role === 'admin' || role === 'manager';
  const [tab, setTab]           = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saveErr, setSaveErr]   = useState(null);

  const filtered = tab === 'all' ? entries : entries.filter(e => e.entry_type === tab);
  const catOptions = categories.filter(c => !form.entry_type || c.entry_type === form.entry_type);

  const handleSubmit = async () => {
    if (!form.description.trim()) { setSaveErr('الوصف مطلوب'); return; }
    const amt = Number(form.amount_usd)||Number(form.amount_try)||Number(form.amount_syp);
    if (!amt) { setSaveErr('أدخل مبلغاً واحداً على الأقل'); return; }
    setSaveErr(null);
    try {
      await createEntry({ entry_type:form.entry_type, category:form.category||null,
        description:form.description.trim(), amount_usd:Number(form.amount_usd)||0,
        amount_try:Number(form.amount_try)||0, amount_syp:Number(form.amount_syp)||0,
        payment_method:form.payment_method, entry_date:form.entry_date });
      setShowForm(false); setForm(EMPTY_FORM);
    } catch (e) { setSaveErr(e.message); }
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm('هل تريد حذف هذا القيد؟')) return;
    await deleteEntry(entryId);
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">📒 المحاسبة</h1>
          <p className="text-sm text-muted mt-0.5">الإيرادات والمصاريف والصندوق</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setShowForm(true); setForm(EMPTY_FORM); setSaveErr(null); }}
            className="px-4 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition">
            + قيد جديد
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {label:'إيرادات (USD)', value:kpis?.totalIncome??0,   tone:'green',  prefix:'$'},
          {label:'مصاريف (USD)',  value:kpis?.totalExpense??0,  tone:'red',    prefix:'$'},
          {label:'سلف (USD)',     value:kpis?.totalAdvance??0,  tone:'orange', prefix:'$'},
          {label:'الرصيد (USD)',  value:kpis?.balance??0,       tone:(kpis?.balance??0)>=0?'teal':'red', prefix:'$'},
        ].map(k => (
          <div key={k.label} className="bg-surface border border-border rounded-2xl p-4">
            <div className={['text-xl font-bold', TONE_CLASSES[k.tone]??'text-teal'].join(' ')}>
              {k.prefix}{Number(k.value).toLocaleString('ar-SA',{maximumFractionDigits:2})}
            </div>
            <div className="text-xs text-muted mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={['px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition', tab===t.key?'bg-teal text-white':'bg-surface border border-border text-muted'].join(' ')}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted text-sm">جار التحميل…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16"><div className="text-4xl mb-2">📭</div><p className="text-muted text-sm">لا توجد قيود</p></div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-cream text-xs text-muted">
                <th className="py-2 px-4 text-right">النوع</th>
                <th className="py-2 px-4 text-right">الوصف</th>
                <th className="py-2 px-4 text-center">USD</th>
                <th className="py-2 px-4 text-center">TRY</th>
                <th className="py-2 px-4 text-center">التاريخ</th>
                <th className="py-2 px-4 text-center">الدفع</th>
                {isAdmin && <th className="py-2 px-4 text-center">حذف</th>}
              </tr></thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} className="border-t border-border hover:bg-cream/50">
                    <td className="py-3 px-4">
                      <span className={['text-xs font-semibold', entryColorClass(e.entry_type)].join(' ')}>
                        {ENTRY_TYPE_ICONS[e.entry_type]} {ENTRY_TYPE_LABELS[e.entry_type]??e.entry_type}
                      </span>
                      {e.category && <div className="text-xs text-muted mt-0.5">{e.category}</div>}
                    </td>
                    <td className="py-3 px-4 max-w-xs text-sm text-text">{e.description}</td>
                    <td className={['py-3 px-4 text-center font-mono font-semibold', entryColorClass(e.entry_type)].join(' ')}>
                      {e.amount_usd ? '$'+Number(e.amount_usd).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-muted text-xs">
                      {e.amount_try ? '₺'+Number(e.amount_try).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 px-4 text-center text-xs text-muted">
                      {e.entry_date ? new Date(e.entry_date).toLocaleDateString('ar') : '—'}
                    </td>
                    <td className="py-3 px-4 text-center text-xs text-muted">
                      {PAYMENT_METHOD_LABELS[e.payment_method]??e.payment_method??'—'}
                    </td>
                    {isAdmin && (
                      <td className="py-3 px-4 text-center">
                        <button onClick={() => handleDelete(e.id)} disabled={loading.action}
                          className="text-red-500 hover:text-red-700 text-xs">حذف</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-surface rounded-2xl p-6 w-full max-w-lg shadow-xl overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-text mb-4">قيد جديد</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted mb-1 block">النوع</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ENTRY_TYPE_LABELS).map(([k,v]) => (
                    <button key={k} onClick={() => setForm(f=>({...f,entry_type:k,category:''}))}
                      className={['px-3 py-1.5 rounded-lg text-xs font-medium border', form.entry_type===k?'bg-teal text-white border-teal':'border-border text-muted'].join(' ')}>
                      {ENTRY_TYPE_ICONS[k]} {v}
                    </button>
                  ))}
                </div>
              </div>
              {catOptions.length > 0 && (
                <div><label className="text-xs text-muted mb-1 block">الفئة</label>
                  <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text">
                    <option value="">— فئة —</option>
                    {catOptions.map(c => <option key={c.id} value={c.name_ar??c.name}>{c.name_ar??c.name}</option>)}
                  </select></div>
              )}
              <div><label className="text-xs text-muted mb-1 block">الوصف</label>
                <input type="text" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}
                  placeholder="وصف القيد…" className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" /></div>
              <div className="grid grid-cols-3 gap-2">
                {[['amount_usd','USD ($)'],['amount_try','TRY (₺)'],['amount_syp','SYP (£)']].map(([k,lbl])=>(
                  <div key={k}><label className="text-xs text-muted mb-1 block">{lbl}</label>
                    <input type="number" step="any" value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" placeholder="0" /></div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted mb-1 block">طريقة الدفع</label>
                  <select value={form.payment_method} onChange={e=>setForm(f=>({...f,payment_method:e.target.value}))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text">
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                  </select></div>
                <div><label className="text-xs text-muted mb-1 block">التاريخ</label>
                  <input type="date" value={form.entry_date} onChange={e=>setForm(f=>({...f,entry_date:e.target.value}))}
                    className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" /></div>
              </div>
            </div>
            {saveErr && <div className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveErr}</div>}
            <div className="flex gap-2 mt-5">
              <button onClick={handleSubmit} disabled={loading.action}
                className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold disabled:opacity-50">{loading.action?'جار الحفظ…':'إضافة'}</button>
              <button onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-xl border border-border text-sm text-text">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
