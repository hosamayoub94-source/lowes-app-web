// =============================================================
// OpsCreateTaskModal — a task is created WITH an owner, an outcome and a
// due date (no orphan work). Optional links: ABOS project (P##), decision
// (D-###), KPI. Attachments are uploaded after the task exists.
// =============================================================
import { useRef, useState } from 'react';
import { cn } from '@utils/classNames';
import { Button } from '@components/ui/Button';
import { Spinner } from '@components/ui/Loading';
import { EMPTY_OPS_FORM, validateNewTask, toTaskPayload } from '../utils/taskForm';
import { ABOS_PROJECTS, KPI_OPTIONS } from '../utils/taskLinks';
import { TASKS_V3_STATUSES } from '../utils/taskFlags';

const INPUT = 'w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/40';
const TEAMS = [
  { value: '', label: '— بدون فريق —' },
  { value: 'ميديا', label: '📱 السوشال ميديا' },
  { value: 'سوريا', label: '🇸🇾 سوريا' },
  { value: 'تركيا', label: '🇹🇷 تركيا' },
];
const PRIORITIES = [
  { value: 'urgent', label: '⚡ عاجلة' },
  { value: 'high', label: '▲ مرتفعة' },
  { value: 'medium', label: '△ متوسطة' },
  { value: 'low', label: '▽ منخفضة' },
];

function Field({ label, error, hint, required, children }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted">
        {label}{required && ' *'}{hint && <span className="font-normal text-muted/70"> ({hint})</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-red-fg">{error}</p>}
    </div>
  );
}

export function OpsCreateTaskModal({ open, onClose, onSubmit, saving, employees = [], projects = [], canMarkSensitive = false, creatorId }) {
  const [form, setForm] = useState(EMPTY_OPS_FORM);
  const [errors, setErrors] = useState({});
  const [files, setFiles] = useState([]);
  const fileRef = useRef(null);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  if (!open) return null;

  const owners = employees.filter((e) => !form.team || e.team === form.team);
  const addableParticipants = employees.filter((e) => e.id !== form.owner && !form.participants.includes(e.id));
  const nameOf = (id) => employees.find((e) => e.id === id)?.name || id;

  const close = () => { setForm(EMPTY_OPS_FORM); setErrors({}); setFiles([]); onClose(); };

  const submit = (e) => {
    e.preventDefault();
    const v = validateNewTask(form);
    setErrors(v.errors);
    if (!v.ok) return;
    onSubmit(toTaskPayload(form, { v3: TASKS_V3_STATUSES, creatorId }), files);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="مهمة جديدة" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} aria-hidden />
      <form onSubmit={submit} className="relative z-10 w-full max-w-lg bg-surface rounded-2xl shadow-modal flex flex-col max-h-[92vh] animate-pop-in">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
          <h2 className="text-base font-bold text-text">مهمة جديدة</h2>
          <button type="button" onClick={close} className="text-muted hover:text-text text-xl leading-none" aria-label="إغلاق">×</button>
        </div>

        <div className="overflow-y-auto px-6 pb-2 space-y-4 flex-1">
          <Field label="العنوان" required error={errors.title}>
            <input autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} className={INPUT} placeholder="ما الذي سيُنجَز؟" />
          </Field>

          <Field label="النتيجة المطلوبة" required error={errors.outcome} hint="كيف نعرف أنها تمّت؟">
            <textarea rows={2} value={form.outcome} onChange={(e) => set('outcome', e.target.value)} className={cn(INPUT, 'resize-none')} placeholder="مثال: 40 تاجراً تم التواصل معهم وردّ 10 منهم" />
          </Field>

          <div className="rounded-xl border border-border bg-surface-alt/40 p-3 space-y-3">
            <p className="text-xs font-bold text-text">المسؤولية</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="الفريق">
                <select value={form.team} onChange={(e) => { set('team', e.target.value); set('owner', ''); }} className={INPUT}>
                  {TEAMS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="المالك النهائي" required error={errors.owner}>
                <select value={form.owner} onChange={(e) => set('owner', e.target.value)} className={INPUT}>
                  <option value="">— اختر —</option>
                  {owners.map((emp) => <option key={emp.id} value={emp.id}>{emp.name || emp.id}</option>)}
                </select>
              </Field>
            </div>
            <Field label="المشاركون" hint="اختياري">
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {form.participants.map((id) => (
                  <button key={id} type="button" onClick={() => set('participants', form.participants.filter((x) => x !== id))}
                    className="text-[11px] bg-teal/10 text-teal rounded-full px-2.5 py-1">{nameOf(id)} ×</button>
                ))}
              </div>
              <select value="" onChange={(e) => e.target.value && set('participants', [...form.participants, e.target.value])} className={INPUT}>
                <option value="">+ إضافة مشارك</option>
                {addableParticipants.map((emp) => <option key={emp.id} value={emp.id}>{emp.name || emp.id}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="الموعد" required error={errors.due_date}>
              <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} className={INPUT} />
            </Field>
            <Field label="الأولوية">
              <select value={form.priority} onChange={(e) => set('priority', e.target.value)} className={INPUT}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
          </div>

          {TASKS_V3_STATUSES && (
            <Field label="الخطوة التالية" hint="اختياري">
              <input value={form.next_step} onChange={(e) => set('next_step', e.target.value)} className={INPUT} placeholder="أول إجراء ملموس" />
            </Field>
          )}

          <div className="rounded-xl border border-border bg-surface-alt/40 p-3 space-y-3">
            <p className="text-xs font-bold text-text">الربط <span className="font-normal text-muted">(يجعل المهمة قابلة للقياس)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="المشروع (ABOS)" error={errors.project_code}>
                <select value={form.project_code} onChange={(e) => set('project_code', e.target.value)} className={INPUT}>
                  <option value="">—</option>
                  {ABOS_PROJECTS.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
                </select>
              </Field>
              <Field label="KPI">
                <select value={form.kpi_key} onChange={(e) => set('kpi_key', e.target.value)} className={INPUT}>
                  <option value="">—</option>
                  {KPI_OPTIONS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                </select>
              </Field>
              <Field label="القرار المرتبط" error={errors.decision_ref} hint="D-123">
                <input dir="ltr" value={form.decision_ref} onChange={(e) => set('decision_ref', e.target.value)} className={INPUT} placeholder="D-140" />
              </Field>
              {projects.length > 0 && (
                <Field label="مشروع التطبيق">
                  <select value={form.project_id} onChange={(e) => set('project_id', e.target.value)} className={INPUT}>
                    <option value="">—</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.icon ? `${p.icon} ` : ''}{p.name}</option>)}
                  </select>
                </Field>
              )}
            </div>
          </div>

          <Field label="رابط" hint="اختياري">
            <input dir="ltr" value={form.link} onChange={(e) => set('link', e.target.value)} className={INPUT} placeholder="https://..." />
          </Field>

          <div className="space-y-2">
            <input ref={fileRef} type="file" multiple className="hidden"
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar"
              onChange={(e) => { setFiles((p) => [...p, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-border hover:border-teal/50 px-4 py-3 text-sm text-muted hover:text-teal transition">
              📎 إرفاق ملف (اختياري)
            </button>
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-surface-alt px-3 py-2 text-xs">
                <span className="flex-1 truncate text-text">{f.name}</span>
                <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="text-muted hover:text-red-500" aria-label="حذف">×</button>
              </div>
            ))}
          </div>

          {canMarkSensitive && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={form.is_sensitive} onChange={(e) => set('is_sensitive', e.target.checked)} className="w-4 h-4 accent-teal" />
              <span className="text-xs font-semibold text-text">🔒 مهمة حسّاسة — للأدمن فقط</span>
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={close}>إلغاء</Button>
          <Button type="submit" variant="teal" size="sm" disabled={saving} className="gap-2 min-w-[110px]">
            {saving ? <><Spinner size="sm" />جارٍ الحفظ...</> : 'إضافة المهمة'}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default OpsCreateTaskModal;
