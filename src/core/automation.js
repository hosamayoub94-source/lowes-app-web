// =============================================================
// Core Automation — scheduled background tasks (client-side).
// =============================================================

const _tasks = [];

export function registerTask(id, fn, intervalMs) {
  _tasks.push({ id, fn, intervalMs, handle: null });
}

function startAll() {
  _tasks.forEach((t) => {
    if (t.handle) return;
    t.handle = setInterval(() => {
      try { t.fn(); } catch (e) { console.warn(`[automation] Task "${t.id}" error:`, e); }
    }, t.intervalMs);
  });
}

function stopAll() {
  _tasks.forEach((t) => { if (t.handle) { clearInterval(t.handle); t.handle = null; } });
}

/** Called by main.jsx during boot. */
export function bootAutomation() {
  startAll();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAll(); else startAll();
  });
  console.info('[core/automation] Automation ready');
}

export default { registerTask, bootAutomation };
