/**
 * CRM Event Bus Integration
 *
 * Bridges the global Event Bus with the CRM module:
 *   - Listens for cross-module events that affect CRM (e.g. FILE_UPLOADED for attachments)
 *   - Reacts to CRM events to fire notifications, queue jobs, and audit entries
 *   - Emits structured CRM events from service-layer helpers
 */

import { on as subscribe, emit } from '@/core/events/eventBus.js';
import { EVENTS, EVENT_SOURCES, EVENT_SEVERITY } from '@/core/events/eventTypes.js';

// ── Boot guard (idempotent) ────────────────────────────────────────────────
let _booted = false;

export function bootCRMIntegration() {
  if (_booted) return;
  _booted = true;

  // ── Inbound: react to other modules' events ──────────────────────────

  // When a file is uploaded and tagged to a CRM entity — log it as activity
  subscribe(EVENTS.FILE_UPLOADED, async ({ userId: uploadUserId, fileId, fileName, folderId, sizeBytes }) => {
    // CRM entity context is not available in the file event payload — skip silently
    // (CRM-tagged uploads are handled by crmService directly when attaching files)
    try {
      const store = (await import('../store/useCRMStore.js')).default;
      const userId = store.getState()._userId;
      if (!userId) return;
      // No-op: CRM activity for file uploads is logged by crmService.attachFile()
    } catch (_) {/* non-critical */}
  });

  // ── Outbound: react to CRM events ────────────────────────────────────

  // New lead → notify sales manager
  subscribe(EVENTS.LEAD_CREATED, async ({ lead }) => {
    try {
      const { sendNotification } = await import('@modules/notifications/services/notificationService');
      await sendNotification({
        userId: lead.assigned_to ?? lead.owner_id,
        title: 'عميل محتمل جديد',
        message: `تم إضافة عميل محتمل جديد: ${lead.title}`,
        type: 'info',
        metadata: { leadId: lead.id },
      });
    } catch (_) {/* non-critical */}

    // Queue: AI lead scoring job (async, non-blocking)
    try {
      const { useQueueStore } = await import('@/core/queue/queueStore.js');
      useQueueStore.getState().enqueue('crm:score_lead', { leadId: lead.id }, { delay: 5000 });
    } catch (_) {/* non-critical */}
  });

  // Deal won → celebrate + notify
  subscribe(EVENTS.DEAL_WON, async ({ deal }) => {
    try {
      const { sendNotification } = await import('@modules/notifications/services/notificationService');
      await sendNotification({
        userId: deal.assigned_to ?? deal.owner_id,
        title: '🎉 صفقة مكتملة!',
        message: `تهانينا! تم إغلاق صفقة "${deal.title}" بقيمة ${deal.currency} ${Number(deal.value).toLocaleString('ar-SA')}`,
        type: 'success',
        metadata: { dealId: deal.id, value: deal.value },
      });
    } catch (_) {/* non-critical */}

    // Update analytics counter
    try {
      const { incrementCounter } = await import('@/modules/analytics/services/analyticsService.js');
      await incrementCounter('dealsWon');
    } catch (_) {/* non-critical */}
  });

  // Deal lost → log + notify
  subscribe(EVENTS.DEAL_LOST, async ({ deal }) => {
    try {
      const { sendNotification } = await import('@modules/notifications/services/notificationService');
      await sendNotification({
        userId: deal.assigned_to ?? deal.owner_id,
        title: 'صفقة خاسرة',
        message: `تم تسجيل خسارة صفقة "${deal.title}"`,
        type: 'warning',
        metadata: { dealId: deal.id },
      });
    } catch (_) {/* non-critical */}
  });

  // Deal stage changed → audit log
  subscribe(EVENTS.DEAL_STAGE_CHANGED, async ({ deal, prevStageId, newStageId }) => {
    try {
      const { logActivity } = await import('@modules/audit/services/auditService.js');
      await logActivity({
        actionType: 'DEAL_STAGE_CHANGED',
        entityType: 'deal',
        entityId: deal.id,
        entityLabel: deal.title,
        metadata: { prevStageId, newStageId, value: deal.value },
        severity: EVENT_SEVERITY.INFO,
      });
    } catch (_) {/* non-critical */}
  });

  // Followup due → notification
  subscribe(EVENTS.FOLLOWUP_DUE, async ({ followup }) => {
    try {
      const { sendNotification } = await import('@modules/notifications/services/notificationService');
      await sendNotification({
        userId: followup.assigned_to,
        title: 'تذكير متابعة',
        message: `حان موعد المتابعة: ${followup.title}`,
        type: 'info',
        metadata: { followupId: followup.id },
      });
    } catch (_) {/* non-critical */}
  });

  // Followup overdue → urgent notification
  subscribe(EVENTS.FOLLOWUP_OVERDUE, async ({ followup }) => {
    try {
      const { sendNotification } = await import('@modules/notifications/services/notificationService');
      await sendNotification({
        userId: followup.assigned_to,
        title: '⚠️ متابعة متأخرة',
        message: `تجاوزت موعد المتابعة: ${followup.title}`,
        type: 'warning',
        metadata: { followupId: followup.id },
      });
    } catch (_) {/* non-critical */}

    // Queue: escalation job after 24h
    try {
      const { useQueueStore } = await import('@/core/queue/queueStore.js');
      useQueueStore.getState().enqueue(
        'crm:escalate_overdue_followup',
        { followupId: followup.id, assignedTo: followup.assigned_to },
        { delay: 24 * 60 * 60 * 1000 }
      );
    } catch (_) {/* non-critical */}
  });

  // New customer → welcome notification
  subscribe(EVENTS.CUSTOMER_CREATED, async ({ customer }) => {
    try {
      const { sendNotification } = await import('@modules/notifications/services/notificationService');
      await sendNotification({
        userId: customer.assigned_to ?? customer.owner_id,
        title: 'عميل جديد',
        message: `تم إضافة عميل جديد: ${customer.company_name}`,
        type: 'success',
        metadata: { customerId: customer.id },
      });
    } catch (_) {/* non-critical */}
  });

  // Agent re-assigned → notify new agent
  subscribe(EVENTS.CRM_AGENT_ASSIGNED, async ({ entityType, entityId, agentId }) => {
    try {
      const { sendNotification } = await import('@modules/notifications/services/notificationService');
      const labels = { lead: 'عميل محتمل', deal: 'صفقة', customer: 'عميل' };
      await sendNotification({
        userId: agentId,
        title: 'تعيين جديد',
        message: `تم تعيينك على ${labels[entityType] ?? entityType} جديد`,
        type: 'info',
        metadata: { entityType, entityId },
      });
    } catch (_) {/* non-critical */}
  });
}

// ── Emit helpers (used by crmService internally) ──────────────────────────

export function emitLeadCreated(lead) {
  emit(EVENTS.LEAD_CREATED, { lead }, { source: EVENT_SOURCES.CRM });
}

export function emitDealStageChanged(deal, prevStageId, newStageId) {
  emit(EVENTS.DEAL_STAGE_CHANGED, { deal, prevStageId, newStageId }, { source: EVENT_SOURCES.CRM });

  if (deal.status === 'won') {
    emit(EVENTS.DEAL_WON, { deal }, { source: EVENT_SOURCES.CRM });
  } else if (deal.status === 'lost') {
    emit(EVENTS.DEAL_LOST, { deal }, { source: EVENT_SOURCES.CRM });
  }
}

export function emitFollowupDue(followup) {
  emit(EVENTS.FOLLOWUP_DUE, { followup }, { source: EVENT_SOURCES.CRM });
}

export function emitFollowupOverdue(followup) {
  emit(EVENTS.FOLLOWUP_OVERDUE, { followup }, { source: EVENT_SOURCES.CRM });
}

export function emitCustomerCreated(customer) {
  emit(EVENTS.CUSTOMER_CREATED, { customer }, { source: EVENT_SOURCES.CRM });
}

export function emitLeadConverted(lead, customer, deal) {
  emit(EVENTS.LEAD_CONVERTED, { lead, customer, deal }, { source: EVENT_SOURCES.CRM });
}
