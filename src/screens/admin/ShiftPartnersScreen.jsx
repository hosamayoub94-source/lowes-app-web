// =============================================================
// ShiftPartnersScreen — شركاء الدوام (مجموعات الورديات)
//
// المسؤول يحدّد مَن يعمل مع مَن. عدد أعضاء المجموعة هو ما يحدّد
// نظام الورديات (شخصان → صباحي/مسائي مع استراحة، ثلاثة → صباحي/ظهر/مسائي).
//
// تعديل الشركاء يسري من تاريخ التغيير فقط — سجلات الدوام السابقة
// تبقى مرتبطة بالمجموعة التي كانت فعّالة وقتها ولا يُعاد احتسابها.
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@services/supabase';
import { useAuth }  from '@hooks/useAuth';
import { Hero }     from '@components/ui/Hero';
import { Card, CardTitle } from '@components/ui/Card';
import {
  fetchGroupsAt, saveGroup, endGroup, fetchGroupHistory,
  shiftPlanForSize, todayISO,
} from '@services/shiftPartnersService';

// ── عرض خطة الورديات لعدد أعضاء ────────────────────────────────
function PlanPreview({ size }) {
  const plan = shiftPlanForSize(size);
  if (!plan) {
    return (
      <p className="text-[11px] text-amber-600">
        ⚠️ نظام الورديات معرَّف لمجموعة من شخصين أو ثلاثة فقط — بعدد {size} يبقى الموظف على دوامه المسجَّل ببياناته.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted">
        إجمالي الدوام {plan.span.start} → {plan.span.end}
        {plan.breakWindow
          ? ` · استراحة ${plan.breakWindow.start}–${plan.breakWindow.end}`
          : ' · بلا استراحة'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {plan.shifts.map(s => (
          <span key={s.key} className="px-2 py-1 rounded-lg bg-teal/10 text-teal text-[11px] font-semibold">
            {s.label}: {s.start} → {s.end}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── نافذة تحرير المجموعة ───────────────────────────────────────
function GroupEditor({ group, employees, takenNames, onClose, onSaved, createdBy }) {
  const isNew = !group?.id;
  const [name,    setName]    = useState(group?.name ?? 'مجموعة دوام');
  const [members, setMembers] = useState(group?.members ?? []);
  const [from,    setFrom]    = useState(todayISO());
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState(null);

  const toggle = (empName) => {
    setMembers(m => m.includes(empName) ? m.filter(x => x !== empName) : [...m, empName]);
  };

  const submit = async () => {
    if (members.length < 2) { setErr('المجموعة تحتاج عضوين على الأقل.'); return; }
    setSaving(true); setErr(null);
    try {
      await saveGroup({
        id:         group?.id,
        group_key:  group?.group_key,
        current:    group,
        name,
        members,
        created_by: createdBy ?? null,
      }, from);
      onSaved();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-surface rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border/40">
          <p className="font-bold text-text">{isNew ? '➕ مجموعة دوام جديدة' : '✏️ تعديل شركاء الدوام'}</p>
          <p className="text-xs text-muted mt-0.5">
            {isNew ? 'اختر الموظفين الذين يعملون معاً' : 'المجموعة الجديدة تسري من تاريخ التغيير — السجلات السابقة لا تتغيّر'}
          </p>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <div>
            <label className="text-xs text-muted mb-1 block">اسم المجموعة</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text" />
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">
              الأعضاء <span className="font-bold text-text">({members.length})</span>
            </label>
            <div className="max-h-56 overflow-y-auto border border-border rounded-xl divide-y divide-border/50">
              {employees.map(emp => {
                const selected = members.includes(emp.employee_name);
                const taken    = !selected && takenNames.has(emp.employee_name);
                return (
                  <button key={emp.id ?? emp.employee_name}
                    onClick={() => !taken && toggle(emp.employee_name)}
                    disabled={taken}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-right transition
                      ${selected ? 'bg-teal/10 text-teal font-semibold' : 'text-text hover:bg-surface-alt'}
                      ${taken ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <span className="w-4">{selected ? '✓' : ''}</span>
                    <span className="flex-1">{emp.employee_name}</span>
                    {emp.team && <span className="text-[10px] text-muted">{emp.team}</span>}
                    {taken && <span className="text-[10px] text-muted">بمجموعة أخرى</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-surface-alt p-3">
            <p className="text-[11px] font-bold text-muted mb-1.5">نظام الورديات الناتج</p>
            <PlanPreview size={members.length} />
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">يسري من تاريخ</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface-alt text-text" />
          </div>

          {err && <p className="text-xs text-red-500">⚠️ {err}</p>}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-border/40">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted hover:text-text transition">
            إلغاء
          </button>
          <button onClick={submit} disabled={saving || members.length < 2}
            className="flex-1 py-2.5 rounded-xl bg-teal text-navy text-sm font-bold disabled:opacity-40 transition">
            {saving ? '…' : '✓ حفظ'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── بطاقة مجموعة ───────────────────────────────────────────────
function GroupCard({ group, onEdit, onEnd }) {
  const [history, setHistory] = useState(null);

  const loadHistory = async () => {
    if (history) { setHistory(null); return; }
    setHistory(await fetchGroupHistory(group.group_key));
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-text text-sm">👥 {group.name}</p>
          <p className="text-[11px] text-muted mt-0.5">سارية من {group.effective_from}</p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => onEdit(group)}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text hover:bg-surface-alt transition">
            تعديل الشركاء
          </button>
          <button onClick={() => onEnd(group)}
            className="px-3 py-1.5 rounded-lg border border-border text-xs text-red-500 hover:bg-red-50 transition">
            إنهاء
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(group.members ?? []).map(m => (
          <span key={m} className="px-2.5 py-1 rounded-full bg-surface-alt text-xs text-text border border-border">
            {m}
          </span>
        ))}
      </div>

      <div className="rounded-xl bg-surface-alt p-3">
        <PlanPreview size={group.members?.length ?? 0} />
      </div>

      <button onClick={loadHistory} className="text-[11px] text-muted hover:text-text transition">
        {history ? '▲ إخفاء التاريخ' : '▼ تاريخ المجموعة'}
      </button>
      {history && (
        <div className="space-y-1 border-t border-border pt-2">
          {history.map(h => (
            <p key={h.id} className="text-[11px] text-muted">
              {h.effective_from} → {h.effective_to ?? 'الآن'} · {(h.members ?? []).join('، ')}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── الشاشة ─────────────────────────────────────────────────────
export default function ShiftPartnersScreen() {
  const { name: currentUser } = useAuth();

  const [groups,    setGroups]    = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [editing,   setEditing]   = useState(null); // group | {} للجديد
  const [tableMissing, setTableMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: emps }, gs] = await Promise.all([
      supabase.from('profiles')
        .select('id, employee_name, team, is_active')
        .eq('is_active', true).order('employee_name'),
      fetchGroupsAt(),
    ]);
    setEmployees((emps ?? []).filter(e => e.employee_name));
    setGroups(gs);
    // تحقّق من وجود الجدول (قبل تطبيق الترحيل يرجع خطأ فيبان [] فارغة)
    const probe = await supabase.from('shift_groups').select('id').limit(1);
    setTableMissing(!!probe.error);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleEnd = async (group) => {
    if (!window.confirm(`إنهاء مجموعة "${group.name}" اعتباراً من اليوم؟ السجلات السابقة تبقى كما هي.`)) return;
    try { await endGroup(group.id); await load(); }
    catch (e) { window.alert('تعذّر الإنهاء: ' + (e?.message || e)); }
  };

  // الأسماء المحجوزة بمجموعات أخرى — موظف بمجموعة واحدة فقط بنفس الوقت
  const takenNamesFor = (group) => {
    const s = new Set();
    groups.forEach(g => {
      if (g.id === group?.id) return;
      (g.members ?? []).forEach(m => s.add(m));
    });
    return s;
  };

  return (
    <div className="space-y-5" dir="rtl">
      <Hero eyebrow="الموارد البشرية" title="شركاء الدوام"
        subtitle="حدّد مَن يعمل مع مَن — عدد أعضاء المجموعة يحدّد نظام الورديات" />

      {tableMissing && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2 text-xs text-amber-700 dark:text-amber-400">
          ⚠️ جدول <code>shift_groups</code> غير موجود بعد — شغّل الترحيل
          <code className="mx-1">supabase/migrations/20260822_shift_partner_groups.sql</code>
          من محرّر SQL في Supabase.
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>المجموعات الحالية</CardTitle>
          <button onClick={() => setEditing({})}
            className="px-4 py-2 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 transition">
            ➕ مجموعة جديدة
          </button>
        </div>

        {loading ? (
          <p className="text-center py-8 text-muted text-sm">جار التحميل…</p>
        ) : groups.length === 0 ? (
          <p className="text-center py-8 text-muted text-sm">لا توجد مجموعات دوام بعد.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
            {groups.map(g => (
              <GroupCard key={g.id} group={g} onEdit={setEditing} onEnd={handleEnd} />
            ))}
          </div>
        )}
      </Card>

      {editing && (
        <GroupEditor
          group={editing.id ? editing : null}
          employees={employees}
          takenNames={takenNamesFor(editing.id ? editing : null)}
          createdBy={currentUser}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
