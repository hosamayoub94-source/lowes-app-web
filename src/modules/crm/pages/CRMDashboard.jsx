/**
 * CRMDashboard — main sales pipeline & CRM overview page.
 *
 * Sections:
 *   1. KPI strip (open deals, pipeline value, win rate, overdue followups)
 *   2. Kanban pipeline board
 *   3. Leads list (sidebar / collapsible)
 *   4. Overdue followups alert strip
 *   5. Recent activity timeline
 */
import React, { useState } from 'react';
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

function KPICard({ label, value, sub, icon, accent = '#0ea5e9', danger = false }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      padding: '16px 18px',
      border: `1px solid ${danger ? '#fca5a5' : '#e2e8f0'}`,
      borderTop: `3px solid ${danger ? '#ef4444' : accent}`,
      flex: 1,
      minWidth: 160,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: danger ? '#dc2626' : '#0f172a' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function CRMDashboard({ userId }) {
  const { initialized } = useCRMBootstrap(userId);

  const { stages, dealsMap, kpis, moveDeal, isLoading: boardLoading } = usePipelineBoard();
  const { leads, isLoading: leadsLoading, createLead, convertLead } = useLeadPanel();
  const { overdueFollowups, recentDeals, isLoading: dashLoading } = useCRMDashboard();
  const activities = useActivities();
  const { selectDeal, selectCustomer, createDeal, addActivity } = useCRMActions();
  const selectedCustomerId = useSelectedCustomerId();

  const [activeView, setActiveView] = useState('kanban'); // kanban | leads | followups | timeline
  const [showCustomerModal, setShowCustomerModal] = useState(false);

  if (!initialized && boardLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 300, color: '#64748b', fontSize: 14, direction: 'rtl',
      }}>
        جاري تحميل نظام المبيعات...
      </div>
    );
  }

  return (
    <div style={{
      direction: 'rtl',
      fontFamily: 'inherit',
      padding: '0 0 16px',
      background: 'transparent',
      minHeight: '100vh',
    }}>
      {/* Page header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>
            🚀 خط المبيعات
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
            إدارة الصفقات والعملاء المحتملين
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => createDeal({ title: 'صفقة جديدة', value: 0 })}
            style={{
              background: '#0ea5e9', color: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            + صفقة جديدة
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KPICard
          icon="🔄"
          label="الصفقات المفتوحة"
          value={kpis.totalOpenDeals}
          sub={`قيمة: ${formatCurrency(kpis.pipelineValue, 'SAR')}`}
          accent="#0ea5e9"
        />
        <KPICard
          icon="✅"
          label="الصفقات المكتملة"
          value={kpis.totalWonDeals}
          sub={`إجمالي: ${formatCurrency(kpis.wonValue, 'SAR')}`}
          accent="#22c55e"
        />
        <KPICard
          icon="🎯"
          label="معدل الفوز"
          value={`${kpis.winRate}%`}
          sub="من إجمالي الصفقات المغلقة"
          accent="#8b5cf6"
        />
        <KPICard
          icon="📊"
          label="تحويل العملاء المحتملين"
          value={`${kpis.leadConversionRate}%`}
          sub={`${leads.length} عميل محتمل`}
          accent="#f59e0b"
        />
        <KPICard
          icon="⚠️"
          label="متابعات متأخرة"
          value={kpis.overdueFollowups}
          sub={`${kpis.pendingFollowups} معلق`}
          accent="#ef4444"
          danger={kpis.overdueFollowups > 0}
        />
        <KPICard
          icon="💰"
          label="متوسط قيمة الصفقة"
          value={formatCurrency(kpis.avgDealValue, 'SAR')}
          sub="للصفقات المكتملة"
          accent="#0ea5e9"
        />
      </div>

      {/* Overdue followup alert */}
      {overdueFollowups.length > 0 && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span style={{ fontSize: 13, color: '#991b1b', fontWeight: 500 }}>
            لديك {overdueFollowups.length} متابعة متأخرة تحتاج إلى اهتمام فوري
          </span>
          <button
            onClick={() => setActiveView('followups')}
            style={{
              marginRight: 'auto', background: '#dc2626', color: '#fff',
              border: 'none', borderRadius: 6, padding: '4px 12px',
              fontSize: 12, cursor: 'pointer',
            }}
          >
            عرض الكل
          </button>
        </div>
      )}

      {/* View tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 16,
        borderBottom: '1px solid #e2e8f0', paddingBottom: 0,
      }}>
        {[
          { key: 'kanban', label: '📋 خط المبيعات' },
          { key: 'leads', label: `👥 العملاء المحتملون (${leads.length})` },
          { key: 'followups', label: `🗓 المتابعات` },
          { key: 'timeline', label: '📅 الأنشطة' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveView(t.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '8px 14px', fontSize: 13, fontWeight: 500,
              color: activeView === t.key ? '#0ea5e9' : '#64748b',
              borderBottom: `2px solid ${activeView === t.key ? '#0ea5e9' : 'transparent'}`,
              marginBottom: -1,
              transition: 'color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* View content */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 20 }}>

        {/* Kanban */}
        {activeView === 'kanban' && (
          <PipelineKanban
            stages={stages}
            dealsMap={dealsMap}
            onMoveDeal={moveDeal}
            onSelectDeal={d => selectDeal(d.id)}
            onCreateDeal={stageId => createDeal({ title: 'صفقة جديدة', stage_id: stageId, value: 0 })}
            isLoading={boardLoading}
          />
        )}

        {/* Leads */}
        {activeView === 'leads' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <button
                onClick={() => createLead({ title: 'عميل محتمل جديد', estimated_value: 0 })}
                style={{
                  background: '#0ea5e9', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '8px 16px', fontSize: 12,
                  cursor: 'pointer', marginBottom: 14,
                }}
              >
                + إضافة عميل محتمل
              </button>
            </div>
            {leadsLoading ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>جاري التحميل...</div>
            ) : leads.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>
                لا يوجد عملاء محتملون
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {leads.map(lead => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onSelect={() => {}}
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

      {/* Customer profile modal */}
      {showCustomerModal && selectedCustomerId && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            background: '#f8fafc', borderRadius: 12,
            width: '100%', maxWidth: 700, maxHeight: '90vh',
            overflow: 'auto', boxShadow: '0 20px 60px #0003',
          }}>
            <CustomerProfile
              customerId={selectedCustomerId}
              onClose={() => setShowCustomerModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
