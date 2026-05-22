// =============================================================
// AdminUsersScreen — full employee management
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@hooks/useAuth';

const ROLE_LABELS = {
  employee:'موظف', manager:'مدير', sales_manager:'مدير مبيعات',
  social_manager:'مدير سوشيال', media_buyer:'ميديا باير', admin:'أدمن',
};
const ROLE_COLORS = {
  admin:'bg-purple-100 text-purple-700', manager:'bg-blue-100 text-blue-700',
  sales_manager:'bg-teal/10 text-teal', social_manager:'bg-pink-100 text-pink-700',
  media_buyer:'bg-orange-100 text-orange-700', employee:'bg-gray-100 text-gray-600',
};
const TEAMS = ['إسطنبول','دمشق','دبي','الرياض','عام',''];
const EMPTY = { employee_name:'', role_type:'employee', team:'', manager_scope:'', is_active:true };

async function getDb() { const { supabase } = await import('@services/supabase'); return supabase; }

async function fetchProfiles() {
  const sb = await getDb();
  const { data, error } = await sb.from('profiles')
    .select('id,employee_name,role_type,team,manager_scope,is_active,avatar_url,created_at')
    .order('role_type').order('employee_name');
  if (error) throw new Error(error.message);
  return data ?? [];
}
async function updateProfile(id, patch) {
  const sb = await getDb();
  const { error } = await sb.from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export default function AdminUsersScreen() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [search, setSearch]     = useState('');
  const [roleFilter, setRole]   = useState('all');
  const [editUser, setEditUser] = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [saveErr, setSaveErr]   = useState(null);
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState(EMPTY);
  const [addSaving, setAddSaving] = useState(false);
  const [addErr, setAddErr]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setProfiles(await fetchProfiles()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = profiles.filter(p =>
    (!search || p.employee_name?.toLowerCase().includes(search.toLowerCase()) || p.team?.toLowerCase().includes(search.toLowerCase())) &&
    (roleFilter === 'all' || p.role_type === roleFilter)
  );

  const openEdit = (p) => {
    setEditUser(p);
    setForm({ employee_name: p.employee_name ?? '', role_type: p.role_type ?? 'employee',
      team: p.team ?? '', manager_scope: p.manager_scope ?? '', is_active: p.is_active ?? true });
    setSaveErr(null);
  };

  const handleSave = async () => {
    if (!form.employee_name.trim()) { setSaveErr('الاسم مطلوب'); return; }
    setSaving(true); setSaveErr(null);
    try {
      await updateProfile(editUser.id, { employee_name: form.employee_name.trim(),
        role_type: form.role_type, team: form.team || null,
        manager_scope: form.manager_scope || null, is_active: form.is_active });
      setProfiles(ps => ps.map(p => p.id === editUser.id ? { ...p, ...form } : p));
      setEditUser(null);
    } catch (e) { setSaveErr(e.message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (p) => {
    try {
      await updateProfile(p.id, { is_active: !p.is_active });
      setProfiles(ps => ps.map(x => x.id === p.id ? { ...x, is_active: !p.is_active } : x));
    } catch (e) { setError(e.message); }
  };

  const handleAdd = async () => {
    if (!addForm.employee_name.trim()) { setAddErr('الاسم مطلوب'); return; }
    setAddSaving(true); setAddErr(null);
    try {
      const sb = await getDb();
      const { data, error } = await sb.from('profiles')
        .insert({ employee_name: addForm.employee_name.trim(), role_type: addForm.role_type,
          team: addForm.team || null, is_active: true }).select().single();
      if (error) throw new Error(error.message);
      setProfiles(ps => [data, ...ps]); setShowAdd(false); setAddForm(EMPTY);
    } catch (e) { setAddErr(e.message || 'أنشئ Auth user أولاً من Supabase Dashboard.'); }
    finally { setAddSaving(false); }
  };

  const total = profiles.length;
  const active = profiles.filter(p => p.is_active).length;
  const mgrs   = profiles.filter(p => ['admin','manager','sales_manager'].includes(p.role_type)).length;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">👥 المستخدمون</h1>
          <p className="text-sm text-muted mt-0.5">إدارة حسابات الموظفين والصلاحيات</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setShowAdd(true); setAddForm(EMPTY); setAddErr(null); }}
            className="px-4 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition">
            + موظف
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[{l:'إجمالي',v:total,i:'👥'},{l:'نشطون',v:active,i:'✅'},{l:'الإدارة',v:mgrs,i:'🏅'}].map(k => (
          <div key={k.l} className="bg-surface border border-border rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">{k.i}</div>
            <div className="text-2xl font-bold text-text">{k.v}</div>
            <div className="text-xs text-muted">{k.l}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="بحث…" className="flex-1 border border-border rounded-xl px-4 py-2 text-sm bg-surface text-text" />
        <select value={roleFilter} onChange={e => setRole(e.target.value)}
          className="border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text">
          <option value="all">كل الأدوار</option>
          {Object.entries(ROLE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error} <button onClick={load} className="underline mr-2">إعادة</button></div>}

      {loading ? <div className="text-center py-16 text-muted text-sm">جار التحميل…</div>
        : filtered.length === 0 ? <div className="text-center py-16"><div className="text-4xl mb-2">📭</div><p className="text-muted text-sm">لا يوجد موظفون</p></div>
        : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(p => (
            <div key={p.id} className={['bg-surface border border-border rounded-2xl p-4 space-y-3',!p.is_active&&'opacity-60'].filter(Boolean).join(' ')}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-teal/10 flex items-center justify-center text-teal font-bold shrink-0">
                  {p.employee_name?.[0] ?? '?'}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-text truncate">{p.employee_name}</p>
                  {p.team && <p className="text-xs text-muted">{p.team}</p>}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className={['text-xs font-medium px-2 py-0.5 rounded-full', ROLE_COLORS[p.role_type]??'bg-gray-100 text-gray-600'].join(' ')}>
                  {ROLE_LABELS[p.role_type]??p.role_type}
                </span>
                <span className={['text-xs',p.is_active?'text-green-600':'text-red-500'].join(' ')}>
                  {p.is_active?'● نشط':'○ غير نشط'}
                </span>
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <button onClick={() => openEdit(p)} className="flex-1 py-1.5 rounded-lg border border-border text-xs text-text hover:bg-cream">تعديل</button>
                  <button onClick={() => toggleActive(p)} className={['flex-1 py-1.5 rounded-lg text-xs font-medium',p.is_active?'border border-red-200 text-red-600':'border border-green-200 text-green-600'].join(' ')}>
                    {p.is_active?'إلغاء تفعيل':'تفعيل'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditUser(null)}>
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-text mb-4">تعديل — {editUser.employee_name}</h3>
            <div className="space-y-3">
              <div><label className="text-xs text-muted mb-1 block">الاسم</label>
                <input value={form.employee_name} onChange={e => setForm(f=>({...f,employee_name:e.target.value}))} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" /></div>
              <div><label className="text-xs text-muted mb-1 block">الدور</label>
                <select value={form.role_type} onChange={e => setForm(f=>({...f,role_type:e.target.value}))} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text">
                  {Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="text-xs text-muted mb-1 block">الفريق</label>
                <select value={form.team} onChange={e => setForm(f=>({...f,team:e.target.value}))} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text">
                  {TEAMS.map(t=><option key={t} value={t}>{t||'—'}</option>)}</select></div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e=>setForm(f=>({...f,is_active:e.target.checked}))} className="w-4 h-4 accent-teal" />
                <span className="text-sm text-text">نشط</span>
              </label>
            </div>
            {saveErr && <div className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{saveErr}</div>}
            <div className="flex gap-2 mt-5">
              <button onClick={handleSave} disabled={saving} className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold disabled:opacity-50">{saving?'جار الحفظ…':'حفظ'}</button>
              <button onClick={() => setEditUser(null)} className="flex-1 py-2 rounded-xl border border-border text-sm text-text">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-text mb-1">موظف جديد</h3>
            <p className="text-xs text-muted mb-4">أنشئ Auth user أولاً من Supabase Dashboard.</p>
            <div className="space-y-3">
              <div><label className="text-xs text-muted mb-1 block">الاسم</label>
                <input value={addForm.employee_name} onChange={e=>setAddForm(f=>({...f,employee_name:e.target.value}))} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text" /></div>
              <div><label className="text-xs text-muted mb-1 block">الدور</label>
                <select value={addForm.role_type} onChange={e=>setAddForm(f=>({...f,role_type:e.target.value}))} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text">
                  {Object.entries(ROLE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="text-xs text-muted mb-1 block">الفريق</label>
                <select value={addForm.team} onChange={e=>setAddForm(f=>({...f,team:e.target.value}))} className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-cream text-text">
                  {TEAMS.map(t=><option key={t} value={t}>{t||'—'}</option>)}</select></div>
            </div>
            {addErr && <div className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{addErr}</div>}
            <div className="flex gap-2 mt-5">
              <button onClick={handleAdd} disabled={addSaving} className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold disabled:opacity-50">{addSaving?'جار الإنشاء…':'إنشاء'}</button>
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-xl border border-border text-sm text-text">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
