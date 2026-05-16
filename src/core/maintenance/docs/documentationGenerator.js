// =============================================================
// documentationGenerator — Runtime module + dependency maps
//
// Generates structured maps at runtime:
//   • Module map (registered features + their entry points)
//   • Event map (all known event types + directions)
//   • Queue map (queue types + handlers)
//   • Workflow map (named user workflows + steps)
//   • Dependency map (which modules use which services)
//
// Output is JSON — can be exported, pasted into docs, or
// rendered in the maintenance dashboard.
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log = createLogger('DocGenerator');

// ── Module registry ────────────────────────────────────────────
const _moduleRegistry = new Map();

/**
 * Register a feature module.
 * Call once per module, typically in its index.js.
 */
export function registerModule(descriptor) {
  const {
    name,            // 'tasks' | 'attendance' | 'crm' | ...
    version  = '1',
    entry,           // '@modules/tasks/index.js'
    services = [],   // ['taskService']
    stores   = [],   // ['useTaskStore']
    events   = [],   // ['task.created', 'task.updated']
    routes   = [],   // ['/tasks', '/tasks/:id']
    author   = null,
  } = descriptor;

  if (_moduleRegistry.has(name)) {
    log.warn(`Module "${name}" already registered`);
    return;
  }

  _moduleRegistry.set(name, { name, version, entry, services, stores, events, routes, author, registeredAt: Date.now() });
  log.debug(`Module registered: ${name}`);
}

export function getModuleMap() {
  return [..._moduleRegistry.values()];
}

// ── Event catalog ──────────────────────────────────────────────
const _eventCatalog = new Map();

/**
 * Register an event type in the global catalog.
 */
export function registerEvent(descriptor) {
  const {
    type,             // 'task.created'
    description = '',
    emittedBy   = [], // modules/services that emit this
    listenedBy  = [], // modules/components that subscribe
    payload     = {}, // { field: 'type description' }
  } = descriptor;

  _eventCatalog.set(type, { type, description, emittedBy, listenedBy, payload, registeredAt: Date.now() });
}

export function getEventMap() {
  return [..._eventCatalog.values()].sort((a, b) => a.type.localeCompare(b.type));
}

// ── Queue map ──────────────────────────────────────────────────
const _queueHandlers = new Map();

export function registerQueueHandler(descriptor) {
  const {
    actionType,         // 'task.update'
    handler,            // handler function name
    maxRetries  = 3,
    description = '',
    module      = null,
  } = descriptor;

  _queueHandlers.set(actionType, { actionType, handler, maxRetries, description, module });
}

export function getQueueMap() {
  return [..._queueHandlers.values()];
}

// ── Workflow map ───────────────────────────────────────────────
const _workflowRegistry = new Map();

export function registerWorkflow(descriptor) {
  const {
    name,            // 'attendance:check_in'
    description = '',
    steps       = [], // [{ id, label, service, event }]
    roles       = [], // which roles can trigger this
    triggeredBy = 'user', // 'user' | 'system' | 'realtime'
  } = descriptor;

  _workflowRegistry.set(name, { name, description, steps, roles, triggeredBy });
}

export function getWorkflowMap() {
  return [..._workflowRegistry.values()];
}

// ── Dependency map ─────────────────────────────────────────────
export function getDependencyMap() {
  const modules = getModuleMap();
  const deps    = [];

  for (const mod of modules) {
    for (const svc of mod.services) {
      deps.push({ from: mod.name, to: svc, type: 'service' });
    }
    for (const store of mod.stores) {
      deps.push({ from: mod.name, to: store, type: 'store' });
    }
    for (const event of mod.events) {
      deps.push({ from: mod.name, to: event, type: 'event' });
    }
  }

  return deps;
}

// ── Auto-populate from app structure ──────────────────────────
// Registers known modules, events, queues, and workflows based
// on the app's static structure.
export function populateFromAppStructure() {
  // ── Modules ──────────────────────────────────────────────────
  const modules = [
    { name: 'workspace',      entry: '@modules/workspace', services: ['workspaceService'], stores: ['useWorkspaceStore'], events: ['workspace.loaded', 'workspace.updated'], routes: ['/'] },
    { name: 'tasks',          entry: '@modules/tasks',     services: ['taskService'],      stores: ['useTaskStore'],      events: ['task.created', 'task.updated', 'task.deleted'], routes: ['/tasks'] },
    { name: 'attendance',     entry: '@screens/AttendanceScreen', services: ['attendanceService'], stores: [], events: ['attendance.checked_in', 'attendance.checked_out'], routes: ['/attendance'] },
    { name: 'crm',            entry: '@modules/crm',       services: ['crmService'],       stores: [],                   events: ['crm.lead_created', 'crm.lead_updated'], routes: [] },
    { name: 'collaboration',  entry: '@/core/collaboration',services: ['collaborationService'], stores: ['useCollaborationStore'], events: ['collaboration.comment_added', 'collaboration.mention'], routes: [] },
    { name: 'audit',          entry: '@modules/audit',     services: ['auditService'],     stores: [],                   events: ['audit.event_recorded'], routes: ['/admin/audit'] },
    { name: 'production',     entry: '@/core/production',  services: [], stores: [],       events: ['health.check_complete', 'offline.action_queued', 'offline.action_replayed'], routes: [] },
    { name: 'rollout',        entry: '@/core/rollout',     services: [], stores: ['usePersonalizationStore'], events: ['rollout.onboarding_complete'], routes: [] },
    { name: 'testing',        entry: '@/core/testing',     services: [], stores: [],       events: ['qa.workflow_result', 'qa.health_check'], routes: ['/admin/qa'] },
    { name: 'maintenance',    entry: '@/core/maintenance',  services: [], stores: [],      events: ['maintenance.cleanup_complete'], routes: ['/admin/maintenance'] },
  ];

  for (const mod of modules) {
    if (!_moduleRegistry.has(mod.name)) registerModule(mod);
  }

  // ── Core events ───────────────────────────────────────────────
  const events = [
    { type: 'auth.signed_in',          description: 'User authenticated successfully',     emittedBy: ['authService'], listenedBy: ['workspace', 'rollout'] },
    { type: 'auth.signed_out',         description: 'User session ended',                  emittedBy: ['authService'], listenedBy: ['workspace', 'production'] },
    { type: 'auth.session_expired',    description: 'Session token expired',               emittedBy: ['authService'], listenedBy: ['rollout', 'production'] },
    { type: 'task.created',            description: 'New task created',                    emittedBy: ['taskService'], listenedBy: ['workspace', 'collaboration'] },
    { type: 'task.updated',            description: 'Task status or fields changed',       emittedBy: ['taskService'], listenedBy: ['workspace', 'notifications'] },
    { type: 'attendance.checked_in',   description: 'Employee checked in for the day',     emittedBy: ['attendanceService'], listenedBy: ['workspace'] },
    { type: 'offline.action_queued',   description: 'Action queued for offline retry',     emittedBy: ['offlineRecovery'], listenedBy: ['workspace', 'production'] },
    { type: 'offline.action_replayed', description: 'Queued action successfully replayed', emittedBy: ['offlineRecovery'], listenedBy: ['workspace'] },
    { type: 'health.check_complete',   description: 'System health check finished',        emittedBy: ['healthEngine'],    listenedBy: ['SystemHealthBanner'] },
    { type: 'realtime.reconnected',    description: 'Supabase realtime reconnected',       emittedBy: ['realtimeRecovery'], listenedBy: ['workspace', 'production'] },
    { type: 'notification.received',   description: 'New notification arrived',            emittedBy: ['realtimeService'], listenedBy: ['NotificationCenter'] },
    { type: 'collaboration.comment_added', description: 'Comment added to a task/entity', emittedBy: ['collaborationService'], listenedBy: ['workspace', 'notifications'] },
  ];

  for (const evt of events) {
    if (!_eventCatalog.has(evt.type)) registerEvent(evt);
  }

  // ── Queue handlers ────────────────────────────────────────────
  const handlers = [
    { actionType: 'task.update',       handler: 'taskService.updateTask',      maxRetries: 3, module: 'tasks' },
    { actionType: 'task.create',       handler: 'taskService.createTask',      maxRetries: 3, module: 'tasks' },
    { actionType: 'attendance.check_in', handler: 'attendanceService.checkIn', maxRetries: 3, module: 'attendance' },
    { actionType: 'crm.update_lead',   handler: 'crmService.updateLead',       maxRetries: 3, module: 'crm' },
    { actionType: 'collaboration.add_comment', handler: 'collaborationService.addComment', maxRetries: 2, module: 'collaboration' },
  ];

  for (const h of handlers) {
    if (!_queueHandlers.has(h.actionType)) registerQueueHandler(h);
  }

  // ── Workflows ─────────────────────────────────────────────────
  const workflows = [
    {
      name: 'attendance:daily_checkin',
      description: 'Employee checks in at start of day',
      steps: [
        { id: 1, label: 'Open attendance screen', event: null },
        { id: 2, label: 'Tap check in', event: 'attendance.checked_in' },
        { id: 3, label: 'Workspace refreshes', event: 'workspace.updated' },
      ],
      roles: ['employee', 'manager', 'admin'],
      triggeredBy: 'user',
    },
    {
      name: 'tasks:create_and_assign',
      description: 'Manager creates and assigns a task',
      steps: [
        { id: 1, label: 'Open task creation form', event: null },
        { id: 2, label: 'Fill details + assign', event: null },
        { id: 3, label: 'Submit', event: 'task.created' },
        { id: 4, label: 'Assignee notified', event: 'notification.received' },
      ],
      roles: ['manager', 'admin'],
      triggeredBy: 'user',
    },
    {
      name: 'crm:lead_qualification',
      description: 'Sales moves lead through qualification funnel',
      steps: [
        { id: 1, label: 'Open lead', event: null },
        { id: 2, label: 'Update status to qualified', event: 'crm.lead_updated' },
        { id: 3, label: 'Add comment', event: 'collaboration.comment_added' },
      ],
      roles: ['sales_manager', 'admin'],
      triggeredBy: 'user',
    },
  ];

  for (const wf of workflows) {
    if (!_workflowRegistry.has(wf.name)) registerWorkflow(wf);
  }

  log.info('App structure documentation populated');
}

// ── Full documentation export ──────────────────────────────────
export function generateDocumentation() {
  populateFromAppStructure();

  return {
    generatedAt:    new Date().toISOString(),
    appVersion:     import.meta.env.VITE_APP_VERSION ?? 'unknown',
    modules:        getModuleMap(),
    events:         getEventMap(),
    queueHandlers:  getQueueMap(),
    workflows:      getWorkflowMap(),
    dependencies:   getDependencyMap(),
    stats: {
      moduleCount:  _moduleRegistry.size,
      eventCount:   _eventCatalog.size,
      queueHandlers: _queueHandlers.size,
      workflowCount: _workflowRegistry.size,
    },
  };
}

export function exportDocumentationJSON() {
  return JSON.stringify(generateDocumentation(), null, 2);
}
