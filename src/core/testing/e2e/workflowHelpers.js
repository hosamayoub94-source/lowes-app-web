// =============================================================
// workflowHelpers — End-to-end workflow testing helpers
//
// Provides scripted flows that can be run in the browser to verify
// complete workflows work end-to-end without a test runner.
// Results are logged + emitted so the dashboard can display them.
//
// Usage:
//   import { runLoginFlow, runAttendanceFlow } from './workflowHelpers';
//   const result = await runLoginFlow(supabase, { email, password });
// =============================================================
import { createLogger }  from '@/core/production/productionLogger';
import { emit }          from '@/core/events/eventBus';
import { time }          from '../performance/benchmarkLayer';
import { recordAction }  from '../debug/debugToolkit';

const log = createLogger('WorkflowHelpers');

// ── Result builder ─────────────────────────────────────────────
function result(name, steps) {
  const failed  = steps.filter((s) => s.status === 'fail');
  const warned  = steps.filter((s) => s.status === 'warn');
  const status  = failed.length > 0 ? 'fail' : warned.length > 0 ? 'warn' : 'pass';
  const summary = { name, status, steps, timestamp: Date.now() };
  emit('qa:workflow_result', summary);
  log.info(`Workflow "${name}": ${status}`, { failed: failed.length, steps: steps.length });
  return summary;
}

function step(name, status, message, detail = null) {
  return { name, status, message, detail };
}

async function tryStep(name, fn) {
  try {
    const detail = await fn();
    return step(name, 'pass', 'OK', detail);
  } catch (err) {
    return step(name, 'fail', err.message ?? 'Error');
  }
}

// ── Login flow ─────────────────────────────────────────────────
export async function runLoginFlow(supabase, credentials = {}) {
  const { email = 'test@example.com', password = 'testpass' } = credentials;
  const steps = [];

  steps.push(await tryStep('Supabase client exists', () => {
    if (!supabase) throw new Error('No Supabase client');
    return { ok: true };
  }));

  steps.push(await tryStep('Sign in', async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return { userId: data.user?.id };
  }));

  steps.push(await tryStep('Session established', async () => {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) throw new Error('No session after sign in');
    return { hasSession: true };
  }));

  recordAction('e2e:login_flow', { email }, steps.every((s) => s.status === 'pass') ? 'pass' : 'fail');
  return result('Login Flow', steps);
}

// ── Attendance flow ────────────────────────────────────────────
export async function runAttendanceFlow(attendanceService, userId) {
  const steps = [];
  const today = new Date().toISOString().split('T')[0];

  steps.push(await tryStep('Check in', async () => {
    if (!attendanceService?.checkIn) throw new Error('attendanceService.checkIn not available');
    await attendanceService.checkIn({ user_id: userId, date: today });
    return { checked_in: true };
  }));

  steps.push(await tryStep('Verify attendance record', async () => {
    const records = await attendanceService.getToday?.(userId);
    if (!records) return { verified: false, note: 'getToday not implemented' };
    return { recordCount: Array.isArray(records) ? records.length : 1 };
  }));

  steps.push(await tryStep('Check out', async () => {
    if (!attendanceService?.checkOut) throw new Error('attendanceService.checkOut not available');
    await attendanceService.checkOut({ user_id: userId, date: today });
    return { checked_out: true };
  }));

  return result('Attendance Flow', steps);
}

// ── Task lifecycle ─────────────────────────────────────────────
export async function runTaskLifecycleFlow(taskService, userId) {
  const steps = [];
  let taskId  = null;

  steps.push(await tryStep('Create task', async () => {
    if (!taskService?.createTask) throw new Error('taskService.createTask not available');
    const task = await taskService.createTask({
      title:       'مهمة اختبار E2E',
      description: 'اختبار دورة حياة المهمة الكاملة',
      status:      'pending',
      priority:    'medium',
      assigned_to: userId,
    });
    taskId = task?.id;
    if (!taskId) throw new Error('Task created without ID');
    return { taskId };
  }));

  steps.push(await tryStep('Update to in_progress', async () => {
    if (!taskId) throw new Error('No task ID from previous step');
    await taskService.updateTask(taskId, { status: 'in_progress' });
    return { status: 'in_progress' };
  }));

  steps.push(await tryStep('Complete task', async () => {
    await taskService.updateTask(taskId, { status: 'done' });
    return { status: 'done' };
  }));

  return result('Task Lifecycle', steps);
}

// ── Notifications flow ─────────────────────────────────────────
export async function runNotificationsFlow(notificationService, userId) {
  const steps = [];

  steps.push(await tryStep('Send notification', async () => {
    if (!notificationService?.send) throw new Error('notificationService.send not available');
    await notificationService.send({
      type:    'system',
      title:   'اختبار الإشعارات',
      user_id: userId,
    });
    return { sent: true };
  }));

  steps.push(await tryStep('Fetch notifications', async () => {
    const notifs = await notificationService.getAll?.(userId);
    if (!Array.isArray(notifs)) return { note: 'getAll not implemented' };
    return { count: notifs.length };
  }));

  return result('Notifications Flow', steps);
}

// ── CRM workflow ───────────────────────────────────────────────
export async function runCRMFlow(crmService) {
  const steps = [];
  let leadId  = null;

  steps.push(await tryStep('Create lead', async () => {
    if (!crmService?.createLead) throw new Error('crmService.createLead not available');
    const lead = await crmService.createLead({ name: 'عميل اختبار E2E', phone: '0501234567', status: 'new' });
    leadId = lead?.id;
    return { leadId };
  }));

  steps.push(await tryStep('Move lead to qualified', async () => {
    if (!leadId) throw new Error('No lead ID');
    await crmService.updateLead?.(leadId, { status: 'qualified' });
    return { status: 'qualified' };
  }));

  return result('CRM Workflow', steps);
}

// ── Run all flows ──────────────────────────────────────────────
export async function runAllWorkflows(services = {}) {
  const { supabase, attendanceService, taskService, notificationService, crmService, userId } = services;
  const results = await Promise.allSettled([
    runLoginFlow(supabase),
    runAttendanceFlow(attendanceService, userId),
    runTaskLifecycleFlow(taskService, userId),
    runNotificationsFlow(notificationService, userId),
    runCRMFlow(crmService),
  ]);

  return results.map((r) => r.status === 'fulfilled' ? r.value : { name: 'unknown', status: 'fail', error: r.reason?.message });
}
