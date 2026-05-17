// =============================================================
// Analytics Module — Event Bus Integration
//
// Bridges cross-module events into the analytics layer:
//   - Attendance check-in/out → increment realtime counters
//   - Task completed → increment counter + maybe save snapshot
//   - File uploaded → increment counter
//   - System errors → increment error counter
//   - Analytics KPI refresh → notify admins of alerts
//
// bootAnalyticsIntegration() is idempotent (safe to call twice).
// =============================================================
import { EVENTS, EVENT_SOURCES } from '@/core/events/eventTypes';

let _booted = false;

export function bootAnalyticsIntegration() {
  if (_booted) return;
  _booted = true;

  _wireListeners();
  console.info('[Analytics] Event bus integration booted');
}

export function teardownAnalyticsIntegration() {
  _booted = false;
  // bus.off() would go here if the bus supports bulk unsubscribe
}

// ── Emit helpers ──────────────────────────────────────────────

export function emitKPIRefreshed(kpis) {
  _emit(EVENTS.ANALYTICS_KPI_REFRESHED, { kpis, ts: new Date().toISOString() });
}

export function emitSnapshotSaved(snapshotId, snapshotType, metrics) {
  _emit(EVENTS.ANALYTICS_SNAPSHOT_SAVED, { snapshotId, snapshotType, metrics });
}

export function emitReportExported(format, rowCount, reportType) {
  _emit(EVENTS.ANALYTICS_REPORT_EXPORTED, { format, rowCount, reportType });
}

export function emitAlertTriggered(metric, value, status) {
  _emit(EVENTS.ANALYTICS_ALERT_TRIGGERED, { metric, value, status });
}

export function emitWidgetSaved(dashboardId, widgetCount) {
  _emit(EVENTS.ANALYTICS_WIDGET_SAVED, { dashboardId, widgetCount });
}

export function emitReportCreated(reportId, reportType) {
  _emit(EVENTS.ANALYTICS_REPORT_CREATED, { reportId, reportType });
}

// ── Private: wire listeners ───────────────────────────────────

function _wireListeners() {
  import('@/core/events').then(({ on: busOn }) => {
    const bus = { on: busOn };

    // ── Attendance events → realtime counters ─────────────
    bus.on(EVENTS.ATTENDANCE_CHECK_IN, () => {
      _incrementCounter('checkInsToday');
    });

    bus.on(EVENTS.ATTENDANCE_CHECK_OUT, () => {
      // Could track check-outs for duration analytics
    });

    // ── Task events → realtime counters ───────────────────
    bus.on(EVENTS.TASK_COMPLETED, () => {
      _incrementCounter('tasksCompleted');
    });

    // ── File events → realtime counters ───────────────────
    bus.on(EVENTS.FILE_UPLOADED, () => {
      _incrementCounter('filesUploaded');
    });

    // ── System errors → realtime counters ─────────────────
    bus.on(EVENTS.SYSTEM_ERROR, () => {
      _incrementCounter('errorsTotal');
    });

    bus.on(EVENTS.QUEUE_JOB_FAILED, () => {
      _incrementCounter('errorsTotal');
    });

    // ── Notification sent → realtime counters ─────────────
    bus.on(EVENTS.NOTIFICATION_CREATED, () => {
      _incrementCounter('notificationsSent');
    });

    // ── KPI alerts → push notification to admins ──────────
    bus.on(EVENTS.ANALYTICS_ALERT_TRIGGERED, async ({ metric, value, status }) => {
      if (status !== 'critical') return;
      try {
        const { sendNotification } = await import('@modules/notifications/services/notificationService');
        const { KPI_LABELS, formatKPI } = await import('../types/analytics.types');
        await sendNotification({
          userId: 'admin',  // broadcast — notification service resolves admin IDs
          title:  'تحذير KPI حرج',
          message: `${KPI_LABELS[metric] ?? metric}: ${formatKPI(metric, value)}`,
          type:   'warning',
        });
      } catch {
        // Notification service not yet wired — silent fail
      }
    });

  }).catch((err) => {
    console.warn('[Analytics] Event bus not available:', err?.message);
  });
}

// ── Private: helpers ──────────────────────────────────────────

function _incrementCounter(key) {
  import('../services/analyticsService').then(({ incrementCounter }) => {
    incrementCounter(key);
  }).catch(() => {});
}

function _emit(eventName, payload) {
  import('@/core/events').then(({ emit: busEmit }) => {
    busEmit(eventName, payload, { source: EVENT_SOURCES.ANALYTICS });
  }).catch(() => {});
}
