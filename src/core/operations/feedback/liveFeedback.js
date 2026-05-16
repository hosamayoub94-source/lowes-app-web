// =============================================================
// liveFeedback — In-context employee feedback collection
//
// Lightweight, zero-modal feedback:
//   • Quick emoji reactions on any screen (👍 😐 👎)
//   • Friction reports (one-tap: "This is confusing")
//   • Employee suggestions (short text, optional)
//   • Workflow complaints (linked to current workflow)
//   • Auto-dimissing toast prompt after slow actions
// =============================================================
import { createLogger } from '@/core/production/productionLogger';
import { emit }         from '@/core/events/eventBus';

const log = createLogger('LiveFeedback');

// ── Storage ────────────────────────────────────────────────────
const FEEDBACK_KEY    = '__lw_live_feedback';
const MAX_FEEDBACK    = 200;

const _feedbackItems  = [];    // all collected feedback
let   _userId         = null;
let   _currentPage    = null;
let   _currentWorkflow = null;

// ── Init ───────────────────────────────────────────────────────
export function initLiveFeedback(userId) {
  _userId = userId;
  _loadPersistedFeedback();
  log.info('Live feedback initialized');
}

export function setFeedbackContext(page, workflow = null) {
  _currentPage     = page;
  _currentWorkflow = workflow;
}

// ── Core feedback writer ───────────────────────────────────────
function _writeFeedback(type, content, meta = {}) {
  const item = {
    id:       `fb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    content,
    page:     _currentPage,
    workflow: _currentWorkflow,
    userId:   _userId,
    ts:       Date.now(),
    ...meta,
  };

  _feedbackItems.push(item);
  if (_feedbackItems.length > MAX_FEEDBACK) _feedbackItems.shift();

  emit('ops:feedback_received', { type, userId: _userId, page: _currentPage });
  _persistFeedback();
  return item;
}

// ── Quick reactions ────────────────────────────────────────────
export const REACTIONS = {
  POSITIVE: 'positive',   // 👍
  NEUTRAL:  'neutral',    // 😐
  NEGATIVE: 'negative',   // 👎
};

export function submitReaction(reaction, context = {}) {
  const item = _writeFeedback('reaction', reaction, {
    context,
    label: reaction === 'positive' ? '👍' : reaction === 'neutral' ? '😐' : '👎',
  });
  log.info(`Reaction: ${reaction} on ${_currentPage}`);
  return item;
}

// ── Friction reports ───────────────────────────────────────────
export const FRICTION_TYPES = {
  CONFUSING:   'confusing',
  TOO_SLOW:    'too_slow',
  HARD_TO_FIND: 'hard_to_find',
  BROKEN:      'broken',
  TOO_MANY_STEPS: 'too_many_steps',
};

export function reportFriction(frictionType, details = '') {
  const item = _writeFeedback('friction_report', frictionType, { details });
  log.warn(`Friction reported: ${frictionType} on ${_currentPage}`);
  return item;
}

// ── Suggestions ────────────────────────────────────────────────
export function submitSuggestion(text, category = 'general') {
  if (!text?.trim()) return null;
  const item = _writeFeedback('suggestion', text.trim().slice(0, 300), { category });
  log.info(`Suggestion submitted: "${text.slice(0, 50)}…"`);
  return item;
}

// ── Workflow complaints ────────────────────────────────────────
export function reportWorkflowComplaint(workflow, complaint) {
  const item = _writeFeedback('workflow_complaint', complaint, { workflow });
  return item;
}

// ── Quick thumbs on a workflow completion ─────────────────────
export function rateWorkflow(workflowType, rating) {
  // rating: 1-5
  const item = _writeFeedback('workflow_rating', rating, { workflowType });
  return item;
}

// ── Analytics ─────────────────────────────────────────────────
export function getFeedbackSummary() {
  const byType = {};
  for (const item of _feedbackItems) {
    byType[item.type] = (byType[item.type] ?? 0) + 1;
  }

  const reactions  = _feedbackItems.filter((f) => f.type === 'reaction');
  const posCount   = reactions.filter((f) => f.content === 'positive').length;
  const negCount   = reactions.filter((f) => f.content === 'negative').length;
  const sentiment  = reactions.length > 0 ? Math.round(posCount / reactions.length * 100) : null;

  const friction   = _feedbackItems.filter((f) => f.type === 'friction_report');
  const topFriction = Object.entries(
    friction.reduce((acc, f) => { acc[f.content] = (acc[f.content] ?? 0) + 1; return acc; }, {})
  ).sort(([, a], [, b]) => b - a).slice(0, 5);

  const suggestions = _feedbackItems.filter((f) => f.type === 'suggestion');
  const complaints  = _feedbackItems.filter((f) => f.type === 'workflow_complaint');

  return {
    total:          _feedbackItems.length,
    byType,
    sentiment,
    positiveCount:  posCount,
    negativeCount:  negCount,
    topFrictions:   topFriction,
    suggestionCount: suggestions.length,
    complaintCount:  complaints.length,
    recentItems:     _feedbackItems.slice(-10).reverse(),
  };
}

export function getFeedbackByPage() {
  const byPage = {};
  for (const item of _feedbackItems) {
    const page = item.page ?? 'unknown';
    byPage[page] = byPage[page] ?? { positive: 0, negative: 0, friction: 0, suggestions: 0, total: 0 };
    byPage[page].total++;
    if (item.type === 'reaction')        { item.content === 'positive' ? byPage[page].positive++ : byPage[page].negative++; }
    if (item.type === 'friction_report') byPage[page].friction++;
    if (item.type === 'suggestion')      byPage[page].suggestions++;
  }

  return Object.entries(byPage)
    .map(([page, stats]) => ({ page, ...stats, healthScore: Math.round((stats.positive / (stats.positive + stats.negative || 1)) * 100) }))
    .sort((a, b) => b.total - a.total);
}

export function getAllFeedback(limit = 50) {
  return _feedbackItems.slice(-limit).reverse();
}

export function clearFeedback() {
  _feedbackItems.length = 0;
  localStorage.removeItem(FEEDBACK_KEY);
}

// ── Persistence ────────────────────────────────────────────────
function _persistFeedback() {
  try {
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(_feedbackItems.slice(-100)));
  } catch { /* quota */ }
}

function _loadPersistedFeedback() {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    if (!raw) return;
    const items   = JSON.parse(raw);
    const cutoff  = Date.now() - 30 * 86_400_000;
    _feedbackItems.push(...items.filter((f) => f.ts > cutoff));
  } catch { /* ignore */ }
}

// ── Quick Feedback Widget (headless logic) ────────────────────
/**
 * Returns the props needed for a quick feedback prompt component.
 * The UI rendering is handled in the React layer.
 */
export function getQuickFeedbackPromptState() {
  return {
    onReact:      submitReaction,
    onFriction:   reportFriction,
    onSuggest:    submitSuggestion,
    frictionTypes: FRICTION_TYPES,
    reactions:    REACTIONS,
  };
}
