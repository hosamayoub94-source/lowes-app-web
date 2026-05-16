// =============================================================
// queueValidation — Queue payload guards + job contract checks
//
// Validates job payloads before they enter the queue and
// before handlers execute them. Catches schema drift early.
// =============================================================
import { validate }     from './runtimeValidations';
import { createLogger } from '@/core/production/productionLogger';
import { captureError } from '@/core/production/errorReporter';

const log = createLogger('QueueValidation');

// ── Job payload schemas ────────────────────────────────────────
const JOB_SCHEMAS = {
  'attendance.sync': {
    user_id:    { type: 'string',  required: true },
    date:       { type: 'string',  required: true },
    action:     { type: 'string',  required: true, validator: (v) => ['check_in','check_out'].includes(v) || `invalid action: ${v}` },
  },
  'notification.send': {
    type:       { type: 'string',  required: true },
    user_id:    { type: 'string',  required: true },
    title:      { type: 'nonEmpty', required: true },
  },
  'notification.batch_send': {
    user_ids:   { type: 'array',   required: true },
    type:       { type: 'string',  required: true },
  },
  'task.assigned': {
    task_id:    { type: 'string',  required: true },
    assigned_to:{ type: 'string',  required: true },
  },
  'crm.lead_followup': {
    lead_id:    { type: 'string',  required: true },
    due_date:   { type: 'string',  required: false },
  },
  'audit.log': {
    action:     { type: 'string',  required: true },
    user_id:    { type: 'string',  required: true },
  },
  'collab.mention_notify': {
    mention_user_id: { type: 'string', required: true },
    comment_id:      { type: 'string', required: true },
    entity_type:     { type: 'string', required: true },
  },
};

// ── Validate before enqueue ────────────────────────────────────
/**
 * Validate a job payload before adding to queue.
 * Returns { valid, errors } — caller decides whether to proceed.
 *
 * @param {string} jobType
 * @param {object} payload
 */
export function validateJobPayload(jobType, payload) {
  const schema = JOB_SCHEMAS[jobType];
  if (!schema) {
    // Unknown job type — allow through, just warn
    log.warn(`No schema registered for job type: "${jobType}"`);
    return { valid: true, errors: [] };
  }
  return validate(payload, schema, `job:${jobType}`);
}

// ── Validate before execution ──────────────────────────────────
/**
 * Validate a job payload before the handler runs.
 * In dev: throws. In prod: logs + captures error.
 *
 * @param {string} jobType
 * @param {object} payload
 * @returns {boolean} — true if safe to execute
 */
export function assertJobPayload(jobType, payload) {
  const { valid, errors } = validateJobPayload(jobType, payload);
  if (!valid) {
    const msg = `Job payload invalid [${jobType}]: ${errors.join('; ')}`;
    if (import.meta.env.DEV) {
      throw new Error(msg);
    }
    captureError(new Error(msg), { context: `queueValidation:${jobType}`, extra: { errors } });
    return false;
  }
  return true;
}

// ── Register custom job schema ─────────────────────────────────
export function registerJobSchema(jobType, schema) {
  JOB_SCHEMAS[jobType] = schema;
}

// ── Inspect registered schemas ─────────────────────────────────
export function getJobSchemas() {
  return { ...JOB_SCHEMAS };
}

// ── Validate queue snapshot (bulk health check) ────────────────
/**
 * Scan the whole queue and return a list of invalid jobs.
 * @param {Array} jobs — array of { id, type, payload }
 */
export function scanQueueHealth(jobs = []) {
  const issues = [];
  for (const job of jobs) {
    if (!job.type) { issues.push({ id: job.id, error: 'missing job.type' }); continue; }
    if (!job.payload) { issues.push({ id: job.id, error: 'missing job.payload' }); continue; }
    const { valid, errors } = validateJobPayload(job.type, job.payload);
    if (!valid) issues.push({ id: job.id, type: job.type, errors });
  }
  if (issues.length > 0) {
    log.warn(`Queue scan found ${issues.length} invalid job(s)`, { issues });
  }
  return issues;
}
