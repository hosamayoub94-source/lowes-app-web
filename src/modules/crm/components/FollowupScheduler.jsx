/**
 * FollowupScheduler — upcoming/overdue followups + schedule new ones.
 * Task #69/#8: Full Tailwind rewrite — no inline CSS.
 */
import React, { useState } from 'react';
import { cn } from '@utils/classNames';
import { Spinner } from '@components/ui/Loading';
import {
  FOLLOWUP_TYPE_LABELS,
  FOLLOWUP_TYPE_ICONS,
  FOLLOWUP_STATUS_LABELS,
} from '../types/crm.types.js';
import { useFollowupPanel } from '../hooks/useCRM.js';

const TYPE_OPTIONS = Object.entries(FOLLOWUP_TYPE_LABELS).map(([value, label]) => ({ value, label }));

// Status → Tailwind badge tone
const STATUS_TONE = {
  pending:   'bg-amber-bg  text-amber-fg',
  overdue:   'bg-red-bg    text-red-fg',
  done:      'bg-green-bg  text-green-fg',
  cancelled: 'bg-surface-alt text-muted',
};

const EMPTY_FORM = { title: '', followup_type: 'call', due_at: '', description: '' };

// ── Shared form field wrapper ──────────────────────────────────
function FieldLabel({ children }) {
  return <label className="text-xs font-semibold text-muted block mb-1">{children}</label>;
}
const inputCls = 'w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40';

// ── Add followup form ──────────────────────────────────────────
function AddForm({ form, setForm, onSubmit, onCancel, isSubmitting }) {
  return (
    <form
      onSubmit={onSubmit}
      className="bg-surface border border-border rounded-xl p-4 mb-4 space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>العنوان *</FieldLabel>
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            required
            placeholder="عنوان المتابعة"
            className={inputCls}
          />
        </div>
        <div>
          <FieldLabel>النوع</FieldLabel>
          <select
            value={form.followup_type}
            onChange={e => setForm(f => ({ ...f, followup_type: e.target.value }))}
            className={inputCls}
          >
            {TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {FOLLOWUP_TYPE_ICONS[o.value]} {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>الموعد *</FieldLabel>
          <input
            type="datetime-local"
            value={form.due_at}
            onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))}
            required
            className={inputCls}
          />
        </div>
        <div>
          <FieldLabel>ملاحظات</FieldLabel>
          <input
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="اختياري"
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-teal text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {isSubmitting ? <Spinner size="sm" /> : null}
          {isSubmitting ? 'جاري الحفظ...' : 'حفظ'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 text-xs font-semibold text-muted border border-border rounded-lg hover:text-text transition-colors"
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}

// ── Single followup row ────────────────────────────────────────
function FollowupRow({ f, onComplete, onCancel: onCancelFu }) {
  const isOverdue  = f.status === 'overdue';
  const badgeTone  = STATUS_TONE[f.status] ?? STATUS_TONE.pending;
  const icon       = FOLLOWUP_TYPE_ICONS[f.followup_type] ?? '📋';
  const canAct     = f.status !== 'done' && f.status !== 'cancelled';

  return (
    <div className={cn(
      'flex items-start gap-3 rounded-xl border px-3 sm:px-4 py-3 bg-surface transition-colors',
      isOverdue ? 'border-red/30' : 'border-border',
    )}>
      <span className="text-lg shrink-0 mt-0.5" aria-hidden>{icon}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-semibold text-text truncate">{f.title}</span>
          <span className={cn(
            'text-[10px] font-bold px-2 py-px rounded-full shrink-0',
            badgeTone,
          )}>
            {FOLLOWUP_STATUS_LABELS[f.status] ?? f.status}
          </span>
        </div>

        {f.description && (
          <p className="text-xs text-muted mb-1 line-clamp-2">{f.description}</p>
        )}

        <div className={cn(
          'text-[11px]',
          isOverdue ? 'text-red-fg font-medium' : 'text-muted',
        )}>
          🗓 {new Date(f.due_at).toLocaleString('ar-SA-u-nu-latn')}
        </div>
      </div>

      {canAct && (
        <div className="flex gap-1.5 shrink-0 mt-0.5">
          <button
            type="button"
            onClick={() => onComplete(f.id)}
            className="px-2.5 py-1 text-[11px] font-semibold bg-green-bg text-green-fg rounded-lg hover:opacity-90 transition-opacity"
          >
            ✓ مكتمل
          </button>
          <button
            type="button"
            onClick={() => onCancelFu(f.id)}
            className="px-2.5 py-1 text-[11px] font-semibold text-muted border border-border rounded-lg hover:text-text transition-colors"
          >
            إلغاء
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────
export default function FollowupScheduler({ dealId, customerId, leadId }) {
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [activeTab, setActiveTab] = useState('active');

  const {
    overdue, dueToday, upcoming, completed,
    isLoading, isSubmitting,
    scheduleFollowup, completeFollowup, cancelFollowup,
  } = useFollowupPanel();

  const filterByEntity = list =>
    dealId || customerId || leadId
      ? list.filter(f =>
          (dealId     && f.deal_id     === dealId) ||
          (customerId && f.customer_id === customerId) ||
          (leadId     && f.lead_id     === leadId)
        )
      : list;

  const activeFollowups = filterByEntity([...overdue, ...dueToday, ...upcoming]);
  const doneFollowups   = filterByEntity(completed);
  const displayList     = activeTab === 'active' ? activeFollowups : doneFollowups;

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.title || !form.due_at) return;
    await scheduleFollowup({
      ...form,
      deal_id:     dealId     ?? null,
      customer_id: customerId ?? null,
      lead_id:     leadId     ?? null,
    });
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
  };

  return (
    <div className="space-y-4">

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Tabs */}
        <div className="flex gap-1">
          {[
            { key: 'active', label: `نشطة (${activeFollowups.length})` },
            { key: 'done',   label: `مكتملة (${doneFollowups.length})` },
          ].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
                activeTab === t.key
                  ? 'bg-teal text-white border-teal'
                  : 'bg-transparent text-muted border-border hover:text-text',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="px-3 py-1.5 text-xs font-semibold bg-teal text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          + جدولة متابعة
        </button>
      </div>

      {/* ── Add form ── */}
      {showForm && (
        <AddForm
          form={form}
          setForm={setForm}
          onSubmit={handleSubmit}
          onCancel={() => setShowForm(false)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* ── List ── */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : displayList.length === 0 ? (
        <p className="text-center text-sm text-muted py-8">
          {activeTab === 'active' ? 'لا توجد متابعات نشطة' : 'لا توجد متابعات مكتملة'}
        </p>
      ) : (
        <div className="space-y-2">
          {displayList.map(f => (
            <FollowupRow
              key={f.id}
              f={f}
              onComplete={completeFollowup}
              onCancel={cancelFollowup}
            />
          ))}
        </div>
      )}
    </div>
  );
}
