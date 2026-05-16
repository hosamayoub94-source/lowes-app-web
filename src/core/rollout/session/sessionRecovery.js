// =============================================================
// sessionRecovery — Restore last workspace state on reload
//
// Persists to sessionStorage (tab-level, cleared on browser close)
// with localStorage fallback for cross-tab "last session".
//
// Captures:
//   • Last active section / route
//   • Active filters per module
//   • Draft content (comment boxes, forms)
//   • Pending un-submitted actions
//   • Scroll position per page
//   • Widget visibility config
//
// Usage:
//   import { saveSession, restoreSession } from '@/core/rollout/session/sessionRecovery';
//   saveSession({ section: 'tasks', filters: { status: 'open' } });
//   const last = restoreSession();  // → { section, filters, drafts, ... }
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log = createLogger('SessionRecovery');

const SESSION_KEY     = '__lw_session';
const LAST_KEY        = '__lw_last_session'; // localStorage — survives close
const MAX_DRAFTS      = 20;
const MAX_PENDING     = 50;

// ── Helpers ────────────────────────────────────────────────────
function _read(storage, key) {
  try { return JSON.parse(storage.getItem(key) ?? 'null'); } catch { return null; }
}
function _write(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}
function _del(storage, key) {
  try { storage.removeItem(key); } catch { /* ignore */ }
}

// ── Default session shape ──────────────────────────────────────
function _defaultSession() {
  return {
    savedAt:        null,
    section:        null,       // active route key e.g. 'tasks', 'attendance'
    scrollPositions: {},        // { routeKey: scrollY }
    filters:        {},         // { moduleKey: filterObject }
    drafts:         [],         // [{ id, type, content, savedAt }]
    pendingActions: [],         // [{ id, type, payload, enqueuedAt }]
    widgetVisibility: {},       // { widgetKey: bool }
    compactMode:    false,
    openDrawers:    [],         // list of open drawer keys
  };
}

// ── In-memory current session ──────────────────────────────────
let _current = null;

function _ensure() {
  if (!_current) {
    _current = _read(sessionStorage, SESSION_KEY) ?? _defaultSession();
  }
  return _current;
}

function _flush() {
  if (!_current) return;
  _current.savedAt = Date.now();
  _write(sessionStorage, SESSION_KEY, _current);
  // Also persist to localStorage as "last session" for cross-tab restore
  _write(localStorage, LAST_KEY, _current);
}

// ── Public API ─────────────────────────────────────────────────

/** Save an arbitrary partial session update. */
export function saveSession(patch = {}) {
  const s = _ensure();
  Object.assign(s, patch);
  _flush();
}

/** Get the full current session snapshot. */
export function getSession() {
  return { ..._ensure() };
}

/** Restore last session (from sessionStorage or localStorage fallback). */
export function restoreSession() {
  const sessionData = _read(sessionStorage, SESSION_KEY);
  if (sessionData) {
    _current = sessionData;
    log.debug('session restored from sessionStorage', { section: sessionData.section });
    return sessionData;
  }

  const lastSession = _read(localStorage, LAST_KEY);
  if (lastSession) {
    _current = lastSession;
    // Flush to sessionStorage so this tab owns it
    _write(sessionStorage, SESSION_KEY, _current);
    log.info('last session restored from localStorage', { section: lastSession.section });
    return lastSession;
  }

  _current = _defaultSession();
  return _current;
}

// ── Section tracking ───────────────────────────────────────────
export function setActiveSection(section) {
  _ensure().section = section;
  _flush();
}

export function getActiveSection() {
  return _ensure().section;
}

// ── Scroll positions ───────────────────────────────────────────
export function saveScrollPosition(routeKey, scrollY) {
  _ensure().scrollPositions[routeKey] = scrollY;
  _flush();
}

export function getScrollPosition(routeKey) {
  return _ensure().scrollPositions[routeKey] ?? 0;
}

// ── Filters ────────────────────────────────────────────────────
export function saveFilters(moduleKey, filters) {
  _ensure().filters[moduleKey] = filters;
  _flush();
}

export function getFilters(moduleKey) {
  return _ensure().filters[moduleKey] ?? null;
}

export function clearFilters(moduleKey) {
  delete _ensure().filters[moduleKey];
  _flush();
}

// ── Drafts ────────────────────────────────────────────────────
/**
 * Save a draft (comment, form, etc.)
 * @param {{ id: string, type: string, content: any }} draft
 */
export function saveDraft(draft) {
  const s = _ensure();
  s.drafts = s.drafts.filter((d) => d.id !== draft.id);
  s.drafts.unshift({ ...draft, savedAt: Date.now() });
  if (s.drafts.length > MAX_DRAFTS) s.drafts.length = MAX_DRAFTS;
  _flush();
  log.debug(`draft saved: "${draft.id}"`);
}

export function getDraft(id) {
  return _ensure().drafts.find((d) => d.id === id) ?? null;
}

export function getDraftsByType(type) {
  return _ensure().drafts.filter((d) => d.type === type);
}

export function clearDraft(id) {
  const s = _ensure();
  s.drafts = s.drafts.filter((d) => d.id !== id);
  _flush();
}

export function clearAllDrafts() {
  _ensure().drafts = [];
  _flush();
}

// ── Pending actions ────────────────────────────────────────────
export function savePendingAction(action) {
  const s = _ensure();
  s.pendingActions = s.pendingActions.filter((a) => a.id !== action.id);
  s.pendingActions.unshift({ ...action, enqueuedAt: Date.now() });
  if (s.pendingActions.length > MAX_PENDING) s.pendingActions.length = MAX_PENDING;
  _flush();
}

export function getPendingActions() {
  return [...(_ensure().pendingActions)];
}

export function removePendingAction(id) {
  const s = _ensure();
  s.pendingActions = s.pendingActions.filter((a) => a.id !== id);
  _flush();
}

// ── Widget visibility ──────────────────────────────────────────
export function saveWidgetVisibility(key, visible) {
  _ensure().widgetVisibility[key] = visible;
  _flush();
}

export function getWidgetVisibility(key, defaultValue = true) {
  const v = _ensure().widgetVisibility[key];
  return v === undefined ? defaultValue : v;
}

// ── Open drawers ───────────────────────────────────────────────
export function saveOpenDrawers(drawers) {
  _ensure().openDrawers = drawers;
  _flush();
}

export function getOpenDrawers() {
  return [...(_ensure().openDrawers)];
}

// ── Compact mode ───────────────────────────────────────────────
export function saveCompactMode(enabled) {
  _ensure().compactMode = enabled;
  _flush();
}

export function getCompactMode() {
  return _ensure().compactMode ?? false;
}

// ── Full reset ─────────────────────────────────────────────────
export function clearSession() {
  _current = _defaultSession();
  _del(sessionStorage, SESSION_KEY);
  log.info('session cleared');
}

export function clearLastSession() {
  _del(localStorage, LAST_KEY);
  log.info('last session cleared');
}
