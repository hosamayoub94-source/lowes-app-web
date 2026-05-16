/**
 * SalesTimeline — chronological activity timeline for a deal or customer.
 * Shows calls, emails, meetings, notes, stage changes, file uploads, etc.
 */
import React, { useState } from 'react';
import {
  ACTIVITY_TYPE_ICONS,
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE,
} from '../types/crm.types.js';

// Color per activity type
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
  return new Date(dateStr).toLocaleDateString('ar-SA');
}

export default function SalesTimeline({
  activities = [],
  onAddActivity,
  isLoading = false,
  isSubmitting = false,
  dealId,
  customerId,
}) {
  const [filterType, setFilterType] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({
    activity_type: ACTIVITY_TYPE.CALL,
    title: '',
    description: '',
    outcome: '',
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
      deal_id: dealId ?? null,
      customer_id: customerId ?? null,
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
    <div style={{ direction: 'rtl' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, flexWrap: 'wrap', gap: 8,
      }}>
        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {FILTER_OPTIONS.slice(0, 6).map(o => (
            <button
              key={o.value}
              onClick={() => setFilterType(o.value)}
              style={{
                background: filterType === o.value ? '#0ea5e9' : '#f1f5f9',
                color: filterType === o.value ? '#fff' : '#475569',
                border: 'none', borderRadius: 20,
                padding: '3px 10px', fontSize: 11, cursor: 'pointer',
              }}
            >
              {o.value !== 'all' && (ACTIVITY_TYPE_ICONS[o.value] ?? '')} {o.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowAddForm(v => !v)}
          style={{
            background: '#0ea5e9', color: '#fff', border: 'none',
            borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
          }}
        >
          + تسجيل نشاط
        </button>
      </div>

      {/* Add activity form */}
      {showAddForm && (
        <form
          onSubmit={handleSubmit}
          style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
            padding: 16, marginBottom: 14,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                النوع
              </label>
              <select
                value={form.activity_type}
                onChange={e => setForm(f => ({ ...f, activity_type: e.target.value }))}
                style={{
                  width: '100%', border: '1px solid #e2e8f0', borderRadius: 6,
                  padding: '7px 10px', fontSize: 13, direction: 'rtl', boxSizing: 'border-box',
                }}
              >
                {Object.entries(ACTIVITY_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{ACTIVITY_TYPE_ICONS[v]} {l}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                العنوان *
              </label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
                placeholder="عنوان النشاط"
                style={{
                  width: '100%', border: '1px solid #e2e8f0', borderRadius: 6,
                  padding: '7px 10px', fontSize: 13, direction: 'rtl', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                الوصف
              </label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="تفاصيل اختيارية"
                style={{
                  width: '100%', border: '1px solid #e2e8f0', borderRadius: 6,
                  padding: '7px 10px', fontSize: 13, direction: 'rtl', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                المدة (دقائق)
              </label>
              <input
                type="number"
                min="1"
                value={form.duration_minutes}
                onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
                placeholder="اختياري"
                style={{
                  width: '100%', border: '1px solid #e2e8f0', borderRadius: 6,
                  padding: '7px 10px', fontSize: 13, boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
              النتيجة
            </label>
            <input
              value={form.outcome}
              onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))}
              placeholder="ما هي النتيجة؟"
              style={{
                width: '100%', border: '1px solid #e2e8f0', borderRadius: 6,
                padding: '7px 10px', fontSize: 13, direction: 'rtl', boxSizing: 'border-box',
                marginBottom: 10,
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                background: '#0ea5e9', color: '#fff', border: 'none',
                borderRadius: 6, padding: '7px 18px', fontSize: 12, cursor: 'pointer',
              }}
            >
              {isSubmitting ? 'جاري الحفظ...' : 'حفظ'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              style={{
                background: 'transparent', color: '#64748b',
                border: '1px solid #e2e8f0', borderRadius: 6,
                padding: '7px 14px', fontSize: 12, cursor: 'pointer',
              }}
            >
              إلغاء
            </button>
          </div>
        </form>
      )}

      {/* Timeline */}
      {isLoading ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24, fontSize: 13 }}>
          جاري التحميل...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32, fontSize: 13 }}>
          لا توجد أنشطة مسجلة
        </div>
      ) : (
        <div style={{ position: 'relative', paddingRight: 28 }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute', right: 11, top: 0, bottom: 0,
            width: 2, background: '#e2e8f0',
          }} />

          {filtered.map((activity, idx) => {
            const color = TYPE_COLORS[activity.activity_type] ?? '#64748b';
            const icon = ACTIVITY_TYPE_ICONS[activity.activity_type] ?? '📋';

            return (
              <div
                key={activity.id}
                style={{
                  position: 'relative', marginBottom: idx < filtered.length - 1 ? 20 : 0,
                  paddingRight: 0,
                }}
              >
                {/* Dot */}
                <div style={{
                  position: 'absolute', right: -21, top: 8,
                  width: 22, height: 22, borderRadius: '50%',
                  background: color, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, zIndex: 1,
                }}>
                  {icon}
                </div>

                {/* Card */}
                <div style={{
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8, padding: '10px 14px',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 4,
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                      {activity.title}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {timeAgo(activity.created_at)}
                    </span>
                  </div>

                  {activity.description && (
                    <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b' }}>
                      {activity.description}
                    </p>
                  )}

                  {activity.outcome && (
                    <p style={{ margin: 0, fontSize: 12, color: '#0ea5e9', fontStyle: 'italic' }}>
                      النتيجة: {activity.outcome}
                    </p>
                  )}

                  {activity.duration_minutes && (
                    <span style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, display: 'block' }}>
                      ⏱ {activity.duration_minutes} دقيقة
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
