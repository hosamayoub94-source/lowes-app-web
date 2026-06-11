// =============================================================
// AdvanceRequestsScreen — طلبات السلف والخصم والمكافآت
// الموظف يقدّم الطلب، المدير يوافق أو يرفض
// Table: advance_requests
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@services/supabase';
import { useAuth }  from '@hooks/useAuth';
import { ROLES }    from '@data/teams';

const TYPE_CONFIG = {
  advance:   { label: 'سلفة',    icon: '💵', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  deduction: { label: 'خصم',     icon: '📉', color: 'text-red-600 bg-red-50 border-red-200' },
  bonus:     { label: 'مكافأة',  icon: '🎁', color: 'text-teal bg-teal/10 border-teal/20' },
};

const STATUS_CONFIG = {
  pending:  { label: 'قيد المراجعة', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  approved: { label: 'موافق عليه',   color: 'text-green-600 bg-green-50 border-green-200' },
  rejected: { label: 'مرفوض',        color: 'text-red-600 bg-red-50 border-red-200' },
};

const CURRENCIES = ['USD', 'TRY', 'AED', 'SAR'];

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'الآن';
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  return `منذ ${d} يوم`;
}

// ── Star / badge row ──────────────────────────────────────────
function Badge({ cfg, small }) {
  const sz = small ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-semibold ${sz} ${cfg.color}`}>
      {cfg.icon && <span>{cfg.icon}</span>}{cfg.label}
    </span>
  );
}

// ── New request form modal ────────────────────────────────────
function RequestFormModal({ onClose, onSaved, name }) {
  const [type, setType]       = useState('advance');
  const [amount, setAmount]   = useState('');
  const [currency, setCur]    = useState('USD');
  const [reason, setReason]   = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

  const save = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError('أدخل مبلغاً صحيحاً'); return;
    }
    setSaving(true); setError(null);
    const { error: e } = await supabase.from('advance_requests').insert({
      employee_name: name,
      type,
      amount: Number(amount),
      currency,
      reason: reason.trim() || null,
      status: 'pending',
    });
    setSaving(false);
    if (e) { setError(e.message); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" dir="rtl">
      <div className="bg-surface rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-base font-extrabold text-text">طلب جديد</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt text-muted hover:text-text flex items-center justify-center text-lg transition">✕</button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {/* Type selector */}
          <div>
            <p className="text-xs font-bold text-muted mb-2">نوع الطلب</p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setType(key)}
                  className={`rounded-2xl border py-2.5 text-sm font-bold transition flex flex-col items-center gap-1
                    ${type === key ? cfg.color : 'border-border text-muted hover:border-teal/30 hover:text-teal'}`}
                >
                  <span className="text-lg">{cfg.icon}</span>
                  <span>{cfg.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Amount + currency */}
          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-xs font-bold text-muted mb-1.5">المبلغ</p>
              <input
                type="number"
                min="1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm font-bold text-text focus:outline-none focus:border-teal transition text-right"
              />
            </div>
            <div>
              <p className="text-xs font-bold text-muted mb-1.5">العملة</p>
              <select
                value={currency}
                onChange={e => setCur(e.target.value)}
                className="h-[42px] bg-surface-alt border border-border rounded-xl px-2 text-sm font-bold text-text focus:outline-none focus:border-teal transition"
              >
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Reason */}
          <div>
            <p className="text-xs font-bold text-muted mb-1.5">السبب (اختياري)</p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="اكتب سبب الطلب..."
              className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text focus:outline-none focus:border-teal transition resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="w-full py-3 rounded-2xl bg-teal text-navy font-extrabold text-sm hover:bg-teal/90 active:scale-95 transition disabled:opacity-50"
          >
            {saving ? 'جاري الإرسال...' : 'إرسال الطلب'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manager approval card ─────────────────────────────────────
function ManagerRequestCard({ req, onUpdate }) {
  const [notes, setNotes] = useState('');
  const [open, setOpen]   = useState(false);
  const [saving, setSaving] = useState(false);

  const respond = async (status) => {
    setSaving(true);
    await supabase.from('advance_requests').update({
      status,
      response_notes: notes.trim() || null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', req.id);
    setSaving(false);
    onUpdate();
  };

  const cfg = TYPE_CONFIG[req.type] || TYPE_CONFIG.advance;
  const sc  = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-right hover:bg-surface-alt/50 transition"
      >
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-xl shrink-0 ${cfg.color}`}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-text">{req.employee_name}</p>
            <Badge cfg={cfg} small />
            <Badge cfg={sc} small />
          </div>
          <p className="text-xs text-muted mt-0.5">
            {req.amount} {req.currency} · {timeAgo(req.created_at)}
          </p>
        </div>
        <span className={`text-muted text-sm transition-transform ${open ? 'rotate-90' : ''}`}>‹</span>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3 space-y-3 bg-surface-alt/30" dir="rtl">
          {req.reason && (
            <p className="text-xs text-muted bg-surface rounded-xl px-3 py-2">السبب: {req.reason}</p>
          )}
          {req.status === 'pending' && (
            <>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="ملاحظة (اختياري)"
                rows={2}
                className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-xs text-text resize-none focus:outline-none focus:border-teal"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => respond('approved')}
                  disabled={saving}
                  className="flex-1 py-2 rounded-xl bg-green-500 text-white text-xs font-bold hover:bg-green-600 transition disabled:opacity-50"
                >✅ موافقة</button>
                <button
                  onClick={() => respond('rejected')}
                  disabled={saving}
                  className="flex-1 py-2 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition disabled:opacity-50"
                >❌ رفض</button>
              </div>
            </>
          )}
          {req.status !== 'pending' && req.response_notes && (
            <p className="text-xs text-muted bg-surface rounded-xl px-3 py-2">
              ملاحظة الإدارة: {req.response_notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── My request card ───────────────────────────────────────────
function MyRequestCard({ req }) {
  const cfg = TYPE_CONFIG[req.type] || TYPE_CONFIG.advance;
  const sc  = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
  return (
    <div className="flex items-center gap-3 bg-surface border border-border rounded-2xl px-4 py-3.5">
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-xl shrink-0 ${cfg.color}`}>
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-text">{req.amount} {req.currency}</p>
          <Badge cfg={cfg} small />
        </div>
        {req.reason && <p className="text-xs text-muted mt-0.5 truncate">{req.reason}</p>}
        <p className="text-[10px] text-muted/70 mt-0.5">{timeAgo(req.created_at)}</p>
      </div>
      <Badge cfg={sc} small />
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function AdvanceRequestsScreen() {
  const { name, role } = useAuth();
  const isManager = [ROLES.ADMIN, ROLES.MANAGER].includes(role);

  const [myRequests,  setMyRequests]  = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [formOpen,    setFormOpen]    = useState(false);
  const [tab,         setTab]         = useState('pending');

  const load = useCallback(async () => {
    setLoading(true);
    if (isManager) {
      const { data } = await supabase.from('advance_requests')
        .select('*').order('created_at', { ascending: false });
      setAllRequests(data ?? []);
    } else {
      const { data } = await supabase.from('advance_requests')
        .select('*').eq('employee_name', name).order('created_at', { ascending: false });
      setMyRequests(data ?? []);
    }
    setLoading(false);
  }, [name, isManager]);

  useEffect(() => { load(); }, [load]);

  const pendingAll  = allRequests.filter(r => r.status === 'pending');
  const resolvedAll = allRequests.filter(r => r.status !== 'pending');
  const displayAll  = tab === 'pending' ? pendingAll : resolvedAll;

  return (
    <div className="space-y-5 pb-6" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl font-extrabold text-text">السلف والخصومات</h1>
          <p className="text-xs text-muted mt-0.5">
            {isManager ? 'إدارة طلبات الموظفين' : 'تقديم وتتبع طلباتك'}
          </p>
        </div>
        {!isManager && (
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 active:scale-95 transition shadow-sm"
          >
            + طلب
          </button>
        )}
      </div>

      {/* Manager stats row */}
      {isManager && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'قيد المراجعة', val: pendingAll.length, color: 'text-amber-600', bg: 'bg-amber-50', icon: '⏳' },
            { label: 'تمت الموافقة', val: allRequests.filter(r=>r.status==='approved').length, color: 'text-green-600', bg: 'bg-green-50', icon: '✅' },
            { label: 'مرفوضة',       val: allRequests.filter(r=>r.status==='rejected').length, color: 'text-red-500', bg: 'bg-red-50', icon: '❌' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-2xl px-3 py-3 text-center border border-border`}>
              <p className="text-xl font-extrabold text-text">{s.val}</p>
              <p className={`text-[10px] font-bold ${s.color} mt-0.5`}>{s.icon} {s.label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-surface-alt animate-pulse rounded-2xl" />)}
        </div>
      ) : isManager ? (
        <>
          {/* Tab switcher */}
          <div className="flex gap-2 bg-surface-alt rounded-2xl p-1">
            {[['pending','قيد المراجعة'], ['resolved','المُعالجة']].map(([key, lbl]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold transition ${
                  tab === key ? 'bg-teal text-navy shadow' : 'text-muted hover:text-text'
                }`}
              >
                {lbl}
                {key === 'pending' && pendingAll.length > 0 && (
                  <span className="ms-1.5 bg-white/30 rounded-full px-1.5 text-xs">{pendingAll.length}</span>
                )}
              </button>
            ))}
          </div>

          {displayAll.length === 0 ? (
            <div className="text-center py-16 text-muted">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-sm font-semibold">لا توجد طلبات {tab === 'pending' ? 'معلقة' : 'معالجة'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayAll.map(r => (
                <ManagerRequestCard key={r.id} req={r} onUpdate={load} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* My requests */}
          {myRequests.length === 0 ? (
            <div className="text-center py-16 text-muted">
              <p className="text-4xl mb-3">📄</p>
              <p className="text-sm font-semibold">لا توجد طلبات بعد</p>
              <p className="text-xs mt-1">اضغط "+ طلب" لتقديم طلب سلفة أو خصم</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myRequests.map(r => <MyRequestCard key={r.id} req={r} />)}
            </div>
          )}
        </>
      )}

      {formOpen && (
        <RequestFormModal
          name={name}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); load(); }}
        />
      )}
    </div>
  );
}
