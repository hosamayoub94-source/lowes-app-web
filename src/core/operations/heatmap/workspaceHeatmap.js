// =============================================================
// workspaceHeatmap — Usage intensity map for the workspace
//
// Builds a heat model of which areas employees use most:
//   • Per-zone click frequency
//   • Per-module engagement
//   • Neglected areas (no interaction in N days)
//   • Navigation bottlenecks (pages that bounce quickly)
//   • Time-of-day heat map
// =============================================================
import { createLogger } from '@/core/production/productionLogger';

const log = createLogger('WorkspaceHeatmap');

// ── Zone registry ──────────────────────────────────────────────
// App zones/sections that can be tracked
export const ZONES = {
  WORKSPACE_DAILY:   'workspace.daily',
  WORKSPACE_TASKS:   'workspace.tasks',
  WORKSPACE_TEAM:    'workspace.team',
  NAV_ATTENDANCE:    'nav.attendance',
  NAV_TASKS:         'nav.tasks',
  NAV_CRM:           'nav.crm',
  NAV_TEAM:          'nav.team',
  NAV_HOLIDAYS:      'nav.holidays',
  NAV_PROFILE:       'nav.profile',
  ADMIN_PANEL:       'admin.panel',
  COMMAND_PALETTE:   'command_palette',
  QUICK_ACTIONS:     'quick_actions',
  NOTIFICATION_CENTER: 'notification_center',
  HELP_OVERLAY:      'help_overlay',
  SEARCH_BAR:        'search_bar',
  COLLABORATION_FEED: 'collaboration.feed',
};

// ── Heat data ──────────────────────────────────────────────────
const _zoneHeat    = new Map();   // zone → { clicks, dwellMs, visits, lastTs }
const _moduleHeat  = new Map();   // module → { actions, errors, dwellMs }
const _hourlyHeat  = Array(24).fill(0); // clicks per hour
const PERSIST_KEY  = '__lw_heatmap';

// ── Zone interaction recording ─────────────────────────────────
export function heatClick(zone) {
  const now    = Date.now();
  const data   = _zoneHeat.get(zone) ?? { clicks: 0, dwellMs: 0, visits: 0, lastTs: null };
  data.clicks++;
  data.lastTs = now;
  _zoneHeat.set(zone, data);

  // Hourly
  _hourlyHeat[new Date().getHours()]++;

  _throttledFlush();
}

export function heatDwell(zone, dwellMs) {
  const data  = _zoneHeat.get(zone) ?? { clicks: 0, dwellMs: 0, visits: 0, lastTs: null };
  data.dwellMs += dwellMs;
  data.visits++;
  _zoneHeat.set(zone, data);
}

export function heatModule(module, action, isError = false) {
  const data = _moduleHeat.get(module) ?? { actions: 0, errors: 0, dwellMs: 0 };
  data.actions++;
  if (isError) data.errors++;
  _moduleHeat.set(module, data);
}

// ── Heatmap queries ────────────────────────────────────────────
export function getZoneHeatmap() {
  const zones = [];
  const maxClicks = Math.max(...[..._zoneHeat.values()].map((d) => d.clicks), 1);

  for (const [zone, data] of _zoneHeat.entries()) {
    zones.push({
      zone,
      clicks:    data.clicks,
      visits:    data.visits,
      dwellMs:   data.dwellMs,
      avgDwell:  data.visits > 0 ? Math.round(data.dwellMs / data.visits) : 0,
      intensity: Math.round(data.clicks / maxClicks * 100), // 0-100
      lastTs:    data.lastTs,
      stale:     data.lastTs ? Date.now() - data.lastTs > 7 * 86_400_000 : true,
    });
  }

  return zones.sort((a, b) => b.clicks - a.clicks);
}

export function getModuleHeatmap() {
  const modules = [];
  const maxActions = Math.max(...[..._moduleHeat.values()].map((d) => d.actions), 1);

  for (const [module, data] of _moduleHeat.entries()) {
    modules.push({
      module,
      actions:    data.actions,
      errors:     data.errors,
      errorRate:  data.actions > 0 ? Math.round(data.errors / data.actions * 100) : 0,
      intensity:  Math.round(data.actions / maxActions * 100),
    });
  }

  return modules.sort((a, b) => b.actions - a.actions);
}

export function getHourlyHeatmap() {
  const max = Math.max(..._hourlyHeat, 1);
  return _hourlyHeat.map((count, hour) => ({
    hour,
    label:     `${hour}:00`,
    count,
    intensity: Math.round(count / max * 100),
  }));
}

export function getNeglectedZones() {
  const now      = Date.now();
  const cutoff   = 7 * 86_400_000;
  const neglected = [];

  // Zones in ZONES registry that have zero or no recent interaction
  for (const zone of Object.values(ZONES)) {
    const data = _zoneHeat.get(zone);
    if (!data || data.clicks === 0) {
      neglected.push({ zone, reason: 'never_used', clicks: 0 });
    } else if (now - (data.lastTs ?? 0) > cutoff) {
      neglected.push({ zone, reason: 'stale', clicks: data.clicks, lastTs: data.lastTs });
    }
  }

  return neglected;
}

export function getBottlenecks() {
  // Zones/pages with high visits but very short dwell → confusing or wrong
  const zones  = getZoneHeatmap();
  return zones
    .filter((z) => z.visits > 3 && z.avgDwell < 2000) // visited but < 2s dwell
    .map((z) => ({
      zone:     z.zone,
      visits:   z.visits,
      avgDwell: z.avgDwell,
      hint:     'Users leave quickly — possible mismatch with expectation',
    }));
}

// ── Visual heat model (for rendering) ─────────────────────────
export function getHeatmapSummary() {
  const zones    = getZoneHeatmap();
  const modules  = getModuleHeatmap();
  const hourly   = getHourlyHeatmap();
  const neglected = getNeglectedZones();
  const bottlenecks = getBottlenecks();

  const hotZones = zones.filter((z) => z.intensity > 60);
  const coldZones = zones.filter((z) => z.intensity < 20 || z.stale);

  return {
    hotZones,
    coldZones,
    neglected,
    bottlenecks,
    hourly,
    peakHour: hourly.reduce((max, h) => h.count > max.count ? h : max, hourly[0]),
    moduleRanking: modules.slice(0, 8),
    totalClicks:   [..._zoneHeat.values()].reduce((s, d) => s + d.clicks, 0),
    totalZones:    _zoneHeat.size,
  };
}

// ── Persistence ───────────────────────────────────────────────
let _flushTimer = null;
function _throttledFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => { _flushTimer = null; _flush(); }, 10_000);
}

function _flush() {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify({
      zones:   Object.fromEntries(_zoneHeat),
      modules: Object.fromEntries(_moduleHeat),
      hourly:  _hourlyHeat,
      savedAt: Date.now(),
    }));
  } catch { /* quota */ }
}

export function loadPersistedHeatmap() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    const cutoff = Date.now() - 30 * 86_400_000;
    if (data.savedAt < cutoff) return; // too old, discard

    for (const [k, v] of Object.entries(data.zones ?? {})) _zoneHeat.set(k, v);
    for (const [k, v] of Object.entries(data.modules ?? {})) _moduleHeat.set(k, v);
    if (Array.isArray(data.hourly)) data.hourly.forEach((c, i) => { _hourlyHeat[i] += c; });
  } catch { /* ignore */ }
}
