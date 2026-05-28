// =============================================================
// ShiftScheduleScreen — جدول المناوبات الأسبوعي
// Admin يحدد، الموظف يشوف مناوبته
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@services/supabase';
import { useAuth }  from '@hooks/useAuth';
import { ROLES }    from '@data/teams';

const SHIFT_CONFIG = {
  morning:  { label: 'صباحي',  icon: '🌅', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  evening:  { label: 'مسائي',  icon: '🌇', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  night:    { label: 'ليلي',   icon: '🌙', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  flexible: { label: 'مرن',    icon: '🕐', color: 'bg-teal/10 text-teal border-teal/20' },
  off:      { label: 'إجازة',  icon: '🏖️', color: 'bg-red-50 text-red-500 border-red-200' },
};

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const DAYS_AR   = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

function isoDate(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function weekDays(anchor) {
  const day = anchor.getDay(); // 0=Sun
  const sun = addDays(anchor, -day);
  return Array.from({ length: 7 }, (_, i) => addDays(sun, i));
}

export default function ShiftScheduleScreen() {
  const { name, role } = useAuth();
  const isManager = [ROLES.ADMIN, ROLES.MANAGER].includes(role);

  const [weekAnchor, setWeekAnchor] = useState(() => {
    const d = new Date(); d.setHours(0,0,0,0); return d;
  });
  const [schedule, setSchedule]     = useState([]);
  const [employees, setEmployees]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [myView, setMyView]         = useState(!isManager);

  // form state
  const [formOpen, setFormOpen]     = useState(false);
  const [formData, setFormData]     = useState({ employee_name: '', work_date: '', shift_type: 'morning', notes: '' });
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState(null);

  const days = weekDays(weekAnchor);

  const load = useCallback(async () => {
    setLoading(true);
    const from = isoDate(days[0]);
    const to   = isoDate(days[6]);

    const [schedRes, empRes] = await Promise.all([
      supabase.from('shift_schedule').select('*')
        .gte('work_date', from).lte('work_date', to)
        .order('work_date').order('employee_name'),
      isManager
        ? supabase.from('profiles').select('employee_name,job_title').eq('is_active', true).order('employee_name')
        : Promise.resolve({ data: [] }),
    ]);
    setSchedule(schedRes.data ?? []);
    setEmployees(empRes.data ?? []);
    setLoading(false);
  }, [weekAnchor, isManager]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const prevWeek = () => setWeekAnchor(d => addDays(d, -7));
  const nextWeek = () => setWeekAnchor(d => addDays(d, 7));
  const goToday  = () => { const d = new Date(); d.setHours(0,0,0,0); setWeekAnchor(d); };

  const save = async () => {
    if (!formData.employee_name || !formData.work_date) return;
    setSaving(true); setMsg(null);
    try {
      const { error } = await supabase.from('shift_schedule').upsert({
        employee_name: formData.employee_name,
        work_date:     formData.work_date,
        shift_type:    formData.shift_type,
        notes:         formData.notes.trim() || null,
        created_by:    name,
      }, { onConflict: 'employee_name,work_date' });
      if (error) throw error;
      setMsg({ ok: true, text: '✅ تم الحفظ' });
      setTimeout(() => { setFormOpen(false); setMsg(null); }, 1200);
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally { setSaving(false); }
  };

  const deleteEntry = async (id) => {
    await supabase.from('shift_schedule').delete().eq('id', id);
    await load();
  };

  const mySchedule = schedule.filter(r => r.employee_name === name);

  const weekLabel = () => {
    const f = days[0]; const l = days[6];
    return `${f.getDate()} ${MONTHS_AR[f.getMonth()]} — ${l.getDate()} ${MONTHS_AR[l.getMonth()]} ${l.getFullYear()}`;
  };

  const today = isoDate(new Date());

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-extrabold text-text">📅 جدول المناوبات</h1>
          <p className="text-xs text-muted mt-0.5">{weekLabel()}</p>
        </div>
        <div className="flex items-center gap-2">
          {isManager && (
            <>
              <div className="flex rounded-xl overflow-hidden border border-border text-xs font-bold">
                <button onClick={() => setMyView(true)}  className={`px-3 py-1.5 transition ${myView  ? 'bg-teal text-white' : 'text-muted hover:bg-surface-alt'}`}>مناوبتي</button>
                <button onClick={() => setMyView(false)} className={`px-3 py-1.5 transition ${!myView ? 'bg-teal text-white' : 'text-muted hover:bg-surface-alt'}`}>الكل</button>
              </div>
              <button onClick={() => { setFormData({ employee_name: '', work_date: today, shift_type: 'morning', notes: '' }); setFormOpen(true); }}
                className="px-3 py-1.5 text-xs font-bold bg-teal text-white rounded-xl hover:opacity-90 transition">
                + تعيين مناوبة
              </button>
            </>
          )}
        </div>
      </div>

      {/* Week nav */}
      <div className="flex items-center gap-2">
        <button onClick={prevWeek} className="w-8 h-8 rounded-xl border border-border flex items-center justify-center text-muted hover:text-text transition">‹</button>
        <button onClick={goToday} className="flex-1 text-xs font-bold text-muted border border-border rounded-xl py-1.5 hover:bg-surface-alt transition">اليوم</button>
        <button onClick={nextWeek} className="w-8 h-8 rounded-xl border border-border flex items-center justify-center text-muted hover:text-text transition">›</button>
      </div>

      {/* My schedule strip */}
      {(myView || !isManager) && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-bold text-teal">👤 مناوباتي هذا الأسبوع</p>
          </div>
          {loading ? (
            <div className="p-4 space-y-2">{[...Array(3)].map((_,i) => <div key={i} className="h-8 bg-surface-alt rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="grid grid-cols-7 gap-px bg-border">
              {days.map(d => {
                const iso  = isoDate(d);
                const isToday = iso === today;
                const entry = mySchedule.find(r => r.work_date === iso);
                const cfg   = entry ? SHIFT_CONFIG[entry.shift_type] : null;
                return (
                  <div key={iso} className={`flex flex-col items-center p-2 gap-1 ${isToday ? 'bg-teal/5' : 'bg-surface'}`}>
                    <p className={`text-[10px] font-bold ${isToday ? 'text-teal' : 'text-muted'}`}>{DAYS_AR[d.getDay()].slice(0,2)}</p>
                    <p className={`text-sm font-extrabold ${isToday ? 'text-teal' : 'text-text'}`}>{d.getDate()}</p>
                    {cfg ? (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-lg border ${cfg.color}`}>{cfg.icon}</span>
                    ) : (
                      <span className="text-[9px] text-muted/30">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {/* Legend */}
          <div className="px-4 py-3 flex flex-wrap gap-2 border-t border-border/50">
            {Object.entries(SHIFT_CONFIG).map(([k, v]) => (
              <span key={k} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${v.color}`}>{v.icon} {v.label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Full schedule table (manager) */}
      {isManager && !myView && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-bold text-muted">📋 جدول الفريق الكامل</p>
          </div>
          {loading ? (
            <div className="p-4 space-y-2">{[...Array(5)].map((_,i) => <div key={i} className="h-10 bg-surface-alt rounded-xl animate-pulse" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[600px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-start px-4 py-2.5 font-bold text-muted w-32">الموظف</th>
                    {days.map(d => {
                      const iso = isoDate(d);
                      return (
                        <th key={iso} className={`text-center px-2 py-2.5 font-bold ${iso === today ? 'text-teal' : 'text-muted'}`}>
                          <div>{DAYS_AR[d.getDay()].slice(0,3)}</div>
                          <div className="font-extrabold text-text/80">{d.getDate()}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => (
                    <tr key={emp.employee_name} className="border-b border-border/50 hover:bg-surface-alt/40 transition">
                      <td className="px-4 py-2 font-semibold text-text truncate max-w-[120px]">{emp.employee_name}</td>
                      {days.map(d => {
                        const iso   = isoDate(d);
                        const entry = schedule.find(r => r.employee_name === emp.employee_name && r.work_date === iso);
                        const cfg   = entry ? SHIFT_CONFIG[entry.shift_type] : null;
                        return (
                          <td key={iso} className="text-center px-2 py-2">
                            {cfg ? (
                              <div className="group relative inline-block">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border cursor-pointer ${cfg.color}`}
                                  title={entry.notes || cfg.label}>
                                  {cfg.icon} {cfg.label}
                                </span>
                                {isManager && (
                                  <button onClick={() => deleteEntry(entry.id)}
                                    className="absolute -top-1 -end-1 w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[8px] hidden group-hover:flex items-center justify-center">×</button>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted/20 text-base">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {employees.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-8 text-muted text-xs">لا يوجد موظفون</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add form modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/60 backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && setFormOpen(false)}>
          <div className="w-full max-w-sm bg-surface rounded-2xl shadow-2xl border border-border p-5 space-y-4" dir="rtl">
            <div className="flex items-center justify-between">
              <p className="font-bold text-text">📅 تعيين مناوبة</p>
              <button onClick={() => setFormOpen(false)} className="text-muted hover:text-text">✕</button>
            </div>

            {msg && <p className={`text-xs font-semibold ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>}

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-muted mb-1 block">الموظف</label>
                <select value={formData.employee_name} onChange={e => setFormData(p => ({...p, employee_name: e.target.value}))}
                  className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text focus:border-teal focus:outline-none">
                  <option value="">اختر موظف</option>
                  {employees.map(e => <option key={e.employee_name} value={e.employee_name}>{e.employee_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted mb-1 block">التاريخ</label>
                <input type="date" value={formData.work_date} onChange={e => setFormData(p => ({...p, work_date: e.target.value}))}
                  className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text focus:border-teal focus:outline-none" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted mb-1 block">نوع المناوبة</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(SHIFT_CONFIG).map(([k, v]) => (
                    <button key={k} onClick={() => setFormData(p => ({...p, shift_type: k}))}
                      className={`px-2 py-2 rounded-xl text-xs font-bold border transition ${formData.shift_type === k ? 'bg-teal text-white border-teal' : `border ${v.color}`}`}>
                      {v.icon} {v.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted mb-1 block">ملاحظة (اختياري)</label>
                <input value={formData.notes} onChange={e => setFormData(p => ({...p, notes: e.target.value}))}
                  placeholder="مثال: ورديتان متتاليتان..."
                  className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text focus:border-teal focus:outline-none" />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={save} disabled={saving || !formData.employee_name || !formData.work_date}
                className="flex-1 py-2.5 bg-teal text-white rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-40 transition">
                {saving ? '⏳ جاري الحفظ...' : '💾 حفظ'}
              </button>
              <button onClick={() => setFormOpen(false)}
                className="px-4 py-2.5 border border-border rounded-xl text-sm text-muted hover:bg-surface-alt transition">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
