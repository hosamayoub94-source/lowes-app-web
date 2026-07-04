// =============================================================
// frictionTracker — Employee friction + UX pain detection
//
// Detects real friction signals without user surveys:
//   • Repeated clicks on the same element (rage clicks)
//   • Abandoned actions (started but never completed)
//   • Interaction loops (same page, repeated actions)
//   • Slow form completions
//   • Error-then-retry patterns
//   • Back-navigation immediately after entering a page
//   • Dead zone clicks (clicks that do nothing)
// =============================================================
import { createLogger } from '@/core/production/productionLogger';
import { emit }         from '@/core/events/eventBus';

const log = createLogger('FrictionTracker');

// ── Config ─────────────────────────────────────────────────────
const RAGE_CLICK_THRESHOLD   = 3;    // clicks on same target within window
const RAGE_CLICK_WINDOW_MS   = 2000;
const ABANDON_TIMEOUT_MS     = 30_000; // form open but no submit
const LOOP_DETECT_THRESHOLD  = 3;    // same action N times in window
const LOOP_DETECT_WINDOW_MS  = 60_000;
const QUICK_BACK_THRESHOLD   = 5_000; // left page in < 5s
const MAX_FRICTION_EVENTS    = 300;

// ── Stores ─────────────────────────────────────────────────────
const _frictionEvents  = [];  // { type, detail, ts, userId, page }
const _clickHistory    = [];  // { target, ts }
const _actionHistory   = [];  // { action, ts }
const _openForms       = new Map(); // formId → { openedAt, page }
const _pendingActions  = new Map(); // actionId → { action, startedAt, context }

let _userId    = null;
let _currentPage = null;

// ── Init ───────────────────────────────────────────────────────
export function initFrictionTracker(userId = 'anonymous') {
  _userId = userId;
  _attachDOMListeners();
  log.info('Friction tracker initialized');
}

function _recordFriction(type, detail = {}) {
  const event = { type, detail, ts: Date.now(), userId: _userId, page: _currentPage };
  _frictionEvents.push(event);
  if (_frictionEvents.length > MAX_FRICTION_EVENTS) _frictionEvents.shift();
  emit('ops:friction', { type, detail, userId: _userId });
  log.warn(`[Friction] ${type}`, detail);
}

// ── Page tracking ──────────────────────────────────────────────
export function setFrictionPage(page) {
  _currentPage = page;
}

// ── Rage click detection ───────────────────────────────────────
// معالج نقر مُسمّى (لا مجهول) حتى نقدر نزيله عند الإيقاف — وإلا يتراكم مع كل
// تسجيل دخول/خروج (تسريب مستمعين).
let _clickHandler = null;

function _onDocumentClick(e) {
  const target = _getTargetLabel(e.target);
  const now    = Date.now();

  _clickHistory.push({ target, ts: now });

  // Keep window
  const recent = _clickHistory.filter((c) => now - c.ts < RAGE_CLICK_WINDOW_MS);
  _clickHistory.length = 0;
  _clickHistory.push(...recent);

  // Count clicks on same target
  const sameTarget = recent.filter((c) => c.target === target);
  if (sameTarget.length >= RAGE_CLICK_THRESHOLD) {
    _recordFriction('rage_click', { target, count: sameTarget.length });
  }

  // Dead zone detection: click with no reaction (no navigation, no state change)
  const hasHandler = !!(
    e.target.onclick ||
    e.target.closest('button, a, [role="button"], [tabindex]') ||
    e.target.closest('form')
  );
  if (!hasHandler && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
    _recordFriction('dead_zone_click', { target, tagName: e.target.tagName });
  }
}

function _attachDOMListeners() {
  if (typeof document === 'undefined' || _clickHandler) return; // idempotent
  _clickHandler = _onDocumentClick;
  document.addEventListener('click', _clickHandler, { passive: true });
}

// إيقاف المتتبّع وإزالة المستمعين (يُستدعى عند تسجيل الخروج).
export function shutdownFrictionTracker() {
  if (typeof document !== 'undefined' && _clickHandler) {
    document.removeEventListener('click', _clickHandler);
  }
  _clickHandler = null;
  _userId = null;
  _clickHistory.length = 0;
  log.info('Friction tracker shut down');
}

function _getTargetLabel(el) {
  if (!el) return 'unknown';
  return (
    el.getAttribute?.('data-action') ??
    el.getAttribute?.('aria-label') ??
    el.getAttribute?.('id') ??
    el.className?.toString().split(' ').slice(0, 2).join('.') ??
    el.tagName?.toLowerCase() ??
    'unknown'
  ).slice(0, 60);
}

// ── Action loop detection ──────────────────────────────────────
export function trackFrictionAction(action) {
  const now = Date.now();
  _actionHistory.push({ action, ts: now });

  // Keep window
  const recent = _actionHistory.filter((a) => now - a.ts < LOOP_DETECT_WINDOW_MS);
  _actionHistory.length = 0;
  _actionHistory.push(...recent);

  // Count same action in window
  const sameAction = recent.filter((a) => a.action === action);
  if (sameAction.length >= LOOP_DETECT_THRESHOLD) {
    _recordFriction('action_loop', {
      action,
      count: sameAction.length,
      hint:  'User may be confused or stuck on this action',
    });
  }
}

// ── Abandoned action detection ─────────────────────────────────
export function startPendingAction(actionId, action, context = {}) {
  _pendingActions.set(actionId, {
    action,
    context,
    startedAt: Date.now(),
    page:      _currentPage,
  });

  // Auto-detect abandonment after timeout
  setTimeout(() => {
    if (_pendingActions.has(actionId)) {
      const info = _pendingActions.get(actionId);
      _recordFriction('abandoned_action', {
        action:    info.action,
        context:   info.context,
        ageMs:     Date.now() - info.startedAt,
        startPage: info.page,
      });
      _pendingActions.delete(actionId);
    }
  }, ABANDON_TIMEOUT_MS);
}

export function completePendingAction(actionId) {
  _pendingActions.delete(actionId);
}

export function cancelPendingAction(actionId, reason = 'user_cancel') {
  if (!_pendingActions.has(actionId)) return;
  const info = _pendingActions.get(actionId);
  _recordFriction('cancelled_action', {
    action:  info.action,
    reason,
    ageMs:   Date.now() - info.startedAt,
  });
  _pendingActions.delete(actionId);
}

// ── Form abandonment tracking ──────────────────────────────────
export function trackFormOpen(formId, formName) {
  _openForms.set(formId, { formName, openedAt: Date.now(), page: _currentPage });
}

export function trackFormSubmit(formId) {
  const form = _openForms.get(formId);
  if (form) {
    const completionMs = Date.now() - form.openedAt;
    emit('ops:form_completed', { formId, formName: form.formName, completionMs });
    _openForms.delete(formId);
  }
}

export function trackFormAbandoned(formId) {
  const form = _openForms.get(formId);
  if (!form) return;
  _recordFriction('form_abandoned', {
    formName:    form.formName,
    openDurationMs: Date.now() - form.openedAt,
    page:        form.page,
  });
  _openForms.delete(formId);
}

// ── Quick-back detection ───────────────────────────────────────
let _lastPageEnterTs  = null;
let _lastPageName     = null;

export function trackFrictionPageEnter(page) {
  _lastPageEnterTs = Date.now();
  _lastPageName    = page;
  _currentPage     = page;
}

export function trackFrictionPageLeave(nextPage) {
  if (_lastPageEnterTs && _lastPageName) {
    const dwellMs = Date.now() - _lastPageEnterTs;
    if (dwellMs < QUICK_BACK_THRESHOLD) {
      _recordFriction('quick_back', {
        page:    _lastPageName,
        nextPage,
        dwellMs,
        hint:    'User may have found the screen confusing or wrong',
      });
    }
  }
}

// ── Error-then-retry pattern ───────────────────────────────────
const _errorRetryMap = new Map(); // action → [timestamps]

export function trackErrorRetry(action) {
  const now  = Date.now();
  const hist = (_errorRetryMap.get(action) ?? []).filter((ts) => now - ts < 120_000);
  hist.push(now);
  _errorRetryMap.set(action, hist);

  if (hist.length >= 2) {
    _recordFriction('error_retry', {
      action,
      attempts: hist.length,
      hint:     'User retrying a failing action — check error handling',
    });
  }
}

// ── Failed workflow tracking ───────────────────────────────────
export function trackFailedWorkflow(workflow, step, reason) {
  _recordFriction('failed_workflow', { workflow, step, reason });
}

// ── Analytics ─────────────────────────────────────────────────
export function getFrictionEvents() { return [..._frictionEvents].reverse(); }

export function getFrictionSummary() {
  const byType = {};
  for (const e of _frictionEvents) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
  }

  const topFrictions = Object.entries(byType)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const rageClicks = _frictionEvents.filter((e) => e.type === 'rage_click');
  const abandoned  = _frictionEvents.filter((e) => e.type === 'abandoned_action' || e.type === 'form_abandoned');
  const loops      = _frictionEvents.filter((e) => e.type === 'action_loop');

  return {
    total:          _frictionEvents.length,
    byType,
    topFrictions,
    rageClickCount: rageClicks.length,
    abandonedCount: abandoned.length,
    loopCount:      loops.length,
    healthScore:    Math.max(0, 100 - _frictionEvents.length * 2),
    pendingActions: _pendingActions.size,
    recentEvents:   _frictionEvents.slice(-10).reverse(),
  };
}

export function getFrictionByPage() {
  const byPage = {};
  for (const e of _frictionEvents) {
    const page = e.page ?? 'unknown';
    byPage[page] = byPage[page] ?? [];
    byPage[page].push(e);
  }
  return Object.entries(byPage)
    .map(([page, events]) => ({ page, count: events.length, events }))
    .sort((a, b) => b.count - a.count);
}

export function clearFrictionData() {
  _frictionEvents.length = 0;
  _clickHistory.length   = 0;
  _actionHistory.length  = 0;
  _openForms.clear();
  _pendingActions.clear();
}

// ── Expose on window in DEV ────────────────────────────────────
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__frictionTracker = { getFrictionSummary, getFrictionEvents, getFrictionByPage };
}
