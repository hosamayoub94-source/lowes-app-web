// =============================================================
// FieldCRMScreen — سجل الزيارات الميدانية للمندوبين
// مبني على MASTER_OPERATIONS.md + SALES_RULES.md
// "أي زيارة غير مسجلة = لم تحدث"
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth }  from '@hooks/useAuth';
import { supabase } from '@services/supabase';
import { ROLES }    from '@data/teams';

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

const OUTCOMES = [
  { key: 'visited',   label: 'زيارة عادية',     icon: '✅', color: 'text-green-fg bg-green-bg' },
  { key: 'order',     label: 'تم أخذ طلب',       icon: '🛒', color: 'text-teal bg-teal/10' },
  { key: 'follow_up', label: 'يحتاج متابعة',     icon: '📞', color: 'text-amber-fg bg-amber-bg' },
  { key: 'refused',   label: 'رفض الطلب',        icon: '❌', color: 'text-red-fg bg-red-bg' },
  { key: 'closed',    label: 'مغلق / غائب',      icon: '🔒', color: 'text-muted bg-surface-alt' },
];

const CLIENT_TYPES = [
  { key: 'pharmacy',  label: 'صيدلية',      icon: '💊' },
  { key: 'beauty',    label: 'مركز تجميل',  icon: '💄' },
  { key: 'clinic',    label: 'عيادة',        icon: '🏥' },
  { key: 'wholesale', label: 'تاجر جملة',   icon: '📦' },
  { key: 'other',     label: 'أخرى',         icon: '🏪' },
];

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]}`;
}

function OutcomeBadge({ outcome }) {
  const o = OUTCOMES.find(x => x.key === outcome) ?? OUTCOMES[0];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${o.color}`}>
      {o.icon} {o.label}
    </span>
  );
}

// ── Quick Visit Modal ─────────────────────────────────────────
function VisitModal({ clients, repId, repName, onSave, onClose }) {
  const [step, setStep] = useState('client'); // 'client' | 'details'
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [newClientMode, setNewClientMode] = useState(false);
  const [form, setForm] = useState({
    outcome: 'visited', order_taken: false, order_amount: '',
    notes: '', next_visit_date: '',
    // new client fields
    client_code: '', client_name: '', client_type: 'pharmacy',
    city: '', phone: '', owner_name: '',
  });
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() =>
    clients.filter(c =>
      c.name.includes(clientSearch) ||
      c.code.includes(clientSearch) ||
      (c.city ?? '').includes(clientSearch)
    ).slice(0, 20)
  , [clients, clientSearch]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let clientId = selectedClient?.id ?? null;
      let clientCode = selectedClient?.code ?? form.client_code;
      let clientName = selectedClient?.name ?? form.client_name;

      // Create new client if needed
      if (newClientMode && form.client_name) {
        const code = form.client_code || `CLT-${Date.now().toString().slice(-6)}`;
        const { data: newClient } = await supabase.from('crm_clients').insert({
          code, name: form.client_name, type: form.client_type,
          city: form.city || null, phone: form.phone || null,
          owner_name: form.owner_name || null,
          rep_id: repId, rep_name: repName,
        }).select().single();
        clientId   = newClient?.id ?? null;
        clientCode = code;
        clientName = form.client_name;
      }

      await supabase.from('crm_visits').insert({
        client_id:       clientId,
        client_code:     clientCode,
        client_name:     clientName,
        rep_id:          repId,
        rep_name:        repName,
        visit_date:      new Date().toISOString().slice(0,10),
        outcome:         form.outcome,
        order_taken:     form.order_taken,
        order_amount:    form.order_amount ? Number(form.order_amount) : 0,
        notes:           form.notes || null,
        next_visit_date: form.next_visit_date || null,
      });

      onSave();
      onClose();
    } catch (e) {
      alert('خطأ: ' + e.message);
    } finally { setSaving(false); }
  };

  const INP = 'w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface text-text focus:border-teal focus:outline-none transition';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose} dir="rtl">
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between bg-gradient-to-r from-teal/10 to-transparent shrink-0">
          <h3 className="font-bold text-base text-text">
            {step === 'client' ? '📍 اختر العميل' : `✍️ تسجيل زيارة — ${selectedClient?.name ?? form.client_name}`}
          </h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-surface-alt flex items-center justify-center text-muted hover:text-text">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Step 1: Select Client */}
          {step === 'client' && (
            <>
              <input value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                placeholder="ابحث باسم العميل أو الكود أو المدينة..."
                className={INP} autoFocus />

              {filtered.length > 0 ? (
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {filtered.map(c => (
                    <button key={c.id} onClick={() => { setSelectedClient(c); setStep('details'); setNewClientMode(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-alt hover:border-teal/40 hover:bg-teal/5 border border-border transition text-start">
                      <span className="text-xl shrink-0">{CLIENT_TYPES.find(t => t.key === c.type)?.icon ?? '🏪'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text truncate">{c.name}</p>
                        <p className="text-[10px] text-muted">{c.code} · {c.city ?? '—'}</p>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${c.status === 'active' ? 'bg-green-bg text-green-fg' : 'bg-surface text-muted border border-border'}`}>
                        {c.status === 'active' ? 'نشط' : 'غير نشط'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : clientSearch ? (
                <div className="text-center py-4 text-muted text-sm">لا نتائج — هل تريد إضافة عميل جديد؟</div>
              ) : null}

              {/* New client option */}
              <button onClick={() => { setNewClientMode(true); setStep('details'); setSelectedClient(null); }}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-teal/40 text-sm text-teal hover:bg-teal/5 font-semibold transition">
                + إضافة عميل جديد
              </button>
            </>
          )}

          {/* Step 2: Visit Details */}
          {step === 'details' && (
            <>
              {/* New client fields */}
              {newClientMode && (
                <div className="space-y-3 p-3 bg-surface-alt rounded-xl border border-border">
                  <p className="text-xs font-bold text-muted">📋 بيانات العميل الجديد</p>
                  {[
                    { key: 'client_name', label: 'اسم العميل *', placeholder: 'صيدلية المشفى' },
                    { key: 'client_code', label: 'كود العميل', placeholder: 'تلقائي إذا فارغ' },
                    { key: 'city',        label: 'المدينة',      placeholder: 'دمشق' },
                    { key: 'phone',       label: 'الهاتف',       placeholder: '+963 ...' },
                    { key: 'owner_name',  label: 'اسم صاحب المحل', placeholder: 'اختياري' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="text-xs text-muted block mb-1">{label}</label>
                      <input value={form[key]} onChange={e => setForm(f=>({...f,[key]:e.target.value}))}
                        placeholder={placeholder} className={INP} />
                    </div>
                  ))}
                  <div>
                    <label className="text-xs text-muted block mb-1">نوع العميل</label>
                    <div className="flex flex-wrap gap-1.5">
                      {CLIENT_TYPES.map(t => (
                        <button key={t.key} onClick={() => setForm(f=>({...f,client_type:t.key}))}
                          className={`text-xs px-2.5 py-1.5 rounded-xl border font-semibold transition ${form.client_type === t.key ? 'bg-teal text-white border-teal' : 'border-border text-muted hover:border-teal/40'}`}>
                          {t.icon} {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Outcome */}
              <div>
                <p className="text-xs font-bold text-muted mb-2">نتيجة الزيارة</p>
                <div className="grid grid-cols-2 gap-2">
                  {OUTCOMES.map(o => (
                    <button key={o.key} onClick={() => setForm(f=>({...f,outcome:o.key}))}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition ${form.outcome === o.key ? 'bg-teal text-white border-teal' : 'border-border text-text hover:border-teal/40'}`}>
                      <span>{o.icon}</span><span>{o.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Order */}
              <div className="flex items-center gap-3 p-3 bg-surface-alt rounded-xl">
                <button onClick={() => setForm(f=>({...f,order_taken:!f.order_taken}))}
                  className={`w-10 h-6 rounded-full transition-colors relative ${form.order_taken ? 'bg-teal' : 'bg-border'}`}>
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.order_taken ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0.5 rtl:-translate-x-0.5'}`} />
                </button>
                <span className="text-sm font-semibold text-text">تم أخذ طلب</span>
                {form.order_taken && (
                  <div className="flex-1 flex items-center gap-1 border border-border rounded-xl px-2 py-1.5 bg-surface">
                    <span className="text-xs text-muted">$</span>
                    <input type="number" value={form.order_amount}
                      onChange={e => setForm(f=>({...f,order_amount:e.target.value}))}
                      placeholder="0" className="flex-1 text-xs bg-transparent outline-none text-text" />
                  </div>
                )}
              </div>

              {/* Next visit */}
              <div>
                <label className="text-xs font-bold text-muted block mb-1.5">📅 موعد الزيارة التالية (اختياري)</label>
                <input type="date" value={form.next_visit_date}
                  onChange={e => setForm(f=>({...f,next_visit_date:e.target.value}))} className={INP} />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-muted block mb-1.5">📝 ملاحظات</label>
                <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))}
                  rows={2} placeholder="اكتب أي ملاحظات..." className={`${INP} resize-none`} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-border/40 shrink-0">
          {step === 'details' && (
            <button onClick={() => setStep('client')}
              className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition">
              ← رجوع
            </button>
          )}
          {step === 'client' ? null : (
            <button onClick={handleSave} disabled={saving || (newClientMode && !form.client_name)}
              className="flex-1 py-2.5 rounded-xl bg-teal text-white text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition">
              {saving ? '⏳ جاري الحفظ...' : '✓ تسجيل الزيارة'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Client Card ───────────────────────────────────────────────
function ClientCard({ client, visitCount, lastVisit, onVisit }) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal/10 flex items-center justify-center text-xl shrink-0">
          {CLIENT_TYPES.find(t => t.key === client.type)?.icon ?? '🏪'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text truncate">{client.name}</p>
          <p className="text-[10px] text-muted">{client.code} · {client.city ?? '—'} · {client.phone ?? '—'}</p>
        </div>
        <button onClick={() => onVisit(client)}
          className="px-3 py-1.5 rounded-xl bg-teal/10 text-teal text-xs font-bold hover:bg-teal/20 transition shrink-0">
          + زيارة
        </button>
      </div>
      <div className="px-4 pb-3 flex items-center gap-4 text-[11px] text-muted border-t border-border/40 pt-2.5">
        <span>📋 {visitCount} زيارة</span>
        {lastVisit && <span>🕒 آخر زيارة: {fmtDate(lastVisit)}</span>}
        {client.total_orders > 0 && <span>🛒 {client.total_orders} طلب</span>}
        <span className={`mr-auto px-1.5 py-0.5 rounded-full font-semibold ${client.status === 'active' ? 'bg-green-bg text-green-fg' : 'bg-surface-alt text-muted'}`}>
          {client.status === 'active' ? 'نشط' : 'غير نشط'}
        </span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Screen
// ══════════════════════════════════════════════════════════════
export default function FieldCRMScreen() {
  const { id: repId, name: repName, role } = useAuth();
  const isAdmin = [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER].includes(role);

  const [tab, setTab]           = useState('today');   // 'today' | 'clients' | 'stats'
  const [visits, setVisits]     = useState([]);
  const [clients, setClients]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [preselected, setPreselected] = useState(null);
  const [search, setSearch]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [vRes, cRes] = await Promise.all([
        isAdmin
          ? supabase.from('crm_visits').select('*').eq('visit_date', today).order('created_at', { ascending: false })
          : supabase.from('crm_visits').select('*').eq('rep_id', repId).eq('visit_date', today).order('created_at', { ascending: false }),
        isAdmin
          ? supabase.from('crm_clients').select('*').order('name')
          : supabase.from('crm_clients').select('*').eq('rep_id', repId).order('name'),
      ]);
      setVisits(vRes.data ?? []);
      setClients(cRes.data ?? []);
    } catch {}
    finally { setLoading(false); }
  }, [isAdmin, repId]);

  useEffect(() => { load(); }, [load]);

  // Visit counts per client
  const visitCounts = useMemo(() => {
    const map = {};
    visits.forEach(v => { map[v.client_id] = (map[v.client_id] ?? 0) + 1; });
    return map;
  }, [visits]);

  const todayStats = useMemo(() => ({
    total:    visits.length,
    orders:   visits.filter(v => v.order_taken).length,
    revenue:  visits.reduce((s, v) => s + (v.order_amount ?? 0), 0),
    pending:  visits.filter(v => v.outcome === 'follow_up').length,
  }), [visits]);

  const filteredClients = useMemo(() =>
    clients.filter(c =>
      !search || c.name.includes(search) || c.code.includes(search) || (c.city ?? '').includes(search)
    )
  , [clients, search]);

  return (
    <div className="space-y-4 pb-24 sm:pb-8" dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-text">الزيارات الميدانية</h1>
          <p className="text-sm text-muted mt-0.5">
            {new Date().toLocaleDateString('ar-SA-u-nu-latn-ca-gregory', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button onClick={() => { setPreselected(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal text-white text-sm font-bold hover:bg-teal/90 shadow-sm transition shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          تسجيل زيارة
        </button>
      </div>

      {/* Today KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: '🚶', label: 'زيارات اليوم', value: todayStats.total,              color: 'text-text' },
          { icon: '🛒', label: 'طلبات',         value: todayStats.orders,             color: 'text-teal' },
          { icon: '💵', label: 'مبيعات اليوم',  value: `$${todayStats.revenue.toFixed(0)}`, color: 'text-green-fg' },
          { icon: '📞', label: 'متابعة',         value: todayStats.pending,            color: 'text-amber-fg' },
        ].map(s => (
          <div key={s.label} className="bg-surface border border-border rounded-2xl p-4 text-center">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className={`text-xl font-extrabold ${s.color}`}>{loading ? '…' : s.value}</div>
            <div className="text-[11px] text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-alt rounded-2xl border border-border">
        {[
          { key: 'today',   label: `اليوم (${visits.length})` },
          { key: 'clients', label: `العملاء (${clients.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition ${tab === t.key ? 'bg-surface text-text shadow-sm border border-border' : 'text-muted'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Today Visits */}
      {tab === 'today' && (
        loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 bg-surface-alt animate-pulse rounded-2xl" />)}
          </div>
        ) : visits.length === 0 ? (
          <div className="bg-surface border border-border rounded-2xl p-10 text-center">
            <p className="text-4xl mb-3">🚶</p>
            <p className="text-base font-bold text-text">لا توجد زيارات مسجلة اليوم</p>
            <p className="text-xs text-muted mt-1">ابدأ بتسجيل أول زيارة</p>
            <button onClick={() => setShowModal(true)}
              className="mt-4 px-4 py-2 rounded-xl bg-teal text-white text-sm font-bold hover:bg-teal/90 transition">
              + تسجيل زيارة
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {visits.map(v => (
              <div key={v.id} className="bg-surface border border-border rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-surface-alt flex items-center justify-center text-lg shrink-0">🏪</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-text truncate">{v.client_name ?? 'عميل'}</p>
                  <p className="text-[10px] text-muted">
                    {v.rep_name && isAdmin ? `${v.rep_name} · ` : ''}
                    {new Date(v.visited_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                    {v.order_amount > 0 ? ` · $${v.order_amount}` : ''}
                  </p>
                </div>
                <OutcomeBadge outcome={v.outcome} />
              </div>
            ))}
          </div>
        )
      )}

      {/* Clients List */}
      {tab === 'clients' && (
        <>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="ابحث في العملاء..."
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface text-text focus:border-teal focus:outline-none transition" />
          {filteredClients.length === 0 ? (
            <div className="bg-surface border border-border rounded-2xl p-8 text-center">
              <p className="text-3xl mb-2">🏪</p>
              <p className="text-sm text-muted">لا عملاء — ابدأ بإضافة أول زيارة</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredClients.map(c => (
                <ClientCard
                  key={c.id} client={c}
                  visitCount={visitCounts[c.id] ?? 0}
                  lastVisit={c.last_order_at}
                  onVisit={cl => { setPreselected(cl); setShowModal(true); }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Visit Modal */}
      {showModal && (
        <VisitModal
          clients={clients}
          repId={repId}
          repName={repName}
          onSave={load}
          onClose={() => { setShowModal(false); setPreselected(null); }}
        />
      )}

      {/* Floating Action Button — always visible for quick visit entry */}
      <button
        onClick={() => { setPreselected(null); setShowModal(true); }}
        className="fixed bottom-24 end-5 z-40 w-14 h-14 rounded-full bg-teal text-white shadow-2xl flex items-center justify-center text-2xl hover:bg-teal/90 active:scale-95 transition-transform md:bottom-8"
        aria-label="تسجيل زيارة سريعة"
        title="تسجيل زيارة سريعة"
      >
        🚶
      </button>
    </div>
  );
}
