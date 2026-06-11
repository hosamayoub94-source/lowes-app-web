// =============================================================
// SocialTeamScreen — إدارة فريق السوشال بسرعة (لأليس + الأدمن)
// إضافة/تعطيل/إعادة تفعيل موظفي ميديا. الإضافة عبر edge function.
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@services/supabase';
import { useAuth } from '@hooks/useAuth';
import { useToast } from '@hooks/useToast';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;

export default function SocialTeamScreen() {
  const { role } = useAuth();
  const toast = useToast();
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState(false);
  const [name, setName]       = useState('');
  const [title, setTitle]     = useState('');
  const [pin, setPin]         = useState('1234');
  const [busy, setBusy]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles')
      .select('id, employee_name, job_title, is_active, role_type')
      .eq('team', 'ميديا')
      .order('is_active', { ascending: false })
      .order('employee_name');
    setRows(data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const call = async (body) => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-employee`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, requesterRole: role }),
    });
    return res.json();
  };

  const addEmployee = async () => {
    if (!name.trim()) { toast.error('اكتب الاسم'); return; }
    setBusy(true);
    const r = await call({ action: 'add', employee_name: name.trim(), job_title: title.trim(), pin });
    setBusy(false);
    if (r.ok) {
      toast.success(`أُضيف ${r.profile.employee_name} · PIN ${r.pin}`);
      setName(''); setTitle(''); setPin('1234'); setAdding(false);
      load();
    } else {
      toast.error(r.message || 'تعذّرت الإضافة');
    }
  };

  const toggle = async (row) => {
    setBusy(true);
    const r = await call({ action: row.is_active ? 'deactivate' : 'reactivate', target_id: row.id });
    setBusy(false);
    if (r.ok) { toast.success(row.is_active ? 'تم التعطيل' : 'تمت إعادة التفعيل'); load(); }
    else toast.error(r.message || 'تعذّر التغيير');
  };

  const active = rows.filter(r => r.is_active);
  const inactive = rows.filter(r => !r.is_active);

  return (
    <div className="max-w-2xl mx-auto pb-24 space-y-4" dir="rtl">
      <div className="bg-navy rounded-2xl p-5 text-white">
        <h1 className="text-xl font-extrabold flex items-center gap-2">🌐 فريق السوشال</h1>
        <p className="text-white/70 text-xs mt-1">أضف أو عطّل موظفي السوشال بسرعة — للتعامل مع تغيّر الفريق</p>
      </div>

      {/* Add */}
      {!adding ? (
        <button onClick={() => setAdding(true)}
          className="w-full py-3 rounded-2xl bg-teal text-navy font-bold hover:bg-teal/90 transition flex items-center justify-center gap-2">
          + إضافة موظف سوشال
        </button>
      ) : (
        <div className="bg-surface border border-teal/30 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-bold text-text">موظف جديد</p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="الاسم *"
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="الصفة (مصمم / محرر / نشر…)"
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted">PIN:</label>
            <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} maxLength={4}
              className="w-20 border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text text-center focus:outline-none focus:ring-2 focus:ring-teal/30" />
            <span className="text-[11px] text-muted">يغيّره الموظف لاحقاً</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setAdding(false); setName(''); setTitle(''); }}
              className="flex-1 py-2.5 rounded-xl border border-border text-text font-semibold hover:bg-surface-alt transition">إلغاء</button>
            <button onClick={addEmployee} disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-teal text-navy font-bold hover:bg-teal/90 transition disabled:opacity-50">
              {busy ? 'جارٍ…' : 'إضافة'}
            </button>
          </div>
        </div>
      )}

      {/* Active */}
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-xs font-bold text-muted mb-2">النشطون ({active.length})</p>
        {loading ? <p className="text-sm text-muted py-3 text-center">جارٍ التحميل…</p>
          : active.length === 0 ? <p className="text-sm text-muted py-3 text-center">لا أحد بعد</p>
          : (
            <div className="space-y-1.5">
              {active.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-alt">
                  <div className="w-8 h-8 rounded-full bg-teal/15 text-teal grid place-items-center font-bold text-sm shrink-0">
                    {r.employee_name?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-text truncate">{r.employee_name}</p>
                    <p className="text-[11px] text-muted truncate">{r.job_title || 'فريق السوشال'}</p>
                  </div>
                  <button onClick={() => toggle(r)} disabled={busy}
                    className="text-xs font-semibold text-red-500 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                    تعطيل
                  </button>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Inactive */}
      {inactive.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-4">
          <p className="text-xs font-bold text-muted mb-2">معطّلون ({inactive.length})</p>
          <div className="space-y-1.5">
            {inactive.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-alt opacity-70">
                <div className="w-8 h-8 rounded-full bg-muted/15 text-muted grid place-items-center font-bold text-sm shrink-0">
                  {r.employee_name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text truncate">{r.employee_name}</p>
                  <p className="text-[11px] text-muted truncate">{r.job_title || 'فريق السوشال'}</p>
                </div>
                <button onClick={() => toggle(r)} disabled={busy}
                  className="text-xs font-semibold text-teal hover:bg-teal/10 px-3 py-1.5 rounded-lg transition disabled:opacity-50">
                  إعادة تفعيل
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
