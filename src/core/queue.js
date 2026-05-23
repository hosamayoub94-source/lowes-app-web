// =============================================================
// Core Queue — offline-safe action queue with localStorage persistence.
// =============================================================

const QUEUE_KEY = 'lp_action_queue';
const _handlers = {};

function read() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}

function write(items) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-500))); } catch { /* storage full */ }
}

export function enqueue(type, payload) {
  const item = { id: Date.now() + Math.random(), type, payload, ts: new Date().toISOString() };
  write([...read(), item]);
  if (navigator.onLine) flush();
}

export function registerHandler(type, handler) {
  _handlers[type] = handler;
}

export async function flush() {
  const items = read();
  if (!items.length) return;
  const remaining = [];
  for (const item of items) {
    const handler = _handlers[item.type];
    if (!handler) { remaining.push(item); continue; }
    try {
      await handler(item.payload);
    } catch {
      remaining.push(item);
    }
  }
  write(remaining);
}

/** Called by main.jsx during boot. */
export function bootQueue() {
  window.addEventListener('online', flush);
  flush();
  console.info('[core/queue] Queue ready');
}

export default { enqueue, registerHandler, flush, bootQueue };
