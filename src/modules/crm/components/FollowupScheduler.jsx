/**
 * FollowupScheduler — displays upcoming/overdue followups + allows scheduling new ones.
 */
import React, { useState } from 'react';
import {
  FOLLOWUP_TYPE_LABELS,
  FOLLOWUP_TYPE_ICONS,
  FOLLOWUP_STATUS_LABELS,
  FOLLOWUP_STATUS_COLORS,
} from '../types/crm.types.js';
import { useFollowupPanel } from '../hooks/useCRM.js';

const TYPE_OPTIONS = Object.entries(FOLLOWUP_TYPE_LABELS).map(([value, label]) => ({ value, label }));

const STATUS_COLORS = {
  pending:   { bg: '#fef3c7', color: '#92400e' },
  overdue:   { bg: '#fee2e2', color: '#991b1b' },
  done:      { bg: '#d1fae5', color: '#065f46' },
  cancelled: { bg: '#f1f5f9', color: '#475569' },
};

const EMPTY_FORM = {
  title: '',
  followup_type: 'call',
  due_at: '',
  description: '',
};

export default function FollowupScheduler({ dealId, customerId, leadId }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [activeTab, setActiveTab] = useState('active'); // active | done

  const {
    overdue, dueToday, upcoming, completed,
    isLoading, isSubmitting,
    scheduleFollowup, completeFollowup, cancelFollowup,
  } = useFollowupPanel();

  // Filter by entity if provided
  const filterByEntity = list =>
    dealId || customerId || leadId
      ? list.filter(f =>
          (dealId && f.deal_id === dealId) ||
          (customerId && f.customer_id === customerId) ||
          (leadId && f.lead_id === leadId)
        )
      : list;

  const activeFollowups = filterByEntity([...overdue, ...dueToday, ...upcoming]);
  const doneFollowups = filterByEntity(completed);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.title || !form.due_at) return;
    await scheduleFollowup({
      ...form,
      deal_id: dealId ?? null,
      customer_id: customerId ?? null,
      lead_id: leadId ?? null,
    });
    setForm({ ...EMPTY_FORM });
    setShowForm(false);
  };

  const displayList = activeTab === 'active' ? activeFollowups : doneFollowups;

  return (
    <div style={{ direction: 'rtl' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { key: 'active', label: `نشطة (${activeFollowups.length})` },
            { key: 'done', label: `مكتملة (${doneFollowups.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                background: activeTab === t.key ? '#0ea5e9' : 'transparent',
                color: activeTab === t.key ? '#fff' : '#64748b',
                border: `1px solid ${activeTab === t.key ? '#0ea5e9' : '#e2e8f0'}`,
                borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{
            background: '#0ea5e9', color: '#fff', border: 'none',
            borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
          }}
        >
          + جدولة متابعة
        </button>
      </div>

      {/* New followup form */}
      {showForm && (
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
                العنوان *
              </label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
                placeholder="عنوان المتابعة"
                style={{
                  width: '100%', border: '1px solid #e2e8f0', borderRadius: 6,
                  padding: '7px 10px', fontSize: 13, direction: 'rtl', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                النوع
              </label>
              <select
                value={form.followup_type}
                onChange={e => setForm(f => ({ ...f, followup_type: e.target.value }))}
                style={{
                  width: '100%', border: '1px solid #e2e8f0', borderRadius: 6,
                  padding: '7px 10px', fontSize: 13, direction: 'rtl', boxSizing: 'border-box',
                }}
              >
                {TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {FOLLOWUP_TYPE_ICONS[o.value]} {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                الموعد *
              </label>
              <input
                type="datetime-local"
                value={form.due_at}
                onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))}
                required
                style={{
                  width: '100%', border: '1px solid #e2e8f0', borderRadius: 6,
                  padding: '7px 10px', fontSize: 13, boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>
                ملاحظات
              </label>
              <input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="اختياري"
                style={{
                  width: '100%', border: '1px solid #e2e8f0', borderRadius: 6,
                  padding: '7px 10px', fontSize: 13, direction: 'rtl', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
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
              onClick={() => setShowForm(false)}
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

      {/* Followup list */}
      {isLoading ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 20 }}>
          جاري التحميل...
        </div>
      ) : displayList.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 24 }}>
          {activeTab === 'active' ? 'لا توجد متابعات نشطة' : 'لا توجد متابعات مكتملة'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {displayList.map(f => {
            const statusStyle = STATUS_COLORS[f.status] ?? STATUS_COLORS.pending;
            const icon = FOLLOWUP_TYPE_ICONS[f.followup_type] ?? '📋';
            const isOverdue = f.status === 'overdue';

            return (
              <div key={f.id} style={{
                background: '#fff',
                border: `1px solid ${isOverdue ? '#fca5a5' : '#e2e8f0'}`,
                borderRadius: 8, padding: '12px 14px',
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <span style={{ fontSize: 18, marginTop: 1 }}>{icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                      {f.title}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      background: statusStyle.bg, color: statusStyle.color,
                      padding: '1px 7px', borderRadius: 20,
                    }}>
                      {FOLLOWUP_STATUS_LABELS[f.status] ?? f.status}
                    </span>
                  </div>
                  {f.description && (
                    <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b' }}>
                      {f.description}
                    </p>
                  )}
                  <div style={{ fontSize: 11, color: isOverdue ? '#ef4444' : '#94a3b8' }}>
                    🗓 {new Date(f.due_at).toLocaleString('ar-SA')}
                  </div>
                </div>

                {/* Actions */}
                {f.status !== 'done' && f.status !== 'cancelled' && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => completeFollowup(f.id)}
                      style={{
                        background: '#d1fae5', color: '#065f46', border: 'none',
                        borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                      }}
                    >
                      ✓ مكتمل
                    </button>
                    <button
                      onClick={() => cancelFollowup(f.id)}
                      style={{
                        background: 'transparent', color: '#94a3b8',
                        border: '1px solid #e2e8f0', borderRadius: 6,
                        padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                      }}
                    >
                      إلغاء
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
