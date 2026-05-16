/**
 * CustomerProfile — full profile panel for a single customer.
 * Shows: info, contacts, linked deals, recent activities, notes.
 */
import React, { useState, useEffect } from 'react';
import { ACTIVITY_TYPE_ICONS, ACTIVITY_TYPE_LABELS, formatCurrency } from '../types/crm.types.js';
import { useCustomerProfile } from '../hooks/useCRM.js';

const TABS = [
  { key: 'overview', label: 'نظرة عامة' },
  { key: 'contacts', label: 'جهات الاتصال' },
  { key: 'deals', label: 'الصفقات' },
  { key: 'activities', label: 'الأنشطة' },
  { key: 'notes', label: 'الملاحظات' },
];

export default function CustomerProfile({ customerId, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [noteText, setNoteText] = useState('');

  const {
    customer, contacts, deals, activities, notes,
    isLoading, isSubmitting,
    addNote, deleteNote, updateCustomer,
  } = useCustomerProfile(customerId);

  if (isLoading && !customer) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>جاري التحميل...</div>
    );
  }

  if (!customer) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>لم يتم العثور على العميل</div>
    );
  }

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addNote({ customer_id: customerId, content: noteText });
    setNoteText('');
  };

  return (
    <div style={{ direction: 'rtl', fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        padding: '20px 24px',
        borderRadius: '10px 10px 0 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <h2 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 700 }}>
            {customer.company_name}
          </h2>
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            {customer.industry && (
              <span style={{ color: '#94a3b8', fontSize: 12 }}>{customer.industry}</span>
            )}
            {customer.city && (
              <span style={{ color: '#94a3b8', fontSize: 12 }}>📍 {customer.city}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>
              {formatCurrency(customer.total_revenue || 0, 'SAR')}
            </div>
            <div style={{ color: '#94a3b8', fontSize: 10 }}>إجمالي الإيرادات</div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.1)', border: 'none',
                color: '#fff', borderRadius: 6, padding: '6px 12px',
                cursor: 'pointer', fontSize: 12,
              }}
            >
              إغلاق
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', borderBottom: '1px solid #e2e8f0',
        background: '#fff', padding: '0 16px',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 14px', fontSize: 13, fontWeight: 500,
              color: activeTab === tab.key ? '#0ea5e9' : '#64748b',
              borderBottom: `2px solid ${activeTab === tab.key ? '#0ea5e9' : 'transparent'}`,
              marginBottom: -1,
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ background: '#f8fafc', padding: 20, borderRadius: '0 0 10px 10px' }}>

        {/* Overview */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'الموقع الإلكتروني', value: customer.website },
              { label: 'العنوان', value: customer.address },
              { label: 'الدولة', value: customer.country },
              { label: 'إجمالي الصفقات', value: customer.total_deals },
              { label: 'الحالة', value: customer.status === 'active' ? 'نشط' : 'غير نشط' },
              {
                label: 'آخر تواصل',
                value: customer.last_contact_at
                  ? new Date(customer.last_contact_at).toLocaleDateString('ar-SA')
                  : 'لا يوجد',
              },
            ].map(({ label, value }) => value ? (
              <div key={label} style={{
                background: '#fff', borderRadius: 8, padding: '12px 14px',
                border: '1px solid #e2e8f0',
              }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 500 }}>{value}</div>
              </div>
            ) : null)}
          </div>
        )}

        {/* Contacts */}
        {activeTab === 'contacts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {contacts.length === 0 && (
              <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
                لا توجد جهات اتصال مضافة
              </p>
            )}
            {contacts.map(c => (
              <div key={c.id} style={{
                background: '#fff', borderRadius: 8, padding: '12px 14px',
                border: '1px solid #e2e8f0', display: 'flex', gap: 12, alignItems: 'center',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: c.is_primary ? '#0ea5e9' : '#e2e8f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: c.is_primary ? '#fff' : '#64748b', fontSize: 14, fontWeight: 600,
                  flexShrink: 0,
                }}>
                  {c.full_name?.[0] ?? '?'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                    {c.full_name}
                    {c.is_primary && (
                      <span style={{
                        marginRight: 6, fontSize: 10, background: '#dbeafe', color: '#1d4ed8',
                        padding: '1px 6px', borderRadius: 10,
                      }}>رئيسي</span>
                    )}
                  </div>
                  {c.role && <div style={{ fontSize: 11, color: '#64748b' }}>{c.role}</div>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                    {c.email && <span style={{ fontSize: 11, color: '#0ea5e9' }}>✉️ {c.email}</span>}
                    {c.phone && <span style={{ fontSize: 11, color: '#64748b' }}>📞 {c.phone}</span>}
                    {c.whatsapp && <span style={{ fontSize: 11, color: '#22c55e' }}>💬 {c.whatsapp}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Deals */}
        {activeTab === 'deals' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {deals.length === 0 && (
              <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>لا توجد صفقات</p>
            )}
            {deals.map(d => (
              <div key={d.id} style={{
                background: '#fff', borderRadius: 8, padding: '12px 14px',
                border: '1px solid #e2e8f0', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{d.title}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {d.status === 'won' ? '✅ مكتملة' : d.status === 'lost' ? '❌ خاسرة' : '🔄 مفتوحة'}
                  </div>
                </div>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                  {formatCurrency(d.value, d.currency)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Activities */}
        {activeTab === 'activities' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activities.length === 0 && (
              <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>لا توجد أنشطة</p>
            )}
            {activities.map(a => (
              <div key={a.id} style={{
                background: '#fff', borderRadius: 8, padding: '12px 14px',
                border: '1px solid #e2e8f0', display: 'flex', gap: 12,
              }}>
                <span style={{ fontSize: 18 }}>
                  {ACTIVITY_TYPE_ICONS[a.activity_type] ?? '📋'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{a.title}</div>
                  {a.description && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{a.description}</div>
                  )}
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    {new Date(a.created_at).toLocaleDateString('ar-SA')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Notes */}
        {activeTab === 'notes' && (
          <div>
            {/* Add note */}
            <div style={{
              background: '#fff', borderRadius: 8, padding: 14, border: '1px solid #e2e8f0',
              marginBottom: 12,
            }}>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="أضف ملاحظة..."
                rows={3}
                style={{
                  width: '100%', border: '1px solid #e2e8f0', borderRadius: 6,
                  padding: '8px 10px', fontSize: 13, resize: 'vertical',
                  direction: 'rtl', boxSizing: 'border-box',
                }}
              />
              <button
                onClick={handleAddNote}
                disabled={isSubmitting || !noteText.trim()}
                style={{
                  marginTop: 8, background: '#0ea5e9', color: '#fff',
                  border: 'none', borderRadius: 6, padding: '7px 16px',
                  fontSize: 12, cursor: 'pointer',
                  opacity: isSubmitting || !noteText.trim() ? 0.6 : 1,
                }}
              >
                {isSubmitting ? 'جاري الحفظ...' : 'حفظ الملاحظة'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {notes.length === 0 && (
                <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>لا توجد ملاحظات</p>
              )}
              {notes.map(n => (
                <div key={n.id} style={{
                  background: '#fff', borderRadius: 8, padding: '12px 14px',
                  border: '1px solid #e2e8f0',
                }}>
                  <p style={{ margin: '0 0 6px', fontSize: 13, color: '#0f172a' }}>{n.content}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {new Date(n.created_at).toLocaleDateString('ar-SA')}
                    </span>
                    <button
                      onClick={() => deleteNote(n.id)}
                      style={{
                        background: 'none', border: 'none', color: '#ef4444',
                        cursor: 'pointer', fontSize: 11,
                      }}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
