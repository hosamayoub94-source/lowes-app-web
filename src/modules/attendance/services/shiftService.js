// =============================================================
// Attendance Module — Shift Service
//
// Resolves which shift is active for a user/time,
// computes expected check-in/out times, and detects lateness.
//
// Mock mode: returns DEFAULT_SHIFTS (no Supabase call needed).
// =============================================================
import { supabase }      from '@services/supabase';
import {
  DEFAULT_SHIFTS,
  SHIFT_TYPE,
  ATTENDANCE_STATUS,
} from '../types/attendance.types';

const TABLE = 'shifts';

// Mock flag — same pattern as notificationService
const _mockFlag = String(import.meta.env.VITE_USE_MOCK_ATTENDANCE ?? '').toLowerCase();
export const USE_MOCK = _mockFlag !== 'false';

// ── Fetch all active shifts ───────────────────────────────────

/**
 * Returns all active shifts.
 * @returns {Promise<object[]>}
 */
export async function fetchShifts() {
  if (USE_MOCK) return DEFAULT_SHIFTS.filter((s) => s.is_active);

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('is_active', true)
    .order('start_time');

  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch a single shift by ID.
 * @param {string} shiftId
 */
export async function fetchShiftById(shiftId) {
  if (USE_MOCK) return DEFAULT_SHIFTS.find((s) => s.id === shiftId) ?? null;

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', shiftId)
    .single();

  if (error) throw error;
  return data;
}

// ── Shift resolution ──────────────────────────────────────────

/**
 * Determine the active shift for the current time.
 * Returns the first shift whose window contains "now".
 * Falls back to morning shift.
 *
 * @param {Date} [now]
 * @param {object[]} [shifts] — pre-fetched shifts (avoids extra DB call)
 * @returns {Promise<object>} shift
 */
export async function getActiveShift(now = new Date(), shifts = null) {
  const all = shifts ?? (await fetchShifts());
  const day = now.getDay(); // 0=Sun

  // Filter to today's available shifts
  const todayShifts = all.filter(
    (s) => s.is_active && (s.days_of_week ?? []).includes(day),
  );

  if (!todayShifts.length) return DEFAULT_SHIFTS[0]; // fallback to morning

  const hhmm = _toHHMM(now);

  for (const shift of todayShifts) {
    if (shift.type === SHIFT_TYPE.FLEXIBLE) continue; // flexible is always available
    if (_isInShiftWindow(hhmm, shift.start_time, shift.end_time)) {
      return shift;
    }
  }

  // Outside any window — return the nearest upcoming shift
  const upcoming = todayShifts
    .filter((s) => s.type !== SHIFT_TYPE.FLEXIBLE)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .find((s) => s.start_time > hhmm);

  return upcoming ?? todayShifts[0];
}

// ── Lateness detection ────────────────────────────────────────

/**
 * Compute how many minutes late a check-in is.
 * Returns 0 if on time or within grace period.
 *
 * @param {Date}   checkInTime
 * @param {object} shift
 * @returns {number} late_by_minutes
 */
export function computeLateMinutes(checkInTime, shift) {
  const expected   = _parseShiftTime(checkInTime, shift.start_time);
  const graceEnd   = new Date(expected.getTime() + shift.grace_minutes * 60_000);
  if (checkInTime <= graceEnd) return 0;
  return Math.round((checkInTime - graceEnd) / 60_000);
}

/**
 * Check if employee is absent (no check-in + past detection window).
 *
 * @param {object} shift
 * @param {number} absentThresholdMinutes — minutes after shift start
 * @param {Date}   [now]
 * @returns {boolean}
 */
export function isAbsent(shift, absentThresholdMinutes = 120, now = new Date()) {
  const shiftStart = _parseShiftTime(now, shift.start_time);
  const deadline   = new Date(shiftStart.getTime() + absentThresholdMinutes * 60_000);
  return now >= deadline;
}

// ── Worked hours ──────────────────────────────────────────────

/**
 * Compute worked minutes from check-in/out times minus break time.
 *
 * @param {Date|string} checkIn
 * @param {Date|string} checkOut
 * @param {number}      breakMinutes
 * @returns {number} worked_minutes
 */
export function computeWorkedMinutes(checkIn, checkOut, breakMinutes = 0) {
  const ci = new Date(checkIn);
  const co = new Date(checkOut);
  if (isNaN(ci) || isNaN(co) || co <= ci) return 0;
  const total = Math.round((co - ci) / 60_000);
  return Math.max(0, total - breakMinutes);
}

/**
 * Compute overtime minutes (worked past shift end + threshold).
 *
 * @param {number} workedMinutes
 * @param {object} shift
 * @param {number} thresholdMinutes — grace period before OT starts
 * @returns {number}
 */
export function computeOvertimeMinutes(workedMinutes, shift, thresholdMinutes = 30) {
  const shiftDurationMinutes = _shiftDurationMinutes(shift);
  const overtimeStart = shiftDurationMinutes + thresholdMinutes;
  return Math.max(0, workedMinutes - overtimeStart);
}

/**
 * Format minutes as "H:MM" string.
 * @param {number} minutes
 * @returns {string}
 */
export function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0:00';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Parse a "HH:MM" shift time into a full Date on the same day as `ref`.
 */
function _parseShiftTime(ref, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(ref);
  d.setHours(h, m, 0, 0);
  return d;
}

function _toHHMM(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function _isInShiftWindow(hhmm, startTime, endTime) {
  if (endTime <= startTime) {
    // Overnight shift: e.g. 22:00 → 06:00
    return hhmm >= startTime || hhmm < endTime;
  }
  return hhmm >= startTime && hhmm < endTime;
}

function _shiftDurationMinutes(shift) {
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const [eh, em] = shift.end_time.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60; // overnight
  return diff;
}
