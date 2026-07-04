/**
 * CRMDashboard — main sales pipeline & CRM overview page.
 * Task #69: Full mobile-first responsive rewrite using Tailwind + theme tokens.
 *
 * Sections:
 *   1. Page header + new deal CTA
 *   2. KPI grid (2-col mobile → 3-col md → 6-col xl)
 *   3. Overdue followup alert
 *   4. View tabs (horizontal scroll on mobile)
 *   5. View content (kanban / leads / followups / timeline)
 *   6. Customer profile modal
 */
import React, { useState } from 'react';
import { useAuth } from '@hooks/useAuth';
import { cn } from '@utils/classNames';
import { Button } from '@components/ui/Button';
import { Spinner } from '@components/ui/Loading';
import PipelineKanban from '../components/PipelineKanban.jsx';
import LeadCard from '../components/LeadCard.jsx';
import FollowupScheduler from '../components/FollowupScheduler.jsx';
import SalesTimeline from '../components/SalesTimeline.jsx';
import CustomerProfile from '../components/CustomerProfile.jsx';
import {
  useCRMBootstrap,
  usePipelineBoard,
  useLeadPanel,
  useCRMDashboard,
  useActivities,
  useCRMActions,
  useSelectedCustomerId,
} from '../hooks/useCRM.js';
import { formatCurrency } from '../types/crm.types.js';

// ── KPI Card ──────────────────────────────────────────────────────────────
const KPI_TONES = {
  blue:   { bar: 'bg-blue',   text: 'text-blue-fg',   card: 'bg-blue-bg   border-blue/20'   },
  green:  { bar: 'bg-green',  text: 'text-green-fg',  card: 'bg-green-bg  border-green/20'  },
  purple: { bar: 'bg-purple', text: 'text-purple-fg', card: 'bg-purple-bg border-purple/20' },
  amber:  { bar: 'bg-amber',  text: 'text-amber-fg',  card: 'bg-amber-bg  border-amber/20'  },
  red:    { bar: 'bg-red',    text: 'text-red-fg',    card: 'bg-red-bg    border-red/20'    },
  teal:   { bar: 'bg-teal',   text: 'text-teal',      card: 'bg-surface   border-border'    },
};

function KPICard({ label, value, sub, icon, tone = 'teal', danger = false }) {
  const t = danger ? KPI_TONES.red : (KPI_TONES[tone] ?? KPI_TONES.teal);
  return (
    <div className={cn(
      'relative rounded-xl border p-4 overflow-hidden bg-surface',
      danger ? 'bg-red-bg border-red/20' : 'border-border',
    )}>
      {/* top accent bar */}
      <div className={cn('absolute top-0 inset-x-0 h-0.5', t.bar)} />

      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl" aria-hidden>{icon}</span>
        <span className="text-xs text-muted leading-tight">{label}</span>
      </div>
      <div className={cn(
        'text-2xl font-extrabold tracking-tight',
        danger ? 'text-red-fg' : 'text-text',
      )}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted mt-1">{sub}</div>}
    </div>
  );
}

// ── View tabs ─────────────────────────────────────────────────────────────
function ViewTabs({ active, onChange, leadsCount }) {
  const tabs = [
    { key: 'kanban',    label: '📋 خط المبيعات'                        },
    { key: 'leads',     label: `👥 العملاء (${leadsCount})`            },
    { key: 'followups', label: '🗓 المتابعات'                          },
    { key: 'timeline',  label: '📅 الأنشطة'                           },
  ];

  return (
    /* overflow-x-auto + pb-px so the active border-bottom shows */
    <div className="flex gap-1 border-b border-border overflow-x-auto pb-px scrollbar-none -mx-1 px-1">
      {tabs.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn(
            'shrink-0 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap',
            'border-b-2 transition-colors -mb-px',
            active === t.key
              ? 'text-teal border-teal'
              : 'text-muted border-transparent hover:text-text',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
export default function CRMDashboard({ userId: userIdProp }) {
  // الراوتر لا يمرّر userId — نأخذه من الجلسة (كان undefined فتنكسر بيانات المالك).
  const { id: authId } = useAuth();
  const userId = userIdProp ?? authId;
  const { initialized } = useCRMBootstrap(userId);

  const { stages, dealsMap, kpis, moveDeal, isLoading: boardLoading } = usePipelineBoard();
  const { leads, isLoading: leadsLoading, createLead, convertLead } = useLeadPanel();
  const { overdueFollowups, isLoading: dashLoading } = useCRMDashboard();
  const activities = useActivities();
  const { selectDeal, selectCustomer, createDeal, addActivity } = useCRMActions();
  const selectedCustomerId = useSelectedCustomerId();

  const [activeView, setActiveView] = useState('kanban');
  const [showCustomerModal, setShowCustomerModal] = useState(false);

  /* ── Loading gate ── */
  if (!initialized && boardLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted text-sm gap-3">
        <Spinner /> جاري تحميل نظام المبيعات…
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24 sm:pb-8">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-extrabold text-text flex items-center gap-2">
            🚀 <span>خط المبيعات</span>
          </h1>
          <p className="text-sm text-muted mt-0.5">إدارة الصفقات والعملاء المحتملين</p>
        </div>
        <Button
          variant="teal"
          size="md"
          onClick={() => createDeal({ title: 'صفقة جديدة', value: 0 })}
        >
          + صفقة جديدة
        </Button>
      </div>

      {/* ── KPI grid: 2 cols mobile → 3 md → 6 xl ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KPICard
          icon="🔄"
          tone="blue"
          label="الصفقات المفتوحة"
          value={kpis.totalOpenDeals}
          sub={`قيمة: ${formatCurrency(kpis.pipelineValue, 'USD')}`}
        />
        <KPICard
          icon="✅"
          tone="green"
          label="الصفقات المكتملة"
          value={kpis.totalWonDeals}
          sub={`إجمالي: ${formatCurrency(kpis.wonValue, 'USD')}`}
        />
        <KPICard
          icon="🎯"
          tone="purple"
          label="معدل الفوز"
          value={`${kpis.winRate}%`}
          sub="من الصفقات المغلقة"
        />
        <KPICard
          icon="📊"
          tone="amber"
          label="تحويل العملاء"
          value={`${kpis.leadConversionRate}%`}
          sub={`${leads.length} عميل محتمل`}
        />
        <KPICard
          icon="⚠️"
          tone="red"
          label="متابعات متأخرة"
          value={kpis.overdueFollowups}
          sub={`${kpis.pendingFollowups} معلق`}
          danger={kpis.overdueFollowups > 0}
        />
        <KPICard
          icon="💰"
          tone="teal"
          label="متوسط قيمة الصفقة"
          value={formatCurrency(kpis.avgDealValue, 'USD')}
          sub="للصفقات المكتملة"
        />
      </div>

      {/* ── Overdue alert ── */}
      {overdueFollowups.length > 0 && (
        <div className="flex items-center gap-3 p-3 sm:p-4 rounded-xl bg-red-bg border border-red/20 text-red-fg flex-wrap sm:flex-nowrap">
          <span className="text-xl shrink-0" aria-hidden>⚠️</span>
          <p className="text-sm flex-1 min-w-0">
            لديك <strong>{overdueFollowups.length}</strong> متابعة متأخرة تحتاج إلى اهتمام فوري
          </p>
          <Button
            variant="danger"
            size="sm"
            className="shrink-0"
            onClick={() => setActiveView('followups')}
          >
            عرض الكل
          </Button>
        </div>
      )}

      {/* ── Tabs ── */}
      <ViewTabs
        active={activeView}
        onChange={setActiveView}
        leadsCount={leads.length}
      />

      {/* ── View content ── */}
      <div className="bg-surface rounded-2xl border border-border p-3 sm:p-5 overflow-hidden">

        {/* Kanban */}
        {activeView === 'kanban' && (
          <PipelineKanban
            stages={stages}
            dealsMap={dealsMap}
            onMoveDeal={moveDeal}
            onSelectDeal={d => {
              selectDeal(d.id);
              if (d.customer_id) {
                selectCustomer(d.customer_id);
                setShowCustomerModal(true);
              }
            }}
            onCreateDeal={stageId => createDeal({ title: 'صفقة جديدة', stage_id: stageId, value: 0 })}
            isLoading={boardLoading}
          />
        )}

        {/* Leads */}
        {activeView === 'leads' && (
          <div className="space-y-4">
            <Button
              variant="teal"
              size="sm"
              onClick={() => createLead({ title: 'عميل محتمل جديد', estimated_value: 0 })}
            >
              + إضافة عميل محتمل
            </Button>

            {leadsLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : leads.length === 0 ? (
              <p className="text-center text-muted text-sm py-8">لا يوجد عملاء محتملون</p>
            ) : (
              <div className="space-y-2.5">
                {leads.map(lead => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onSelect={lead => {
                      if (lead.customer_id) {
                        selectCustomer(lead.customer_id);
                        setShowCustomerModal(true);
                      }
                    }}
                    onConvert={() => convertLead(lead.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Followups */}
        {activeView === 'followups' && <FollowupScheduler />}

        {/* Timeline */}
        {activeView === 'timeline' && (
          <SalesTimeline
            activities={activities}
            onAddActivity={addActivity}
          />
        )}
      </div>

      {/* ── Customer profile modal ── */}
      {showCustomerModal && selectedCustomerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto shadow-modal">
            <CustomerProfile
              customerId={selectedCustomerId}
              onClose={() => {
                setShowCustomerModal(false);
                selectCustomer(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
