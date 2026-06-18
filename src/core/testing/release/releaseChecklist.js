// =============================================================
// releaseChecklist — Pre-release validation checklist
//
// Runs synchronous checks that don't require async calls.
// Use alongside deploymentReadiness for the full picture.
// =============================================================
import { validateEnvironment, validateFeatureFlags } from '../environment/envValidation';
import { createLogger } from '@/core/production/productionLogger';
import { getFlag } from '@/core/production/productionConfig';

const log = createLogger('ReleaseChecklist');

// ── Check definitions ──────────────────────────────────────────
function checkItem(name, category, fn) {
  try {
    const result = fn();
    return { name, category, ...result };
  } catch (err) {
    return { name, category, status: 'fail', message: err.message };
  }
}

const CHECKLIST_ITEMS = [
  // Auth integrity
  { name: 'Supabase URL configured',   category: 'Auth',    fn: () => ({ status: import.meta.env.VITE_SUPABASE_URL ? 'pass' : 'fail', message: import.meta.env.VITE_SUPABASE_URL ? 'Set' : 'Missing VITE_SUPABASE_URL' }) },
  { name: 'Supabase key configured',   category: 'Auth',    fn: () => ({ status: import.meta.env.VITE_SUPABASE_ANON_KEY ? 'pass' : 'fail', message: import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Set' : 'Missing VITE_SUPABASE_ANON_KEY' }) },

  // Production config
  { name: 'Error reporting enabled',   category: 'Config',  fn: () => { return { status: getFlag('enableErrorReporting') ? 'pass' : 'warn', message: getFlag('enableErrorReporting') ? 'Enabled' : 'Disabled' }; } },
  { name: 'Health monitor enabled',    category: 'Config',  fn: () => { try { return { status: getFlag('enableHealthMonitor') ? 'pass' : 'warn', message: getFlag('enableHealthMonitor') ? 'Enabled' : 'Disabled' }; } catch { return { status: 'skip', message: 'Config unavailable' }; } } },
  { name: 'Action locking enabled',    category: 'Config',  fn: () => { try { return { status: getFlag('enableActionLocking') ? 'pass' : 'warn', message: getFlag('enableActionLocking') ? 'Enabled' : 'Disabled' }; } catch { return { status: 'skip', message: 'Config unavailable' }; } } },
  { name: 'Safe mode OFF (prod)',       category: 'Config',  fn: () => { try { const sm = getFlag('safeMode'); return { status: sm ? 'warn' : 'pass', message: sm ? 'Safe mode is ON — intentional?' : 'Off' }; } catch { return { status: 'skip', message: '' }; } } },

  // Offline safety
  { name: 'Offline recovery enabled',  category: 'Offline', fn: () => { try { return { status: getFlag('enableOfflineRecovery') ? 'pass' : 'warn', message: getFlag('enableOfflineRecovery') ? 'Enabled' : 'Disabled' }; } catch { return { status: 'skip', message: '' }; } } },
  { name: 'localStorage available',    category: 'Offline', fn: () => {
    try { localStorage.setItem('__rc', '1'); localStorage.removeItem('__rc'); return { status: 'pass', message: 'Available' }; }
    catch { return { status: 'fail', message: 'localStorage blocked' }; }
  }},

  // Mobile
  { name: 'Viewport meta present',     category: 'Mobile',  fn: () => {
    const m = document.querySelector('meta[name="viewport"]');
    const content = m?.getAttribute('content') ?? '';
    return { status: content.includes('width=device-width') ? 'pass' : m ? 'warn' : 'fail', message: content || 'missing' };
  }},

  // Environment
  { name: 'Not in dev mock mode',      category: 'Env',     fn: () => {
    const env = import.meta.env;
    const mocks = ['VITE_USE_MOCK_ATTENDANCE','VITE_USE_MOCK_TASKS','VITE_USE_MOCK_CRM','VITE_USE_MOCK_REALTIME'];
    const active = mocks.filter((k) => env[k] === 'true');
    return { status: active.length > 0 ? 'warn' : 'pass', message: active.length > 0 ? `Mock mode active: ${active.join(', ')}` : 'No mock modes' };
  }},
  { name: 'Production build mode',     category: 'Env',     fn: () => ({ status: import.meta.env.PROD ? 'pass' : 'warn', message: import.meta.env.MODE }) },
];

// ── Run checklist ──────────────────────────────────────────────
export function runReleaseChecklist() {
  const items = CHECKLIST_ITEMS.map((item) => checkItem(item.name, item.category, item.fn));

  const byCategory = {};
  for (const item of items) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  const fails  = items.filter((i) => i.status === 'fail');
  const warns  = items.filter((i) => i.status === 'warn');
  const passes = items.filter((i) => i.status === 'pass');

  const overall = fails.length > 0 ? 'BLOCKED' : warns.length > 3 ? 'CAUTION' : 'READY';

  log.info(`Release checklist: ${overall} — ${passes.length} pass, ${warns.length} warn, ${fails.length} fail`);

  return {
    overall,
    items,
    byCategory,
    summary: { total: items.length, pass: passes.length, warn: warns.length, fail: fails.length },
    timestamp: Date.now(),
  };
}

// ── Format for display ─────────────────────────────────────────
export function formatChecklistMarkdown(report) {
  const { overall, byCategory, summary } = report;
  const lines = [`# Release Checklist — ${overall}`, `_${summary.pass} pass / ${summary.warn} warn / ${summary.fail} fail_`, ''];

  for (const [category, items] of Object.entries(byCategory)) {
    lines.push(`## ${category}`);
    for (const item of items) {
      const icon = { pass: '✅', warn: '⚠️', fail: '❌', skip: '⏭️' }[item.status] ?? '?';
      lines.push(`${icon} **${item.name}**: ${item.message}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
