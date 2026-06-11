/**
 * CustomerProfile — full profile panel for a single customer.
 * Task #69/#8: Full Tailwind rewrite — no inline CSS.
 *
 * Sections: header (gradient), tabs, overview / contacts / deals / activities / notes
 */
import React, { useState } from 'react';
import { cn } from '@utils/classNames';
import { Spinner } from '@components/ui/Loading';
import { ACTIVITY_TYPE_ICONS, formatCurrency } from '../types/crm.types.js';
import { useCustomerProfile } from '../hooks/useCRM.js';

const TABS = [
  { key: 'overview',    label: 'نظرة عامة'    },
  { key: 'contacts',   label: 'جهات الاتصال' },
  { key: 'deals',      label: 'الصفقات'       },
  { key: 'activities', label: 'الأنشطة'       },
  { key: 'notes',      label: 'الملاحظات'     },
];

// ── Small info cell (overview grid) ───────────────────────────
function InfoCell({ label, value }) {
  if (!value) return null;
  return (
    <div className="bg-surface-alt rounded-lg border border-border px-3 py-2.5">
      <div className="text-[11px] text-muted mb-0.5">{label}</div>
      <div className="text-sm font-medium text-text">{value}</div>
    </div>
  );
}

// ── Contact avatar ─────────────────────────────────────────────
function ContactAvatar({ name, isPrimary }) {
  return (
    <div className={cn(
      'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
      isPrimary ? 'bg-teal text-navy' : 'bg-surface-alt text-muted',
    )}>
      {name?.[0]?.toUpperCase() ?? '?'}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────
export default function CustomerProfile({ customerId, onClose }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [noteText, setNoteText]   = useState('');

  const {
    customer, contacts, deals, activities, notes,
    isLoading, isSubmitting,
    addNote, deleteNote,
  } = useCustomerProfile(customerId);

  if (isLoading && !customer) {
    return (
      <div className="flex items-center justify-center py-16 text-muted text-sm gap-3">
        <Spinner /> جاري التحميل...
      </div>
    );
  }

  if (!customer) {
    return (
      <p className="text-center text-muted text-sm py-16">لم يتم العثور على العميل</p>
    );
  }

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    await addNote({ customer_id: customerId, content: noteText });
    setNoteText('');
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl">

      {/* ── Header gradient ── */}
      <div className="bg-gradient-to-br from-navy to-[#1e3a5f] px-5 py-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-white text-base sm:text-lg font-bold">{customer.company_name}</h2>
          <div className="flex gap-3 mt-1.5 flex-wrap">
            {customer.industry && (
              <span className="text-[12px] text-white/60">{customer.industry}</span>
            )}
            {customer.city && (
              <span className="text-[12px] text-white/60">📍 {customer.city}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right hidden sm:block">
            <div className="text-white font-bold text-base">
              {formatCurrency(customer.total_revenue || 0, 'USD')}
            </div>
            <div className="text-[10px] text-white/50">إجمالي الإيرادات</div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
            >
              إغلاق
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-0 border-b border-border bg-surface overflow-x-auto scrollbar-none">
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'shrink-0 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap',
              'border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'text-teal border-teal'
                : 'text-muted border-transparent hover:text-text',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="bg-surface-alt flex-1 overflow-y-auto p-4 rounded-b-2xl">

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <InfoCell label="الموقع الإلكتروني" value={customer.website} />
            <InfoCell label="العنوان"            value={customer.address} />
            <InfoCell label="الدولة"             value={customer.country} />
            <InfoCell label="إجمالي الصفقات"     value={customer.total_deals} />
            <InfoCell
              label="الحالة"
              value={customer.status === 'active' ? 'نشط ✅' : 'غير نشط'}
            />
            <InfoCell
              label="آخر تواصل"
              value={
                customer.last_contact_at
                  ? new Date(customer.last_contact_at).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory')
                  : 'لا يوجد'
              }
            />
          </div>
        )}

        {/* Contacts */}
        {activeTab === 'contacts' && (
          <div className="space-y-2.5">
            {contacts.length === 0 && (
              <p className="text-center text-muted text-sm py-8">لا توجد جهات اتصال مضافة</p>
            )}
            {contacts.map(c => (
              <div
                key={c.id}
                className="flex items-center gap-3 bg-surface rounded-xl border border-border px-3 py-3"
              >
                <ContactAvatar name={c.full_name} isPrimary={c.is_primary} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-text truncate">{c.full_name}</span>
                    {c.is_primary && (
                      <span className="text-[10px] font-bold bg-blue-bg text-blue-fg px-2 py-px rounded-full shrink-0">
                        رئيسي
                      </span>
                    )}
                  </div>
                  {c.role && <div className="text-xs text-muted">{c.role}</div>}
                  <div className="flex gap-3 mt-1 flex-wrap">
                    {c.email    && <span className="text-xs text-teal">✉️ {c.email}</span>}
                    {c.phone    && <span className="text-xs text-muted">📞 {c.phone}</span>}
                    {c.whatsapp && <span className="text-xs text-green-fg">💬 {c.whatsapp}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Deals */}
        {activeTab === 'deals' && (
          <div className="space-y-2">
            {deals.length === 0 && (
              <p className="text-center text-muted text-sm py-8">لا توجد صفقات</p>
            )}
            {deals.map(d => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 bg-surface rounded-xl border border-border px-3 py-3"
              >
                <div>
                  <div className="text-sm font-semibold text-text">{d.title}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {d.status === 'won'  ? '✅ مكتملة'
                    : d.status === 'lost' ? '❌ خاسرة'
                    : '🔄 مفتوحة'}
                  </div>
                </div>
                <span className="text-sm font-bold text-text shrink-0">
                  {formatCurrency(d.value, d.currency)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Activities */}
        {activeTab === 'activities' && (
          <div className="space-y-2">
            {activities.length === 0 && (
              <p className="text-center text-muted text-sm py-8">لا توجد أنشطة</p>
            )}
            {activities.map(a => (
              <div
                key={a.id}
                className="flex items-start gap-3 bg-surface rounded-xl border border-border px-3 py-3"
              >
                <span className="text-lg shrink-0 mt-0.5" aria-hidden>
                  {ACTIVITY_TYPE_ICONS[a.activity_type] ?? '📋'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-text">{a.title}</div>
                  {a.description && (
                    <div className="text-xs text-muted mt-0.5">{a.description}</div>
                  )}
                  <div className="text-[11px] text-muted mt-1">
                    {new Date(a.created_at).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Notes */}
        {activeTab === 'notes' && (
          <div className="space-y-3">
            {/* Add note form */}
            <div className="bg-surface rounded-xl border border-border p-3">
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="أضف ملاحظة..."
                rows={3}
                className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/40 resize-none"
              />
              <button
                type="button"
                onClick={handleAddNote}
                disabled={isSubmitting || !noteText.trim()}
                className="mt-2 flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-teal text-navy rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isSubmitting ? <Spinner size="sm" /> : null}
                {isSubmitting ? 'جاري الحفظ...' : 'حفظ الملاحظة'}
              </button>
            </div>

            {/* Notes list */}
            {notes.length === 0 ? (
              <p className="text-center text-muted text-sm py-4">لا توجد ملاحظات</p>
            ) : (
              notes.map(n => (
                <div
                  key={n.id}
                  className="bg-surface rounded-xl border border-border px-3 py-3"
                >
                  <p className="text-sm text-text mb-2">{n.content}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted">
                      {new Date(n.created_at).toLocaleDateString('ar-SA-u-nu-latn-ca-gregory')}
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteNote(n.id)}
                      className="text-xs text-red-fg hover:underline"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
}
