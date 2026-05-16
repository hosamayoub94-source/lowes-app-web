// =============================================================
// Attendance Module — Attendance Service
//
// Core check-in / check-out / break flow.
// Integrates with shiftService for shift resolution + lateness.
//
// Mock mode: in-memory store persisted to localStorage.
//   Records survive page refreshes.
//   Team board seeded with realistic demo data on first load.
// =============================================================
import { supabase } from '@services/supabase';
import {
  ATTENDANCE_STATUS,
  BREAK_TYPE,
  ATTENDANCE_EVENT_TYPE,
  CHECK_IN_SOURCE,
  ABSENT_DETECTION_MINUTES,
  OVERTIME_THRESHOLD_MINUTES,
} from '../types/attendance.types';
import {
  getActiveShift,
  computeLateMinutes,
  computeWorkedMinutes,
  computeOvertimeMinutes,
} from './shiftService';

const RECORDS_TABLE = 'attendance_records';
const BREAKS_TABLE  = 'break_sessions';
const EVENTS_TABLE  = 'attendance_events';

// ── Mock flag ─────────────────────────────────────────────────
const _mockFlag = String(import.meta.env.VITE_USE_MOCK_ATTENDANCE ?? '').toLowerCase();
export const USE_MOCK = _mockFlag !== 'false';

// ── Mock in-memory store ───────────────────────────────────────
// Keys: "userId::YYYY-MM-DD"  →  attendance record object
// Break sessions stored inside each record as `_breaks[]`
const MOCK_STORAGE_KEY = '__mock_attendance_records';

function _loadMockStore() {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function _saveMockStore(store) {
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(store));
  } catch { /* storage full — ignore */ }
}

let _mockStore = _loadMockStore();

function _today() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function _recordKey(userId, date = _today()) {
  return `${userId}::${date}`;
}

function _mockRecord(userId, date = _today()) {
  return _mockStore[_recordKey(userId, date)] ?? null;
}

function _setMockRecord(record) {
  _mockStore[_recordKey(record.user_id, record.date)] = record;
  _saveMockStore(_mockStore);
}

/** Generate a stable UUID-like string from a seed string */
function _seedUUID(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  const hex = Math.abs(h).toString(16).padStart(8, '0');
  return `mock-${hex}-${seed.slice(0, 4)}-4000-8000-${Date.now().toString(16).slice(-12)}`;
}

function _newRecord(userId, date, shiftId, expectedIn, expectedOut) {
  return {
    id:                  _seedUUID(`${userId}${date}`),
    user_id:             userId,
    date,
    shift_id:            shiftId,
    status:              ATTENDANCE_STATUS.PENDING,
    check_in_time:       null,
    check_out_time:      null,
    expected_check_in:   expectedIn,
    expected_check_out:  expectedOut,
    worked_minutes:      0,
    overtime_minutes:    0,
    late_by_minutes:     0,
    break_minutes:       0,
    notes:               null,
    metadata:            {},
    check_in_source:     CHECK_IN_SOURCE.WEB,
    check_out_source:    CHECK_IN_SOURCE.WEB,
    created_at:          new Date().toISOString(),
    updated_at:          new Date().toISOString(),
    // Internal mock-only fields
    _breaks:             [],  // break_session objects
    _events:             [],  // attendance_event objects
  };
}

// ── Seed demo team data ────────────────────────────────────────
const DEMO_TEAM = [
  { id: 'user_demo_01', name: 'أحمد العلي',    name_en: 'Ahmed Al-Ali'   },
  { id: 'user_demo_02', name: 'سارة المحمد',   name_en: 'Sara Al-Mohammed'},
  { id: 'user_demo_03', name: 'محمد العمر',    name_en: 'Mohammed Al-Omar'},
  { id: 'user_demo_04', name: 'نورة الخالد',   name_en: 'Noura Al-Khaled' },
  { id: 'user_demo_05', name: 'فهد السعيد',    name_en: 'Fahad Al-Saeed'  },
];

function _seedDemoTeam() {
  const today = _today();
  const now   = new Date();
  const seeded = _mockStore['__demo_seeded'];
  if (seeded === today) return; // already done today

  const statuses = [
    ATTENDANCE_STATUS.PRESENT,
    ATTENDANCE_STATUS.PRESENT,
    ATTENDANCE_STATUS.LATE,
    ATTENDANCE_STATUS.ON_BREAK,
    ATTENDANCE_STATUS.ABSENT,
  ];

  DEMO_TEAM.forEach((member, i) => {
    const key = _recordKey(member.id, today);
    if (_mockStore[key]) return; // don't overwrite real data

    const status = statuses[i];
    const rec = _newRecord(member.id, today, 'shift_morning', '08:00', '16:00');

    rec.metadata = { name: member.name, name_en: member.name_en };

    if (status !== ATTENDANCE_STATUS.ABSENT && status !== ATTENDANCE_STATUS.PENDING) {
      const checkIn = new Date(now);
      checkIn.setHours(8, i === 2 ? 25 : 3, 0, 0); // user_03 is 25min late
      rec.check_in_time   = checkIn.toISOString();
      rec.check_in_source = CHECK_IN_SOURCE.WEB;
      rec.status          = status;
      if (i === 2) rec.late_by_minutes = 10; // after grace
    }

    if (status === ATTENDANCE_STATUS.ON_BREAK) {
      rec._breaks.push({
        id:                   _seedUUID(`break-${member.id}-1`),
        attendance_record_id: rec.id,
        user_id:              member.id,
        start_time:           new Date(now.getTime() - 10 * 60_000).toISOString(),
        end_time:             null,
        duration_minutes:     null,
        type:                 BREAK_TYPE.LUNCH,
        created_at:           new Date().toISOString(),
      });
    }

    _mockStore[key] = rec;
  });

  _mockStore['__demo_seeded'] = today;
  _saveMockStore(_mockStore);
}

if (USE_MOCK) _seedDemoTeam();

// ── Helpers ───────────────────────────────────────────────────

function _logEvent(record, eventType, metadata = {}) {
  record._events.push({
    id:                   _seedUUID(`ev-${eventType}-${Date.now()}`),
    attendance_record_id: record.id,
    user_id:              record.user_id,
    event_type:           eventType,
    occurred_at:          new Date().toISOString(),
    metadata,
    created_by:           record.user_id,
  });
}

async function _persistEvent(attendanceRecordId, userId, eventType, metadata = {}) {
  if (USE_MOCK) return;
  await supabase.from(EVENTS_TABLE).insert({
    attendance_record_id: attendanceRecordId,
    user_id:              userId,
    event_type:           eventType,
    occurred_at:          new Date().toISOString(),
    metadata,
    created_by:           userId,
  });
}

// ── Check-in ──────────────────────────────────────────────────

/**
 * Record a check-in for a user.
 *
 * @param {string} userId
 * @param {object} [opts]
 * @param {string} [opts.source]     CHECK_IN_SOURCE value
 * @param {string} [opts.notes]
 * @param {object} [opts.metadata]   extra JSON (device info, GPS coords …)
 * @param {Date}   [opts.now]        override current time (testing)
 * @returns {Promise<{ record: object, lateByMinutes: number, shift: object }>}
 */
export async function checkIn(userId, opts = {}) {
  const {
    source   = CHECK_IN_SOURCE.WEB,
    notes    = null,
    metadata = {},
    now      = new Date(),
  } = opts;

  const date  = now.toISOString().slice(0, 10);
  const shift = await getActiveShift(now);

  // ── Compute expected times ─────────────────────────────────
  const [shi, shm] = shift.start_time.split(':').map(Number);
  const [ehi, ehm] = shift.end_time.split(':').map(Number);
  const expectedIn  = new Date(now); expectedIn.setHours(shi, shm, 0, 0);
  const expectedOut = new Date(now); expectedOut.setHours(ehi, ehm, 0, 0);
  if (expectedOut <= expectedIn) expectedOut.setDate(expectedOut.getDate() + 1); // overnight

  const lateByMinutes = computeLateMinutes(now, shift);
  const status = lateByMinutes > 0
    ? ATTENDANCE_STATUS.LATE
    : ATTENDANCE_STATUS.PRESENT;

  // ── Mock path ─────────────────────────────────────────────
  if (USE_MOCK) {
    let rec = _mockRecord(userId, date);
    if (!rec) {
      rec = _newRecord(userId, date, shift.id, expectedIn.toISOString(), expectedOut.toISOString());
    }

    if (rec.check_in_time) {
      throw new Error('مسجّل مسبقاً اليوم'); // already checked in
    }

    rec.check_in_time   = now.toISOString();
    rec.check_in_source = source;
    rec.status          = status;
    rec.late_by_minutes = lateByMinutes;
    rec.shift_id        = shift.id;
    rec.expected_check_in  = expectedIn.toISOString();
    rec.expected_check_out = expectedOut.toISOString();
    if (notes) rec.notes = notes;
    rec.metadata  = { ...rec.metadata, ...metadata };
    rec.updated_at = now.toISOString();

    _logEvent(rec, ATTENDANCE_EVENT_TYPE.CHECK_IN, { source, lateByMinutes });
    if (lateByMinutes > 0) _logEvent(rec, ATTENDANCE_EVENT_TYPE.LATE_FLAGGED, { lateByMinutes });

    _setMockRecord(rec);
    return { record: rec, lateByMinutes, shift };
  }

  // ── Supabase path ─────────────────────────────────────────
  const { data: existing } = await supabase
    .from(RECORDS_TABLE)
    .select('id, check_in_time')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (existing?.check_in_time) throw new Error('مسجّل مسبقاً اليوم');

  const upsertPayload = {
    user_id:             userId,
    date,
    shift_id:            shift.id,
    status,
    check_in_time:       now.toISOString(),
    check_in_source:     source,
    expected_check_in:   expectedIn.toISOString(),
    expected_check_out:  expectedOut.toISOString(),
    late_by_minutes:     lateByMinutes,
    notes,
    metadata,
    updated_at:          now.toISOString(),
  };

  const { data: record, error } = await supabase
    .from(RECORDS_TABLE)
    .upsert(upsertPayload, { onConflict: 'user_id,date' })
    .select()
    .single();

  if (error) throw error;

  await _persistEvent(record.id, userId, ATTENDANCE_EVENT_TYPE.CHECK_IN, { source, lateByMinutes });
  if (lateByMinutes > 0) {
    await _persistEvent(record.id, userId, ATTENDANCE_EVENT_TYPE.LATE_FLAGGED, { lateByMinutes });
  }

  return { record, lateByMinutes, shift };
}

// ── Check-out ─────────────────────────────────────────────────

/**
 * Record a check-out for a user.
 *
 * @param {string} userId
 * @param {object} [opts]
 * @param {string} [opts.source]
 * @param {string} [opts.notes]
 * @param {object} [opts.metadata]
 * @param {Date}   [opts.now]
 * @returns {Promise<{ record: object, workedMinutes: number, overtimeMinutes: number, shift: object }>}
 */
export async function checkOut(userId, opts = {}) {
  const {
    source   = CHECK_IN_SOURCE.WEB,
    notes    = null,
    metadata = {},
    now      = new Date(),
  } = opts;

  const date = now.toISOString().slice(0, 10);

  // ── Mock path ─────────────────────────────────────────────
  if (USE_MOCK) {
    const rec = _mockRecord(userId, date);
    if (!rec) throw new Error('لا يوجد سجل حضور اليوم');
    if (!rec.check_in_time) throw new Error('لم يتم تسجيل الدخول بعد');
    if (rec.check_out_time) throw new Error('تم تسجيل الخروج مسبقاً');

    // Close any open break
    const openBreak = rec._breaks.find((b) => !b.end_time);
    if (openBreak) {
      openBreak.end_time = now.toISOString();
      openBreak.duration_minutes = Math.round(
        (now - new Date(openBreak.start_time)) / 60_000,
      );
    }

    // Re-sum all break minutes
    rec.break_minutes = rec._breaks.reduce((acc, b) => acc + (b.duration_minutes ?? 0), 0);

    const shift = await getActiveShift(now);
    const workedMinutes   = computeWorkedMinutes(rec.check_in_time, now, rec.break_minutes);
    const overtimeMinutes = computeOvertimeMinutes(workedMinutes, shift, OVERTIME_THRESHOLD_MINUTES);

    rec.check_out_time   = now.toISOString();
    rec.check_out_source = source;
    rec.status           = ATTENDANCE_STATUS.CHECKED_OUT;
    rec.worked_minutes   = workedMinutes;
    rec.overtime_minutes = overtimeMinutes;
    if (notes) rec.notes = notes;
    rec.metadata   = { ...rec.metadata, ...metadata };
    rec.updated_at = now.toISOString();

    _logEvent(rec, ATTENDANCE_EVENT_TYPE.CHECK_OUT, { source, workedMinutes, overtimeMinutes });
    if (overtimeMinutes > 0) {
      _logEvent(rec, ATTENDANCE_EVENT_TYPE.OVERTIME_STARTED, { overtimeMinutes });
    }

    _setMockRecord(rec);
    return { record: rec, workedMinutes, overtimeMinutes, shift };
  }

  // ── Supabase path ─────────────────────────────────────────
  const { data: rec, error: fetchErr } = await supabase
    .from(RECORDS_TABLE)
    .select('*, break_sessions(*)')
    .eq('user_id', userId)
    .eq('date', date)
    .single();

  if (fetchErr) throw fetchErr;
  if (!rec.check_in_time)  throw new Error('لم يتم تسجيل الدخول بعد');
  if (rec.check_out_time)  throw new Error('تم تسجيل الخروج مسبقاً');

  // Close any open break in DB
  const openBreak = (rec.break_sessions ?? []).find((b) => !b.end_time);
  if (openBreak) {
    const dur = Math.round((now - new Date(openBreak.start_time)) / 60_000);
    await supabase.from(BREAKS_TABLE).update({ end_time: now.toISOString(), duration_minutes: dur })
      .eq('id', openBreak.id);
  }

  const totalBreakMins = (rec.break_sessions ?? []).reduce((a, b) => a + (b.duration_minutes ?? 0), 0);

  const shift           = await getActiveShift(now);
  const workedMinutes   = computeWorkedMinutes(rec.check_in_time, now, totalBreakMins);
  const overtimeMinutes = computeOvertimeMinutes(workedMinutes, shift, OVERTIME_THRESHOLD_MINUTES);

  const { data: updated, error: updateErr } = await supabase
    .from(RECORDS_TABLE)
    .update({
      check_out_time:   now.toISOString(),
      check_out_source: source,
      status:           ATTENDANCE_STATUS.CHECKED_OUT,
      worked_minutes:   workedMinutes,
      overtime_minutes: overtimeMinutes,
      break_minutes:    totalBreakMins,
      notes,
      metadata,
      updated_at:       now.toISOString(),
    })
    .eq('id', rec.id)
    .select()
    .single();

  if (updateErr) throw updateErr;

  await _persistEvent(rec.id, userId, ATTENDANCE_EVENT_TYPE.CHECK_OUT, { source, workedMinutes, overtimeMinutes });

  return { record: updated, workedMinutes, overtimeMinutes, shift };
}

// ── Start Break ───────────────────────────────────────────────

/**
 * Start a break session.
 *
 * @param {string} userId
 * @param {string} [breakType]  BREAK_TYPE value, defaults to 'regular'
 * @param {Date}   [now]
 * @returns {Promise<{ record: object, breakSession: object }>}
 */
export async function startBreak(userId, breakType = BREAK_TYPE.REGULAR, now = new Date()) {
  const date = now.toISOString().slice(0, 10);

  // ── Mock ──────────────────────────────────────────────────
  if (USE_MOCK) {
    const rec = _mockRecord(userId, date);
    if (!rec) throw new Error('لا يوجد سجل حضور اليوم');
    if (!rec.check_in_time) throw new Error('يجب تسجيل الدخول أولاً');
    if (rec.check_out_time) throw new Error('تم تسجيل الخروج مسبقاً');

    const openBreak = rec._breaks.find((b) => !b.end_time);
    if (openBreak) throw new Error('هناك استراحة نشطة بالفعل');

    const breakSession = {
      id:                   _seedUUID(`break-${userId}-${Date.now()}`),
      attendance_record_id: rec.id,
      user_id:              userId,
      start_time:           now.toISOString(),
      end_time:             null,
      duration_minutes:     null,
      type:                 breakType,
      created_at:           now.toISOString(),
    };

    rec._breaks.push(breakSession);
    rec.status     = ATTENDANCE_STATUS.ON_BREAK;
    rec.updated_at = now.toISOString();

    _logEvent(rec, ATTENDANCE_EVENT_TYPE.BREAK_START, { breakType });
    _setMockRecord(rec);

    return { record: rec, breakSession };
  }

  // ── Supabase ──────────────────────────────────────────────
  const { data: rec, error: fetchErr } = await supabase
    .from(RECORDS_TABLE)
    .select('id, check_in_time, check_out_time, status')
    .eq('user_id', userId)
    .eq('date', date)
    .single();

  if (fetchErr) throw fetchErr;
  if (!rec.check_in_time) throw new Error('يجب تسجيل الدخول أولاً');
  if (rec.check_out_time) throw new Error('تم تسجيل الخروج مسبقاً');

  // Check no open break
  const { data: openBreaks } = await supabase
    .from(BREAKS_TABLE)
    .select('id')
    .eq('attendance_record_id', rec.id)
    .is('end_time', null);

  if (openBreaks?.length) throw new Error('هناك استراحة نشطة بالفعل');

  const { data: breakSession, error: breakErr } = await supabase
    .from(BREAKS_TABLE)
    .insert({
      attendance_record_id: rec.id,
      user_id:              userId,
      start_time:           now.toISOString(),
      type:                 breakType,
    })
    .select()
    .single();

  if (breakErr) throw breakErr;

  const { data: updated, error: updateErr } = await supabase
    .from(RECORDS_TABLE)
    .update({ status: ATTENDANCE_STATUS.ON_BREAK, updated_at: now.toISOString() })
    .eq('id', rec.id)
    .select()
    .single();

  if (updateErr) throw updateErr;

  await _persistEvent(rec.id, userId, ATTENDANCE_EVENT_TYPE.BREAK_START, { breakType });

  return { record: updated, breakSession };
}

// ── End Break ─────────────────────────────────────────────────

/**
 * End the active break session.
 *
 * @param {string} userId
 * @param {Date}   [now]
 * @returns {Promise<{ record: object, breakSession: object, durationMinutes: number }>}
 */
export async function endBreak(userId, now = new Date()) {
  const date = now.toISOString().slice(0, 10);

  // ── Mock ──────────────────────────────────────────────────
  if (USE_MOCK) {
    const rec = _mockRecord(userId, date);
    if (!rec) throw new Error('لا يوجد سجل حضور اليوم');

    const openBreak = rec._breaks.find((b) => !b.end_time);
    if (!openBreak) throw new Error('لا توجد استراحة نشطة');

    const durationMinutes = Math.round((now - new Date(openBreak.start_time)) / 60_000);
    openBreak.end_time         = now.toISOString();
    openBreak.duration_minutes = durationMinutes;

    // Back to present (or late if they were late)
    rec.status     = rec.late_by_minutes > 0 ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.PRESENT;
    rec.break_minutes = rec._breaks.reduce((a, b) => a + (b.duration_minutes ?? 0), 0);
    rec.updated_at = now.toISOString();

    _logEvent(rec, ATTENDANCE_EVENT_TYPE.BREAK_END, { durationMinutes });
    _setMockRecord(rec);

    return { record: rec, breakSession: openBreak, durationMinutes };
  }

  // ── Supabase ──────────────────────────────────────────────
  const { data: rec, error: fetchErr } = await supabase
    .from(RECORDS_TABLE)
    .select('id, late_by_minutes, break_minutes')
    .eq('user_id', userId)
    .eq('date', date)
    .single();

  if (fetchErr) throw fetchErr;

  const { data: openBreaks, error: bFetchErr } = await supabase
    .from(BREAKS_TABLE)
    .select('*')
    .eq('attendance_record_id', rec.id)
    .is('end_time', null)
    .limit(1);

  if (bFetchErr) throw bFetchErr;
  if (!openBreaks?.length) throw new Error('لا توجد استراحة نشطة');

  const openBreak       = openBreaks[0];
  const durationMinutes = Math.round((now - new Date(openBreak.start_time)) / 60_000);

  const { data: updatedBreak, error: breakErr } = await supabase
    .from(BREAKS_TABLE)
    .update({ end_time: now.toISOString(), duration_minutes: durationMinutes })
    .eq('id', openBreak.id)
    .select()
    .single();

  if (breakErr) throw breakErr;

  const newBreakTotal = (rec.break_minutes ?? 0) + durationMinutes;
  const nextStatus    = (rec.late_by_minutes ?? 0) > 0
    ? ATTENDANCE_STATUS.LATE
    : ATTENDANCE_STATUS.PRESENT;

  const { data: updated, error: updateErr } = await supabase
    .from(RECORDS_TABLE)
    .update({
      status:        nextStatus,
      break_minutes: newBreakTotal,
      updated_at:    now.toISOString(),
    })
    .eq('id', rec.id)
    .select()
    .single();

  if (updateErr) throw updateErr;

  await _persistEvent(rec.id, userId, ATTENDANCE_EVENT_TYPE.BREAK_END, { durationMinutes });

  return { record: updated, breakSession: updatedBreak, durationMinutes };
}

// ── Fetch today's record ───────────────────────────────────────

/**
 * Get the attendance record for a user for a given date.
 * Returns null if no record exists yet.
 *
 * @param {string} userId
 * @param {string} [date]  "YYYY-MM-DD", defaults to today
 * @returns {Promise<object|null>}
 */
export async function fetchTodayRecord(userId, date = _today()) {
  if (USE_MOCK) return _mockRecord(userId, date);

  const { data, error } = await supabase
    .from(RECORDS_TABLE)
    .select('*, break_sessions(*), attendance_events(*)')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ── Fetch team attendance ─────────────────────────────────────

/**
 * Get all team attendance records for a date.
 *
 * @param {string} [date]  "YYYY-MM-DD", defaults to today
 * @returns {Promise<object[]>}
 */
export async function fetchTeamAttendance(date = _today()) {
  if (USE_MOCK) {
    // Return all records for this date from mock store
    return Object.values(_mockStore)
      .filter((v) => v && typeof v === 'object' && v.date === date);
  }

  const { data, error } = await supabase
    .from(RECORDS_TABLE)
    .select('*, break_sessions(*)')
    .eq('date', date)
    .order('check_in_time', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}

// ── Detect absent / late employees ───────────────────────────

/**
 * Find employees who have not checked in within the absence threshold.
 *
 * Operates only in mock mode on the demo team.
 * In production this would query all assigned employees for a shift.
 *
 * @param {object} shift
 * @param {Date}   [now]
 * @returns {Promise<{ absent: string[], notYetLate: string[] }>}
 *   userId arrays
 */
export async function detectLateEmployees(shift, now = new Date()) {
  const date = now.toISOString().slice(0, 10);

  // Compute key thresholds
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const shiftStart = new Date(now);
  shiftStart.setHours(sh, sm, 0, 0);

  const graceEnd   = new Date(shiftStart.getTime() + shift.grace_minutes * 60_000);
  const absentMark = new Date(shiftStart.getTime() + ABSENT_DETECTION_MINUTES * 60_000);

  if (USE_MOCK) {
    const records = await fetchTeamAttendance(date);
    const checkedInIds = new Set(records.filter((r) => r.check_in_time).map((r) => r.user_id));

    const absent     = [];
    const notYetLate = [];

    DEMO_TEAM.forEach(({ id }) => {
      if (checkedInIds.has(id)) return;
      if (now >= absentMark) {
        absent.push(id);
      } else if (now >= graceEnd) {
        notYetLate.push(id);
      }
    });

    return { absent, notYetLate };
  }

  // Supabase: query all users for this shift who have not checked in
  const { data: records, error } = await supabase
    .from(RECORDS_TABLE)
    .select('user_id, check_in_time')
    .eq('date', date)
    .eq('shift_id', shift.id);

  if (error) throw error;

  const checkedInIds = new Set((records ?? []).filter((r) => r.check_in_time).map((r) => r.user_id));

  // We don't have a "user roster" in this service — return checked-in IDs
  // and let the consumer cross-reference with their user list.
  return { checkedInIds: [...checkedInIds], thresholdPassed: now >= graceEnd, absentMarkPassed: now >= absentMark };
}

// ── Manual override (manager) ─────────────────────────────────

/**
 * Manually update an attendance record (manager use).
 *
 * @param {string} recordId
 * @param {object} patch  Partial attendance_record fields
 * @param {string} [actorId]  Manager performing the update
 * @returns {Promise<object>} updated record
 */
export async function manualUpdateRecord(recordId, patch, actorId = null) {
  if (USE_MOCK) {
    const rec = Object.values(_mockStore).find((r) => r && r.id === recordId);
    if (!rec) throw new Error('السجل غير موجود');

    Object.assign(rec, patch, { updated_at: new Date().toISOString() });
    _logEvent(rec, ATTENDANCE_EVENT_TYPE.MANUAL_UPDATE, { patch, actorId });
    _setMockRecord(rec);
    return rec;
  }

  const { data, error } = await supabase
    .from(RECORDS_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', recordId)
    .select()
    .single();

  if (error) throw error;

  await _persistEvent(recordId, data.user_id, ATTENDANCE_EVENT_TYPE.MANUAL_UPDATE, { patch, actorId });

  return data;
}

// ── Clear mock data (dev utility) ────────────────────────────

/** Wipe all mock records and re-seed demo team. */
export function clearMockData() {
  _mockStore = {};
  localStorage.removeItem(MOCK_STORAGE_KEY);
  _seedDemoTeam();
}
