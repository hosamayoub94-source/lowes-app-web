/**
 * SalesTimeline — chronological activity timeline for a deal or customer.
 * Task #69/#8: Full Tailwind rewrite — no inline CSS.
 *
 * Note: dynamic per-activity dot color still uses a style prop because
 * Tailwind cannot safely construct arbitrary hex color classes at runtime.
 */
import React, { useState } from 'react';
import { cn } from '@utils/classNames';
import { Spinner } from '@components/ui/Loading';
import {
  ACTIVITY_TYPE_ICONS,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE,
} from '../types/crm.types.js';

// Per-type dot color (hex — safe as inline style only)
const TYPE_COLORS = {
  [ACTIVITY_TYPE.CALL]:         '#3b82f6',
  [ACTIVITY_TYPE.EMAIL]:        '#0ea5e9',
  [ACTIVITY_TYPE.MEETING]:      '#8b5cf6',
  [ACTIVITY_TYPE.NOTE]:         '#f59e0b',
  [ACTIVITY_TYPE.STAGE_CHANGE]: '#22c55e',
  [ACTIVITY_TYPE.FILE]:         '#64748b',
  [ACTIVITY_TYPE.TASK]:         '#f97316',
  [ACTIVITY_TYPE.WHATSAPP]:     '#16a34a',
  [ACTIVITY_TYPE.SMS]:          '#0891b2',
  [ACTIVITY_TYPE.VISIT]:        '#dc2626',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'الآن';
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 30) return `منذ ${d} يوم`;
  return new Date(dateStr).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory');
}

// ── Shared label + input styles ────────────────────────────────
function FieldLabel({ children }) {
  return <label className="text-xs font-semibold text-muted block mb-1">{children}</label>;
}
const inputCls = 'w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-teal/40';

// ── Add activity form ──────────────────────────────────────────
function AddForm({ form, setForm, onSubmit, onCancel, isSubmitting }) {
  return (
    <form
      onSubmit={onSubmit}
      className="bg-surface border border-border rounded-xl p-4 mb-4 space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>النوع</FieldLabel>
          <select
            value={form.activity_type}
            onChange={e => setForm(f => ({ ...f, activity_type: e.target.value }))}
            className={inputCls}
          >
            {Object.entries(ACTIVITY_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{ACTIVITY_TYPE_ICONS[v]} {l}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>العنوان *</FieldLabel>
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            required
            placeholder="عنوان النشاط"
            className={inputCls}
          />
        </div>
        <div>
          <FieldLabel>الوصف</FieldLabel>
          <input
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="تفاصيل اختيارية"
            className={inputCls}
          />
        </div>
        <div>
          <FieldLabel>المدة (دقائق)</FieldLabel>
          <input
            type="number"
            min="1"
            value={form.duration_minutes}
            onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
            placeholder="اختياري"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <FieldLabel>النتيجة</FieldLabel>
        <input
          value={form.outcome}
          onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))}
          placeholder="ما هي النتيجة؟"
          className={inputCls}
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-teal text-navy rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
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

// ── Main component ─────────────────────────────────────────────
export default function SalesTimeline({
  activities = [],
  onAddActivity,
  isLoading    = false,
  isSubmitting = false,
  dealId,
  customerId,
}) {
  const [filterType,   setFilterType]   = useState('all');
  const [showAddForm,  setShowAddForm]  = useState(false);
  const [form, setForm] = useState({
    activity_type:    ACTIVITY_TYPE.CALL,
    title:            '',
    description:      '',
    outcome:          '',
    duration_minutes: '',
  });

  const filtered =
    filterType === 'all'
      ? activities
      : activities.filter(a => a.activity_type === filterType);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.title) return;
    await onAddActivity?.({
      ...form,
      deal_id:          dealId     ?? null,
      customer_id:      customerId ?? null,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
    });
    setForm({
      activity_type: ACTIVITY_TYPE.CALL,
      title: '', description: '', outcome: '', duration_minutes: '',
    });
    setShowAddForm(false);
  };

  const FILTER_OPTIONS = [
    { value: 'all', label: 'الكل' },
    ...Object.entries(ACTIVITY_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l })),
  ];

  return (
    <div className="space-y-4">

      {/* ── Toolbar ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* Filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {FILTER_OPTIONS.slice(0, 6).map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => setFilterType(o.value)}
              className={cn(
                'px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors',
                filterType === o.value
                  ? 'bg-teal text-navy border-teal'
                  : 'bg-surface-alt text-muted border-transparent hover:text-text',
              )}
            >
              {o.value !== 'all' && (ACTIVITY_TYPE_ICONS[o.value] ?? '')} {o.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm(v => !v)}
          className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-teal text-navy rounded-lg hover:opacity-90 transition-opacity"
        >
          + تسجيل نشاط
        </button>
      </div>

      {/* ── Add form ── */}
      {showAddForm && (
        <AddForm
          form={form}
          setForm={setForm}
          onSubmit={handleSubmit}
          onCancel={() => setShowAddForm(false)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* ── Timeline ── */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted py-8">لا توجد أنشطة مسجلة</p>
      ) : (
        /* RTL: line on the right, dots offset to the right */
        <div className="relative pe-7">
          {/* Vertical line */}
          <div className="absolute end-[11px] top-0 bottom-0 w-px bg-border" />

          <div className="space-y-5">
            {filtered.map(activity => {
              const color = TYPE_COLORS[activity.activity_type] ?? '#64748b';
              const icon  = ACTIVITY_TYPE_ICONS[activity.activity_type] ?? '📋';

              return (
                <div key={activity.id} className="relative">
                  {/* Dot — dynamic color must stay inline */}
                  <div
                    className="absolute -end-[21px] top-2 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] z-10 shrink-0"
                    style={{ background: color }}
                    aria-hidden
                  >
                    {icon}
                  </div>

                  {/* Card */}
                  <div className="bg-surface border border-border rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-sm font-semibold text-text truncate">
                        {activity.title}
                      </span>
                      <span className="text-[11px] text-muted shrink-0">
                        {timeAgo(activity.created_at)}
                      </span>
                    </div>

                    {activity.description && (
                      <p className="text-xs text-muted mb-1">{activity.description}</p>
                    )}

                    {activity.outcome && (
                      <p className="text-xs text-teal italic">
                        النتيجة: {activity.outcome}
                      </p>
                    )}

                    {activity.duration_minutes && (
                      <span className="text-[10px] text-muted mt-1 block">
                        ⏱ {activity.duration_minutes} دقيقة
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
