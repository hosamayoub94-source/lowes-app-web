// =============================================================
// productivityMetrics — Employee productivity pattern analysis
//
// Tracks and surfaces:
//   • Daily active employees (DAE)
//   • Feature adoption rates
//   • Most productive time windows
//   • Per-module engagement depth
//   • Power users vs occasional users
//   • Response time to assigned work
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log = createLogger('ProductivityMetrics');

// ── Stores ─────────────────────────────────────────────────────
const _dailyActivity  = new Map();   // 'YYYY-MM-DD' → Set of userIds
const _featureUsage   = new Map();   // feature → Set of userIds
const _userEngagement = new Map();   // userId → { actions, pages, workflows, lastSeen }
const PERSIST_KEY     = '__lw_productivity_metrics';

// ── Activity registration ──────────────────────────────────────
export function recordUserActivity(userId, feature, action) {
  if (!userId) return;
  const today = _today();

  // Daily active
  if (!_dailyActivity.has(today)) _dailyActivity.set(today, new Set());
  _dailyActivity.get(today).add(userId);

  // Feature adoption
  if (feature) {
    if (!_featureUsage.has(feature)) _featureUsage.set(feature, new Set());
    _featureUsage.get(feature).add(userId);
  }

  // User engagement
  const engagement = _userEngagement.get(userId) ?? { actions: 0, pages: new Set(), workflows: 0, lastSeen: null, features: new Set() };
  engagement.actions++;
  engagement.lastSeen = Date.now();
  if (feature) engagement.features.add(feature);
  _userEngagement.set(userId, engagement);
}

export function recordPageVisit(userId, page) {
  if (!userId) return;
  const engagement = _userEngagement.get(userId) ?? { actions: 0, pages: new Set(), workflows: 0, lastSeen: null, features: new Set() };
  engagement.pages.add(page);
  engagement.lastSeen = Date.now();
  _userEngagement.set(userId, engagement);
}

export function recordWorkflowCompletion(userId) {
  if (!userId) return;
  const engagement = _userEngagement.get(userId) ?? { actions: 0, pages: new Set(), workflows: 0, lastSeen: null, features: new Set() };
  engagement.workflows++;
  _userEngagement.set(userId, engagement);
}

// ── DAE (Daily Active Employees) ───────────────────────────────
export function getDailyActiveEmployees() {
  const today     = _today();
  const yesterday = _dayOffset(-1);
  const last7Days = [...Array(7)].map((_, i) => _dayOffset(-i));

  return {
    today:      _dailyActivity.get(today)?.size ?? 0,
    yesterday:  _dailyActivity.get(yesterday)?.size ?? 0,
    last7Days:  last7Days.map((d) => ({
      date:  d,
      count: _dailyActivity.get(d)?.size ?? 0,
    })),
    peak:       Math.max(...[..._dailyActivity.values()].map((s) => s.size), 0),
  };
}

// ── Feature adoption ───────────────────────────────────────────
export function getFeatureAdoption(totalUsers = null) {
  const features = [];
  for (const [feature, users] of _featureUsage.entries()) {
    features.push({
      feature,
      userCount:  users.size,
      adoptionPct: totalUsers ? Math.round(users.size / totalUsers * 100) : null,
    });
  }
  return features.sort((a, b) => b.userCount - a.userCount);
}

// ── User engagement tiers ──────────────────────────────────────
export function getUserEngagementTiers() {
  const users = [];
  for (const [userId, data] of _userEngagement.entries()) {
    users.push({
      userId,
      actions:    data.actions,
      pagesVisited: data.pages.size,
      workflows:  data.workflows,
      features:   data.features.size,
      lastSeen:   data.lastSeen,
      tier:       _classifyUser(data),
    });
  }

  users.sort((a, b) => b.actions - a.actions);

  return {
    power:      users.filter((u) => u.tier === 'power'),
    regular:    users.filter((u) => u.tier === 'regular'),
    occasional: users.filter((u) => u.tier === 'occasional'),
    inactive:   users.filter((u) => u.tier === 'inactive'),
    all:        users,
  };
}

function _classifyUser({ actions, workflows, lastSeen }) {
  const daysSinceActive = lastSeen ? (Date.now() - lastSeen) / 86_400_000 : 999;
  if (daysSinceActive > 7)   return 'inactive';
  if (actions > 100 || workflows > 20) return 'power';
  if (actions > 20  || workflows > 5)  return 'regular';
  return 'occasional';
}

// ── Productivity summary ───────────────────────────────────────
export function getProductivitySummary() {
  const dae       = getDailyActiveEmployees();
  const adoption  = getFeatureAdoption();
  const tiers     = getUserEngagementTiers();

  return {
    dailyActive:     dae.today,
    weeklyTrend:     dae.last7Days,
    topFeatures:     adoption.slice(0, 5),
    powerUsers:      tiers.power.length,
    regularUsers:    tiers.regular.length,
    inactiveUsers:   tiers.inactive.length,
    totalTracked:    _userEngagement.size,
    featureCount:    _featureUsage.size,
  };
}

// ── Stuck / low engagement detection ──────────────────────────
export function getStuckUsers() {
  const now  = Date.now();
  const stuck = [];

  for (const [userId, data] of _userEngagement.entries()) {
    const daysSinceSeen = (now - (data.lastSeen ?? 0)) / 86_400_000;

    if (daysSinceSeen < 7 && data.workflows === 0 && data.actions < 5) {
      stuck.push({
        userId,
        hint:    'Active but not completing workflows — possible friction',
        actions: data.actions,
        daysSinceSeen: Math.round(daysSinceSeen),
      });
    }
  }

  return stuck;
}

// ── Response time tracking ─────────────────────────────────────
const _assignmentTimes = new Map(); // assignmentId → assignedAt

export function recordTaskAssigned(assignmentId, userId) {
  _assignmentTimes.set(assignmentId, { userId, assignedAt: Date.now() });
}

export function recordTaskStarted(assignmentId) {
  const data = _assignmentTimes.get(assignmentId);
  if (!data) return null;
  const responseMs = Date.now() - data.assignedAt;
  _assignmentTimes.delete(assignmentId);
  return responseMs;
}

// ── Helpers ────────────────────────────────────────────────────
function _today() { return new Date().toISOString().split('T')[0]; }
function _dayOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

// ── Persistence ────────────────────────────────────────────────
export function persistProductivityMetrics() {
  try {
    const data = {
      dailyActivity: Object.fromEntries([..._dailyActivity.entries()].map(([k, v]) => [k, [...v]])),
      featureUsage:  Object.fromEntries([..._featureUsage.entries()].map(([k, v]) => [k, [...v]])),
      savedAt:       Date.now(),
    };
    localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
  } catch { /* quota */ }
}

export function loadPersistedProductivityMetrics() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    const cutoff = _dayOffset(-30); // 30 days back

    for (const [date, users] of Object.entries(data.dailyActivity ?? {})) {
      if (date >= cutoff) _dailyActivity.set(date, new Set(users));
    }
    for (const [feature, users] of Object.entries(data.featureUsage ?? {})) {
      _featureUsage.set(feature, new Set(users));
    }
  } catch { /* ignore */ }
}
