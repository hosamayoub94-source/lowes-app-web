// =============================================================
// Automation Engine — Bootstrap
//
// bootAutomation()     — call once at app start (after bootQueue)
// shutdownAutomation() — call on app teardown / test cleanup
// =============================================================
import { hydrateAutomation, useAutomationStore } from './automationStore';
import { configureEngine }                        from './automationEngine';
import {
  registerAutomationBridge,
  unregisterAutomationBridge,
}                                                 from './eventBusIntegration';

let _booted = false;

/**
 * Initialise the Automation Engine.
 * Safe to call multiple times — idempotent.
 *
 * @param {object} [opts]
 * @param {object[]} [opts.defaultRules] — seed rules (only added if store is empty)
 */
export function bootAutomation({ defaultRules = [] } = {}) {
  if (_booted) return;
  _booted = true;

  // 1. Restore persisted rules from localStorage
  hydrateAutomation();

  // 2. Seed default rules if the store is empty
  if (defaultRules.length > 0) {
    const { rules, addRule } = useAutomationStore.getState();
    if (rules.length === 0) {
      defaultRules.forEach((r) => addRule(r));
    }
  }

  // 3. Wire the engine to the Zustand store
  configureEngine({ store: useAutomationStore });

  // 4. Subscribe to event bus events
  registerAutomationBridge();

  if (import.meta.env.DEV) {
    const { rules } = useAutomationStore.getState();
    console.info(
      `[Automation] Boot complete — ${rules.length} rule(s) loaded`,
    );
  }
}

/**
 * Graceful shutdown — removes event bus subscriptions.
 * Persisted rules remain in localStorage for next boot.
 */
export function shutdownAutomation() {
  if (!_booted) return;
  _booted = false;

  unregisterAutomationBridge();

  if (import.meta.env.DEV) {
    console.info('[Automation] Shutdown complete');
  }
}

/** @returns {boolean} */
export function isAutomationBooted() {
  return _booted;
}
