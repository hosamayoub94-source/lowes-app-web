// =============================================================
// mockFactories — Deterministic test data generators
//
// All factories accept partial overrides so tests can pin specific
// fields while letting the factory fill in the rest.
// Outputs are valid against runtimeValidations SCHEMAS.
// =============================================================

let _seq = 0;
const _id  = (prefix = 'id') => `${prefix}_${String(++_seq).padStart(4, '0')}_${Date.now().toString(36)}`;
const _now = () => new Date().toISOString();
const _ago = (ms) => new Date(Date.now() - ms).toISOString();

// ── User / Session ─────────────────────────────────────────────
export function makeUser(overrides = {}) {
  return {
    id:         _id('usr'),
    name:       'موظف تجريبي',
    email:      'test@example.com',
    role:       'employee',
    team:       'ops',
    avatar_url: null,
    created_at: _ago(30 * 86400_000),
    ...overrides,
  };
}

export function makeSession(overrides = {}) {
  const user = makeUser(overrides.user ?? {});
  return {
    access_token:  'mock_access_token_' + Date.now(),
    refresh_token: 'mock_refresh_token',
    expires_at:    Date.now() / 1000 + 3600,
    user: {
      id:    user.id,
      email: user.email,
      user_metadata: { name: user.name, role: user.role, team: user.team },
    },
    ...user,
    ...overrides,
  };
}

// ── Tasks ──────────────────────────────────────────────────────
const TASK_STATUSES  = ['pending', 'in_progress', 'done', 'cancelled'];
const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export function makeTask(overrides = {}) {
  const id = _id('task');
  return {
    id,
    title:       `مهمة تجريبية #${_seq}`,
    description: 'وصف المهمة التجريبية',
    status:      'pending',
    priority:    'medium',
    assigned_to: null,
    created_by:  _id('usr'),
    due_date:    _now(),
    created_at:  _ago(86400_000),
    updated_at:  _now(),
    tags:        [],
    ...overrides,
  };
}

export function makeTaskBatch(count = 5, overrides = {}) {
  return Array.from({ length: count }, (_, i) => makeTask({
    status:   TASK_STATUSES[i % TASK_STATUSES.length],
    priority: TASK_PRIORITIES[i % TASK_PRIORITIES.length],
    ...overrides,
  }));
}

// ── Attendance ─────────────────────────────────────────────────
export function makeAttendanceRecord(overrides = {}) {
  const today = new Date().toISOString().split('T')[0];
  return {
    id:       _id('att'),
    user_id:  _id('usr'),
    date:     today,
    check_in: '09:00:00',
    check_out: null,
    status:   'in',
    notes:    null,
    created_at: _now(),
    ...overrides,
  };
}

// ── Notifications ──────────────────────────────────────────────
const NOTIF_TYPES = ['task_assigned', 'mention', 'approval_request', 'system', 'reminder'];

export function makeNotification(overrides = {}) {
  return {
    id:       _id('notif'),
    type:     NOTIF_TYPES[_seq % NOTIF_TYPES.length],
    title:    'إشعار تجريبي',
    message:  'هذا إشعار للاختبار',
    user_id:  _id('usr'),
    read:     false,
    created_at: _now(),
    metadata: {},
    ...overrides,
  };
}

// ── CRM ────────────────────────────────────────────────────────
export function makeLead(overrides = {}) {
  return {
    id:          _id('lead'),
    name:        `عميل تجريبي #${_seq}`,
    phone:       '0501234567',
    email:       null,
    status:      'new',
    source:      'manual',
    assigned_to: null,
    notes:       '',
    created_at:  _now(),
    updated_at:  _now(),
    ...overrides,
  };
}

export function makeDeal(overrides = {}) {
  return {
    id:        _id('deal'),
    title:     `صفقة تجريبية #${_seq}`,
    value:     Math.floor(Math.random() * 50_000) + 5_000,
    stage:     'prospect',
    lead_id:   _id('lead'),
    created_at: _now(),
    ...overrides,
  };
}

// ── Comments / Collaboration ───────────────────────────────────
export function makeComment(overrides = {}) {
  return {
    id:          _id('cmt'),
    content:     'تعليق تجريبي للاختبار',
    author_id:   _id('usr'),
    author_name: 'موظف تجريبي',
    entity_type: 'task',
    entity_id:   _id('task'),
    parent_id:   null,
    deleted:     false,
    created_at:  _now(),
    ...overrides,
  };
}

// ── Queue jobs ─────────────────────────────────────────────────
export function makeQueueJob(type = 'notification.send', overrides = {}) {
  return {
    id:       _id('job'),
    type,
    payload:  { user_id: _id('usr'), type: 'system', title: 'تجريبي' },
    status:   'pending',
    retries:  0,
    created_at: _now(),
    ...overrides,
  };
}

// ── Bulk helpers ───────────────────────────────────────────────
export function makeMany(factory, count, overrides = {}) {
  return Array.from({ length: count }, () => factory(overrides));
}

/** Reset sequence counter (call between test suites). */
export function resetSequence() { _seq = 0; }
