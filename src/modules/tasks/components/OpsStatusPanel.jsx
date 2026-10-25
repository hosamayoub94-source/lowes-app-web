// =============================================================
// OpsStatusPanel — guarded status change used inside the drawer.
// blocked needs a blocker · waiting_reply needs "who" · review needs
// evidence (+ reviewer once the column exists) · completed warns/blocks
// without evidence. Rules live in utils/taskWorkflow.validateTransition.
// =============================================================
import { useState } from 'react';
import { Button } from '@components/ui/Button';
import { selectableStatuses, STATUS_META_V3, normalizeStatus, validateTransition } from '../utils/taskWorkflow';
import { toStatusExtra } from '../utils/taskForm';
import { TASKS_V3_STATUSES } from '../utils/taskFlags';

const INPUT = 'w-full rounded-xl border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/40';

export function OpsStatusPanel({ task, employees = [], onChange, loading }) {
  const current = normalizeStatus(task.status);
  const [target, setTarget] = useState(current);
  const [vals, setVals] = useState({ blocker: '', next_step: '', evidence: '', review_requested_by: '' });
  const [problems, setProblems] = useState({ errors: [], warnings: [] });
  const set = (k, v) => setVals((p) => ({ ...p, [k]: v }));
  const options = selectableStatuses(TASKS_V3_STATUSES);
  if (!options.includes(current)) options.unshift(current); // حالة قائمة لا تُخفى
  const locked = current === 'cancelled' || current === 'archived';
  const changed = target !== current;

  const apply = async () => {
    const extra = toStatusExtra(target, vals, TASKS_V3_STATUSES);
    const merged = { blocker: vals.blocker, next_step: vals.next_step, evidence: vals.evidence, review_requested_by: vals.review_requested_by };
    const res = validateTransition(task, target, merged, { requireEvidence: false, reviewerOptional: !TASKS_V3_STATUSES });
    setProblems(res);
    if (!res.ok) return;
    await onChange(target, extra);
    setVals({ blocker: '', next_step: '', evidence: '', review_requested_by: '' });
  };

  return (
    <div className="space-y-3">
      <select value={target} onChange={(e) => { setTarget(e.target.value); setProblems({ errors: [], warnings: [] }); }}
        disabled={loading || locked} aria-label="تغيير حالة المهمة" className={INPUT}>
        {options.map((s) => <option key={s} value={s}>{STATUS_META_V3[s].icon} {STATUS_META_V3[s].label}</option>)}
      </select>
      {locked && <p className="text-xs text-muted">المهام الملغاة/المؤرشفة لا تُغيَّر حالتها.</p>}

      {changed && target === 'blocked' && (
        <input value={vals.blocker} onChange={(e) => set('blocker', e.target.value)} className={INPUT} placeholder="ما العائق؟ ومن يستطيع رفعه؟" />
      )}
      {changed && target === 'waiting_reply' && (
        <input value={vals.next_step} onChange={(e) => set('next_step', e.target.value)} className={INPUT} placeholder="بانتظار ردّ من…" />
      )}
      {changed && (target === 'review' || target === 'completed') && (
        <textarea rows={2} value={vals.evidence} onChange={(e) => set('evidence', e.target.value)} className={INPUT}
          placeholder="دليل الإنجاز: رابط، رقم، لقطة… (ما الذي تحقق فعلاً؟)" />
      )}
      {changed && target === 'review' && TASKS_V3_STATUSES && (
        <select value={vals.review_requested_by} onChange={(e) => set('review_requested_by', e.target.value)} className={INPUT}>
          <option value="">— من سيراجع؟ —</option>
          {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
      )}

      {problems.errors.map((m) => <p key={m} className="text-xs text-red-fg">⚠️ {m}</p>)}
      {problems.warnings.map((m) => <p key={m} className="text-xs text-amber-fg">ℹ️ {m}</p>)}

      {changed && (
        <Button variant="teal" size="sm" onClick={apply} disabled={loading}>تأكيد تغيير الحالة</Button>
      )}
    </div>
  );
}

export default OpsStatusPanel;
