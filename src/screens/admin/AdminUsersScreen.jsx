// =============================================================
// AdminUsersScreen — employee management with extended profile fields
// (chunk rebuild marker: distribution roles in role picker — 2026-06-08)
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@hooks/useAuth';
import PermissionsEditor from '@components/feature/PermissionsEditor';
// مصدر الحقيقة للأدوار (يشمل أدوار التوزيع + الإدارة) — لا تكرّر القائمة محلياً.
import { ROLE_LABELS } from '@data/teams';

const ROLE_COLORS = {
  admin:          'bg-purple-bg text-purple-fg',
  manager:        'bg-blue-bg text-blue-fg',
  sales_manager:  'bg-teal/10 text-teal',
  social_manager: 'bg-red-bg text-red-fg',
  media_buyer:    'bg-amber-bg text-amber-fg',
  employee:       'bg-surface-alt text-muted',
};

const TEAM_OPTIONS = ['عام', 'ميديا', 'سوريا', 'تركيا', 'إدارة', 'مبيعات', 'دبي', 'إسطنبول', 'دمشق', 'الرياض', ''];

const SHIFT_OPTIONS = [
  { value: 'morning',  label: '🌅 صباحي (09:00–17:00)' },
  { value: 'evening',  label: '🌇 مسائي (14:00–22:00)' },
  { value: 'night',    label: '🌙 ليلي  (22:00–06:00)' },
  { value: 'flexible', label: '🕐 مرن' },
];

const REST_DAY_OPTIONS = ['الجمعة', 'السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

// Mini level helper
const LEVELS = [
  { min: 500, icon: '🏆', label: 'أسطورة' },
  { min: 300, icon: '💎', label: 'خبير'   },
  { min: 150, icon: '🔥', label: 'محترف'  },
  { min: 50,  icon: '⭐', label: 'نجم'    },
  { min: 0,   icon: '🌱', label: 'مبتدئ' },
];
const getLevel = (pts = 0) => LEVELS.find(l => pts >= l.min) || LEVELS[LEVELS.length - 1];

// ── SQL migration snippets ────────────────────────────────────
const MIGRATION_SQL = `ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS shift_type  text DEFAULT 'morning',
  ADD COLUMN IF NOT EXISTS work_start  time DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS work_end    time DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS rest_day    text,
  ADD COLUMN IF NOT EXISTS page_name   text,
  ADD COLUMN IF NOT EXISTS admin_notes text;`;

// SQL for admin PIN reset function (run once in Supabase SQL Editor)
const RESET_PIN_SQL = `-- دالة تغيير PIN من قبل الأدمن (نفّذها مرة واحدة في SQL Editor)
CREATE OR REPLACE FUNCTION admin_reset_pin(
  target_employee_name text,
  new_pin text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  target_id uuid;
  synth_email text;
BEGIN
  -- التحقق أن المستدعي أدمن أو مدير
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role_type IN ('admin','manager')
  ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT id INTO target_id FROM profiles
  WHERE employee_name = target_employee_name LIMIT 1;
  IF target_id IS NULL THEN RETURN false; END IF;

  synth_email := target_id::text || '@auth.lowes-pro.local';
  UPDATE auth.users
  SET encrypted_password = crypt('lp:' || new_pin, gen_salt('bf', 10))
  WHERE email = synth_email;
  RETURN true;
END;$$;
REVOKE ALL ON FUNCTION admin_reset_pin FROM public;
GRANT EXECUTE ON FUNCTION admin_reset_pin TO authenticated;`;

// ── Data layer ────────────────────────────────────────────────
async function fetchProfiles() {
  const { supabase } = await import('@services/supabase');

  const extCols = 'id,employee_name,role_type,team,manager_scope,is_active,avatar_url,created_at,total_points,shift_type,work_start,work_end,rest_day,page_name,admin_notes,birthday,join_date,base_salary_usd,housing_allowance_usd,transport_allowance_usd,commission_pct,extra_permissions,denied_permissions,seller_type,rep_level,mlm_rank,invite_code,wallet_balance';
  const { data, error } = await supabase
    .from('profiles').select(extCols).order('role_type').order('employee_name');

  if (error?.message?.includes('does not exist')) {
    // Columns not migrated yet — fall back to base columns
    const res = await supabase
      .from('profiles')
      .select('id,employee_name,role_type,team,manager_scope,is_active,avatar_url,created_at,total_points')
      .order('role_type').order('employee_name');
    if (res.error) throw new Error(res.error.message);
    return { profiles: res.data ?? [], hasExtCols: false };
  }

  if (error) throw new Error(error.message);
  return { profiles: data ?? [], hasExtCols: true };
}

async function updateProfile(id, patch) {
  const { supabase } = await import('@services/supabase');
  const { error } = await supabase
    .from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

async function adminResetPin(employeeName, newPin) {
  if (!/^\d{4}$/.test(String(newPin))) throw new Error('PIN يجب أن يكون 4 أرقام');
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase.rpc('admin_reset_pin', {
    target_employee_name: employeeName,
    new_pin: String(newPin),
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('الموظف غير موجود أو لم يتم إنشاء حساب Auth له');
  return true;
}

// ── Form defaults ─────────────────────────────────────────────
const EMPTY_FORM = {
  employee_name: '', role_type: 'employee', team: '', manager_scope: '', is_active: true,
  seller_type: 'online', rep_level: 'junior', mlm_rank: 'bronze',
  shift_type: 'morning', work_start: '09:00', work_end: '17:00', rest_day: '', page_name: '', admin_notes: '',
  birthday: '', join_date: '',
  base_salary_usd: '', housing_allowance_usd: '', transport_allowance_usd: '',
  commission_pct: '',
  extra_permissions: [],
  denied_permissions: [],
};

// أدوار شبكة المبيعات — صلاحياتها تلقائية (لا شبكة صلاحيات إدارية).
const SALES_ROLES = ['field_rep', 'marketer', 'supervisor', 'supervisor_manager', 'area_agent'];
// نوع البائع يُشتق تلقائياً من الدور (المالك يختار الدور فقط).
const sellerTypeForRole = (r) =>
  ['field_rep', 'area_agent'].includes(r) ? 'field_rep'
    : ['marketer', 'supervisor', 'supervisor_manager'].includes(r) ? 'marketer'
      : 'online';

// ── Input helpers ─────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-muted mb-1 block">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30';
const selectCls = inputCls;

// ── SQL banners ───────────────────────────────────────────────
function SQLBanner({ title, desc, sql, onDismiss }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(sql).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <div className="bg-amber-bg border border-amber/30 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-amber-fg">⚠️ {title}</p>
          <p className="text-xs text-muted mt-0.5">{desc}</p>
        </div>
        {onDismiss && <button onClick={onDismiss} className="text-muted hover:text-text text-lg leading-none shrink-0">×</button>}
      </div>
      <pre className="text-[11px] font-mono bg-surface rounded-lg p-3 overflow-x-auto text-text whitespace-pre-wrap max-h-48">
        {sql}
      </pre>
      <button onClick={copy} className="px-3 py-1.5 rounded-lg bg-teal text-navy text-xs font-semibold hover:bg-teal/90 transition">
        {copied ? '✓ تم النسخ' : 'نسخ SQL'}
      </button>
    </div>
  );
}

// ── PIN Reset Modal ───────────────────────────────────────────
function PinResetModal({ employee, onClose }) {
  const [newPin, setNewPin]   = useState('');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState(null);
  const [done, setDone]       = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(newPin)) { setErr('PIN يجب أن يكون 4 أرقام'); return; }
    setSaving(true); setErr(null);
    try {
      await adminResetPin(employee.employee_name, newPin);
      setDone(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!employee) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => onClose()}>
      <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()} dir="rtl">
        <h3 className="font-bold text-lg text-text mb-1">🔑 تغيير PIN</h3>
        <p className="text-sm text-muted mb-4">{employee.employee_name}</p>
        {done ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-4xl">✅</div>
            <p className="text-sm font-semibold text-green-fg">تم تغيير PIN بنجاح</p>
            <button onClick={onClose} className="w-full py-2 rounded-xl bg-teal text-navy text-sm font-semibold">إغلاق</button>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="text-xs text-muted mb-1 block">PIN الجديد (4 أرقام)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0,4))}
                placeholder="••••"
                className="w-full border border-border rounded-xl px-3 py-3 text-center text-2xl tracking-[0.5em] bg-surface-alt text-text focus:outline-none focus:ring-2 focus:ring-teal/30"
                autoFocus
              />
            </div>
            {err && (
              <div className="text-xs text-red-fg bg-red-bg border border-red/20 rounded-lg px-3 py-2">
                ⚠️ {err}
                {err.includes('function') && (
                  <p className="mt-1 text-[10px]">
                    نفّذ SQL التالي في Supabase أولاً (زر «إعداد مطلوب» أعلى الصفحة)
                  </p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button type="submit" disabled={saving || newPin.length !== 4}
                className="flex-1 py-2 rounded-xl bg-teal text-navy text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition"
              >
                {saving ? 'جار التغيير…' : 'تأكيد'}
              </button>
              <button type="button" onClick={onClose}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-text hover:bg-surface-alt transition"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function AdminUsersScreen() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [profiles, setProfiles]       = useState([]);
  const [hasExtCols, setHasExtCols]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [search, setSearch]           = useState('');
  const [roleFilter, setRoleFilter]   = useState('all');
  const [editUser, setEditUser]       = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState(null);
  const [showAdd, setShowAdd]         = useState(false);
  const [showMigration, setShowMigration]   = useState(true);
  const [showPinSetup, setShowPinSetup]     = useState(true);
  const [pinResetUser, setPinResetUser]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetchProfiles();
      setProfiles(res.profiles);
      setHasExtCols(res.hasExtCols);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filtering ────────────────────────────────────────────────
  const filtered = profiles.filter(p => {
    const q = search.toLowerCase();
    return (!search || p.employee_name?.toLowerCase().includes(q) || p.team?.toLowerCase().includes(q))
      && (roleFilter === 'all' || p.role_type === roleFilter);
  });

  // ── Edit ─────────────────────────────────────────────────────
  const openEdit = (p) => {
    setEditUser(p);
    setForm({
      employee_name: p.employee_name ?? '',
      role_type:     p.role_type ?? 'employee',
      seller_type:   p.seller_type ?? 'online',
      rep_level:     p.rep_level ?? 'junior',
      mlm_rank:      p.mlm_rank ?? 'bronze',
      team:          p.team ?? '',
      manager_scope: p.manager_scope ?? '',
      is_active:     p.is_active ?? true,
      shift_type:    p.shift_type ?? 'morning',
      work_start:    p.work_start ?? '09:00',
      work_end:      p.work_end ?? '17:00',
      rest_day:      p.rest_day ?? '',
      page_name:     p.page_name ?? '',
      admin_notes:   p.admin_notes ?? '',
      birthday:      p.birthday ?? '',
      join_date:     p.join_date ?? '',
      base_salary_usd:         p.base_salary_usd         ?? '',
      housing_allowance_usd:   p.housing_allowance_usd   ?? '',
      transport_allowance_usd: p.transport_allowance_usd ?? '',
      commission_pct:          p.commission_pct          ?? '',
      extra_permissions:       Array.isArray(p.extra_permissions) ? p.extra_permissions : [],
      denied_permissions:      Array.isArray(p.denied_permissions) ? p.denied_permissions : [],
    });
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!form.employee_name.trim()) { setSaveError('اسم الموظف مطلوب'); return; }
    setSaving(true); setSaveError(null);
    try {
      const patch = {
        employee_name: form.employee_name.trim(),
        role_type:     form.role_type,
        team:          form.team || null,
        manager_scope: form.manager_scope || null,
        is_active:     form.is_active,
      };
      if (hasExtCols) {
        patch.shift_type  = form.shift_type || null;
        patch.work_start  = form.work_start || null;
        patch.work_end    = form.work_end || null;
        patch.rest_day    = form.rest_day || null;
        patch.page_name   = form.page_name.trim() || null;
        patch.admin_notes = form.admin_notes.trim() || null;
        patch.birthday    = form.birthday  || null;
        patch.join_date   = form.join_date || null;
      }
      // Salary + permissions (safe to send even if columns just added)
      patch.base_salary_usd         = form.base_salary_usd         === '' ? 0 : Number(form.base_salary_usd);
      patch.housing_allowance_usd   = form.housing_allowance_usd   === '' ? 0 : Number(form.housing_allowance_usd);
      patch.transport_allowance_usd = form.transport_allowance_usd === '' ? 0 : Number(form.transport_allowance_usd);
      patch.commission_pct          = form.commission_pct          === '' ? 0 : Number(form.commission_pct);
      patch.extra_permissions       = Array.isArray(form.extra_permissions) ? form.extra_permissions : [];
      patch.denied_permissions      = Array.isArray(form.denied_permissions) ? form.denied_permissions : [];
      // ── Distribution: seller type + level/rank ──
      const st = sellerTypeForRole(form.role_type);
      patch.seller_type = st;
      patch.rep_level   = st === 'field_rep' ? (form.rep_level || 'junior') : null;
      patch.mlm_rank    = st === 'marketer'  ? (form.mlm_rank  || 'bronze') : null;
      await updateProfile(editUser.id, patch);

      // ── Auto-sync chat channel membership when team changes ──
      const oldTeam = editUser.team;
      const newTeam = form.team;
      if (oldTeam !== newTeam) {
        try {
          const { supabase } = await import('@services/supabase');
          const { data: chatRooms } = await supabase.from('chat_rooms').select('id,team,name').eq('type','group');
          if (chatRooms?.length) {
            // Remove from old team channel (but not 💬 عام)
            if (oldTeam) {
              const oldRoom = chatRooms.find(r => r.team === oldTeam && r.name !== '💬 عام');
              if (oldRoom) await supabase.from('chat_room_members').delete().eq('room_id', oldRoom.id).eq('user_id', editUser.id);
            }
            // Add to new team channel
            if (newTeam) {
              const newRoom = chatRooms.find(r => r.team === newTeam && r.name !== '💬 عام');
              if (newRoom) await supabase.from('chat_room_members').upsert(
                { room_id: newRoom.id, user_id: editUser.id, user_name: form.employee_name.trim(), display_name: form.employee_name.trim(), role: 'member', joined_at: new Date().toISOString() },
                { onConflict: 'room_id,user_id' }
              );
            }
          }
        } catch { /* chat sync is best-effort — don't block save */ }
      }

      setProfiles(ps => ps.map(p => p.id === editUser.id ? { ...p, ...patch } : p));
      setEditUser(null);
    } catch (e) { setSaveError(e.message); }
    finally { setSaving(false); }
  };

  // ── Toggle active ─────────────────────────────────────────────
  const toggleActive = async (p) => {
    try {
      await updateProfile(p.id, { is_active: !p.is_active });
      setProfiles(ps => ps.map(x => x.id === p.id ? { ...x, is_active: !p.is_active } : x));
    } catch (e) { setError(e.message); }
  };

  // ── Permanent delete (admin only) ─────────────────────────────
  // تأكيد مزدوج: تحذير + كتابة الاسم بالضبط — يمنع الحذف العَرَضي.
  const handleDelete = async (p) => {
    if (!window.confirm(
      `⚠️ حذف نهائي لـ«${p.employee_name}»؟\n\n` +
      `يُمسح الحساب من القاعدة نهائياً ولا يمكن التراجع. ` +
      `للإيقاف المؤقت استخدم «تعطيل» بدلاً منه.`,
    )) return;
    const typed = window.prompt(`للتأكيد، اكتب اسم الحساب بالضبط:\n\n${p.employee_name}`);
    if (typed == null) return;                       // ألغى
    if (typed.trim() !== p.employee_name) { window.alert('الاسم غير مطابق — أُلغي الحذف.'); return; }
    try {
      const URL  = import.meta.env.VITE_SUPABASE_URL;
      const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${URL}/functions/v1/manage-employee`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', requesterRole: role, target_id: p.id }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || 'تعذّر الحذف');
      setProfiles(ps => ps.filter(x => x.id !== p.id));
    } catch (e) { setError(e.message); }
  };

  // ── Add employee ──────────────────────────────────────────────
  const [addForm, setAddForm]     = useState(EMPTY_FORM);
  const [addPin, setAddPin]       = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError]   = useState(null);

  const handleAdd = async () => {
    if (!addForm.employee_name.trim()) { setAddError('اسم الموظف مطلوب'); return; }
    if (addPin && !/^\d{4}$/.test(addPin)) { setAddError('الرمز السري لازم 4 أرقام'); return; }
    setAddSaving(true); setAddError(null);
    try {
      const st = sellerTypeForRole(addForm.role_type);
      const URL  = import.meta.env.VITE_SUPABASE_URL;
      const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${URL}/functions/v1/manage-employee`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON}`, apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          requesterRole: role,
          employee_name: addForm.employee_name.trim(),
          role_type: addForm.role_type,
          team: addForm.team || null,
          pin: addPin || undefined,
          seller_type: st,
          rep_level: st === 'field_rep' ? addForm.rep_level : null,
          mlm_rank:  st === 'marketer'  ? addForm.mlm_rank  : null,
        }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || 'تعذّر إنشاء الموظف');
      setProfiles(ps => [data.profile, ...ps]);
      setShowAdd(false); setAddForm(EMPTY_FORM); setAddPin('');
      window.alert(`تم إنشاء «${data.profile.employee_name}» ✓\nالرمز السري للدخول: ${data.pin}`);
    } catch (e) {
      setAddError(e.message || 'تعذّر إنشاء الموظف');
    } finally { setAddSaving(false); }
  };

  // ── KPIs ──────────────────────────────────────────────────────
  const total    = profiles.length;
  const active   = profiles.filter(p => p.is_active).length;
  const managers = profiles.filter(p => ['admin','manager','sales_manager'].includes(p.role_type)).length;
  // دور شبكة مبيعات؟ → صلاحياته تلقائية، نخفي شبكة الصلاحيات الإدارية.
  const isSalesRole = SALES_ROLES.includes(form.role_type);

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">👥 المستخدمون</h1>
          <p className="text-sm text-muted mt-0.5">إدارة حسابات الموظفين والصلاحيات</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setShowAdd(true); setAddForm(EMPTY_FORM); setAddError(null); }}
            className="px-4 py-2 rounded-xl bg-teal text-navy text-sm font-semibold hover:bg-teal/90 transition whitespace-nowrap"
          >
            + موظف
          </button>
        )}
      </div>

      {/* Migration banners */}
      {isAdmin && !hasExtCols && showMigration && (
        <SQLBanner
          title="إعداد مطلوب — حقول إضافية"
          desc="لتفعيل حقول الوردية والصفحة والملاحظات، نفّذ هذا SQL في Supabase:"
          sql={MIGRATION_SQL}
          onDismiss={() => setShowMigration(false)}
        />
      )}
      {isAdmin && showPinSetup && (
        <SQLBanner
          title="إعداد تغيير PIN (مرة واحدة فقط)"
          desc="لتفعيل ميزة تغيير PIN من قبل الأدمن، نفّذ هذا SQL في Supabase SQL Editor:"
          sql={RESET_PIN_SQL}
          onDismiss={() => setShowPinSetup(false)}
        />
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'إجمالي الموظفين', value: total,    icon: '👥' },
          { label: 'نشطون',           value: active,   icon: '✅' },
          { label: 'الإدارة',         value: managers, icon: '🏅' },
        ].map(k => (
          <div key={k.label} className="bg-surface border border-border rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">{k.icon}</div>
            <div className="text-2xl font-bold text-text">{k.value}</div>
            <div className="text-xs text-muted mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الفريق…"
          className="flex-1 border border-border rounded-xl px-4 py-2 text-sm bg-surface text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/30"
        />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text focus:outline-none"
        >
          <option value="all">كل الأدوار</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-bg border border-red/20 text-red-fg rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="underline text-xs">إعادة المحاولة</button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-muted text-sm">جار التحميل…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-2">📭</div>
          <p className="text-muted text-sm">{search ? 'لا نتائج مطابقة' : 'لا يوجد موظفون'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(p => {
            const lvl = getLevel(p.total_points ?? 0);
            return (
              <div
                key={p.id}
                className={['bg-surface border border-border rounded-2xl p-4 space-y-3 transition', !p.is_active && 'opacity-60'].filter(Boolean).join(' ')}
              >
                {/* Avatar + name */}
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-teal/10 flex items-center justify-center text-teal font-bold text-lg overflow-hidden">
                      {p.avatar_url
                        ? <img src={p.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                        : (p.employee_name?.[0] ?? '?')}
                    </div>
                    <span className="absolute -bottom-0.5 -end-0.5 text-xs leading-none" title={lvl.label}>{lvl.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-text truncate">{p.employee_name}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.team && <p className="text-xs text-muted">{p.team}</p>}
                      {p.page_name && (
                        <span className="text-xs text-teal font-medium truncate">📱 {p.page_name}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Role + status + points */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[p.role_type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {ROLE_LABELS[p.role_type] ?? p.role_type}
                  </span>
                  <div className="flex items-center gap-2">
                    {(p.total_points ?? 0) > 0 && (
                      <span className="text-xs font-semibold text-teal">{p.total_points} نقطة</span>
                    )}
                    <span className={`text-xs ${p.is_active ? 'text-green-fg' : 'text-red-fg'}`}>
                      {p.is_active ? '● نشط' : '○ غير نشط'}
                    </span>
                  </div>
                </div>

                {/* Shift badge */}
                {p.shift_type && (
                  <div className="text-xs text-muted">
                    {p.shift_type === 'morning' ? '🌅' : p.shift_type === 'evening' ? '🌇' : p.shift_type === 'night' ? '🌙' : '🕐'}
                    {' '}
                    {SHIFT_OPTIONS.find(s => s.value === p.shift_type)?.label.split(' ')[1] ?? p.shift_type}
                    {p.rest_day && <span className="ms-2">🗓️ {p.rest_day}</span>}
                  </div>
                )}

                {/* Actions */}
                {isAdmin && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(p)} className="flex-1 py-1.5 rounded-lg border border-border text-xs text-text hover:bg-surface-alt transition">
                        ✏️ تعديل
                      </button>
                      <button
                        onClick={() => toggleActive(p)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${p.is_active ? 'border border-red/20 text-red-fg hover:bg-red-bg' : 'border border-green/20 text-green-fg hover:bg-green-bg'}`}
                      >
                        {p.is_active ? '🔴 تعطيل' : '🟢 تفعيل'}
                      </button>
                    </div>
                    <button
                      onClick={() => setPinResetUser(p)}
                      className="w-full py-1.5 rounded-lg bg-amber-bg border border-amber/30 text-amber-fg text-xs font-medium hover:bg-amber/20 transition"
                    >
                      🔑 تغيير PIN
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      className="w-full py-1.5 rounded-lg bg-red-bg border border-red/30 text-red-fg text-xs font-medium hover:bg-red/20 transition"
                    >
                      🗑️ حذف نهائي
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditUser(null)}>
          <div
            className="bg-surface rounded-2xl w-full max-w-md shadow-xl flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-3 border-b border-border shrink-0">
              <h3 className="font-bold text-lg text-text">تعديل — {editUser.employee_name}</h3>
            </div>

            <div className="overflow-y-auto px-6 py-4 space-y-3 flex-1">
              {/* Basic */}
              <Field label="الاسم">
                <input type="text" value={form.employee_name} onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="الدور">
                <select value={form.role_type}
                  onChange={e => setForm(f => ({ ...f, role_type: e.target.value }))}
                  className={selectCls}>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="الفريق">
                <select value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))} className={selectCls}>
                  {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t || '—'}</option>)}
                </select>
              </Field>
              <Field label="نطاق الإشراف (للمدراء)">
                <input type="text" value={form.manager_scope} onChange={e => setForm(f => ({ ...f, manager_scope: e.target.value }))} placeholder="مثال: إسطنبول" className={inputCls} />
              </Field>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-teal" />
                <span className="text-sm text-text">نشط</span>
              </label>

              {/* Extended — work schedule */}
              {hasExtCols && (
                <>
                  <div className="border-t border-border pt-3 mt-1">
                    <p className="text-xs font-semibold text-muted mb-3">🗓️ جدول العمل</p>
                    <div className="space-y-3">
                      <Field label="نوع الوردية">
                        <select value={form.shift_type} onChange={e => setForm(f => ({ ...f, shift_type: e.target.value }))} className={selectCls}>
                          {SHIFT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="بداية الدوام">
                          <input type="time" value={form.work_start} onChange={e => setForm(f => ({ ...f, work_start: e.target.value }))} className={inputCls} />
                        </Field>
                        <Field label="نهاية الدوام">
                          <input type="time" value={form.work_end} onChange={e => setForm(f => ({ ...f, work_end: e.target.value }))} className={inputCls} />
                        </Field>
                      </div>
                      <Field label="يوم الراحة">
                        <select value={form.rest_day} onChange={e => setForm(f => ({ ...f, rest_day: e.target.value }))} className={selectCls}>
                          <option value="">— بدون تحديد —</option>
                          {REST_DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </Field>
                    </div>
                  </div>

                  {/* Page name */}
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-semibold text-muted mb-3">📱 السوشال ميديا</p>
                    <Field label="اسم الصفحة">
                      <input type="text" value={form.page_name} onChange={e => setForm(f => ({ ...f, page_name: e.target.value }))} placeholder="@username أو اسم الصفحة" className={inputCls} />
                    </Field>
                  </div>

                  {/* Celebrations — birthday + join date */}
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-semibold text-muted mb-3">🎂 التهاني التلقائية</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="تاريخ الميلاد">
                        <input
                          type="date"
                          value={form.birthday}
                          onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))}
                          className={inputCls}
                        />
                      </Field>
                      <Field label="تاريخ التعيين">
                        <input
                          type="date"
                          value={form.join_date}
                          onChange={e => setForm(f => ({ ...f, join_date: e.target.value }))}
                          className={inputCls}
                        />
                      </Field>
                    </div>
                    <p className="text-xs text-muted mt-1.5">يُنشر إعلان تلقائي يوم الميلاد وذكرى التعيين 📢</p>
                  </div>

                  {/* Salary */}
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-semibold text-muted mb-3">💵 الراتب (يُستخدم في الملء التلقائي للرواتب)</p>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="الأساسي ($)">
                        <input type="number" value={form.base_salary_usd}
                          onChange={e => setForm(f => ({ ...f, base_salary_usd: e.target.value }))}
                          placeholder="0" className={inputCls} />
                      </Field>
                      <Field label="بدل سكن ($)">
                        <input type="number" value={form.housing_allowance_usd}
                          onChange={e => setForm(f => ({ ...f, housing_allowance_usd: e.target.value }))}
                          placeholder="0" className={inputCls} />
                      </Field>
                      <Field label="بدل نقل ($)">
                        <input type="number" value={form.transport_allowance_usd}
                          onChange={e => setForm(f => ({ ...f, transport_allowance_usd: e.target.value }))}
                          placeholder="0" className={inputCls} />
                      </Field>
                    </div>
                  </div>

                  {/* Commission per-market — أونلاين فقط (لا للمندوب/المسوّقة) */}
                  {!isSalesRole && (
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold text-muted mb-1">📊 عمولة المبيعات</p>
                      <p className="text-[11px] text-muted mb-3">نسبة العمولة على الطلبات المسلّمة — تظهر للبائع في «طلباتي» وتُحتسب تلقائياً.</p>
                      <Field label="نسبة العمولة (%)">
                        <input type="number" min="0" max="100" step="0.5" value={form.commission_pct}
                          onChange={e => setForm(f => ({ ...f, commission_pct: e.target.value }))}
                          placeholder="10" className={inputCls} style={{ direction: 'ltr', textAlign: 'right' }} />
                      </Field>
                    </div>
                  )}

                  {/* الصلاحيات: شبكة كاملة للفريق · ملخّص تلقائي لشبكة المبيعات */}
                  {isSalesRole ? (
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold text-muted mb-2">🔑 الصلاحيات</p>
                      <div className="rounded-xl bg-surface-alt border border-border p-3 text-sm">
                        <p className="font-bold mb-1">✅ صلاحيات تلقائية حسب الدور</p>
                        <p className="text-muted text-xs leading-relaxed">
                          هذا الدور مفصول عن الفريق — يرى <b>شاشاته الخاصة فقط</b>
                          (محفظتي · شبكتي · طلباتي · التحصيل). لا وصول لإدارة الفريق
                          ولا لأسماء الموظفين. العمولة تُحتسب آلياً حسب المستوى/الرتبة أعلاه.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-border pt-3">
                      <p className="text-xs font-semibold text-muted mb-1">🔑 الصلاحيات</p>
                      <p className="text-[11px] text-muted mb-3">القالب يأتي من الدور أعلاه. فعّل أو امنع أي صلاحية لهذا الموظف تحديداً.</p>
                      <PermissionsEditor
                        roleType={form.role_type}
                        extra={form.extra_permissions}
                        denied={form.denied_permissions}
                        onChange={({ extra, denied }) => setForm(f => ({ ...f, extra_permissions: extra, denied_permissions: denied }))}
                      />
                    </div>
                  )}

                  {/* Admin notes */}
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-semibold text-muted mb-3">📝 ملاحظات الأدمن <span className="text-muted font-normal">(مخفية عن الموظف)</span></p>
                    <textarea
                      rows={3}
                      value={form.admin_notes}
                      onChange={e => setForm(f => ({ ...f, admin_notes: e.target.value }))}
                      placeholder="ملاحظات داخلية خاصة بالموظف…"
                      className={inputCls + ' resize-none'}
                    />
                  </div>
                </>
              )}
            </div>

            {saveError && (
              <div className="mx-6 mb-3 text-xs text-red-fg bg-red-bg border border-red/20 rounded-lg px-3 py-2">{saveError}</div>
            )}

            <div className="flex gap-2 px-6 pb-6 pt-2 border-t border-border shrink-0">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2 rounded-xl bg-teal text-navy text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition"
              >
                {saving ? 'جار الحفظ…' : 'حفظ'}
              </button>
              <button onClick={() => setEditUser(null)}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-text hover:bg-surface-alt transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PIN Reset Modal ── */}
      <PinResetModal employee={pinResetUser} onClose={() => setPinResetUser(null)} />

      {/* ── Add Employee Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-text mb-1">موظف جديد</h3>
            <p className="text-xs text-muted mb-4">يُنشأ الحساب مباشرة (اسم + دور + رمز سري). يدخل الموظف فوراً برمزه — بلا أي خطوة خارجية.</p>
            <div className="space-y-3">
              <Field label="الاسم">
                <input type="text" value={addForm.employee_name} onChange={e => setAddForm(f => ({ ...f, employee_name: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="الدور">
                <select value={addForm.role_type} onChange={e => setAddForm(f => ({ ...f, role_type: e.target.value }))} className={selectCls}>
                  {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="الرمز السري (4 أرقام)">
                <input type="text" inputMode="numeric" maxLength={4} value={addPin}
                  onChange={e => setAddPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="مثال: 1234 (الافتراضي 1234)" className={inputCls} style={{ direction: 'ltr', textAlign: 'right' }} />
              </Field>
              <Field label="الفريق">
                <select value={addForm.team} onChange={e => setAddForm(f => ({ ...f, team: e.target.value }))} className={selectCls}>
                  {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t || '—'}</option>)}
                </select>
              </Field>
            </div>
            {addError && (
              <div className="mt-3 text-xs text-red-fg bg-red-bg border border-red/20 rounded-lg px-3 py-2">{addError}</div>
            )}
            <div className="flex gap-2 mt-5">
              <button onClick={handleAdd} disabled={addSaving}
                className="flex-1 py-2 rounded-xl bg-teal text-navy text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition"
              >
                {addSaving ? 'جار الإنشاء…' : 'إنشاء'}
              </button>
              <button onClick={() => setShowAdd(false)}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-text hover:bg-surface-alt transition"
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
