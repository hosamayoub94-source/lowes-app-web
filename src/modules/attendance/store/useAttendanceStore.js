// =============================================================
// Attendance Module — Zustand Store
//
// Single source of truth for:
//   • Current user's today-record + active break session
//   • Team-wide attendance board (all records for today)
//   • Available shifts
//   • Loading / error states
//   • Realtime subscription management
//
// Design rules:
//   - Store holds plain data, zero business logic.
//   - All writes go through the service layer first, then
//     call the appropriate store action to mirror the result.
//   - Realtime patches the store without re-fetching everything.
// =============================================================
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { supabase }              from '@services/supabase';
import {
  fetchTodayRecord,
  fetchTeamAttendance,
  checkIn   as svcCheckIn,
  checkOut  as svcCheckOut,
  startBreak as svcStartBreak,
  endBreak   as svcEndBreak,
  USE_MOCK,
} from '../services/attendanceService';
import { fetchShifts } from '../services/shiftService';
import { ATTENDANCE_STATUS } from '../types/attendance.types';

// ── Store ─────────────────────────────────────────────────────

const useAttendanceStore = create()(
  subscribeWithSelector((set, get) => ({

    // ── State ─────────────────────────────────────────────────

    /** Attendance record for the current user today (or null) */
    myRecord: null,

    /** Active break session object (or null) */
    activeBreak: null,

    /** All records for today (team board) */
    teamRecords: [],

    /** All active shifts fetched from DB / DEFAULT_SHIFTS */
    shifts: [],

    /** True while any async operation is running */
    loading: false,

    /** Error message string or null */
    error: null,

    /** Realtime channel reference (Supabase only) */
    _realtimeChannel: null,

    // ── Setters used internally ───────────────────────────────

    _setMyRecord(record) {
      const activeBreak = record?._breaks
        ? record._breaks.find((b) => !b.end_time) ?? null
        : null;
      set({ myRecord: record, activeBreak });
    },

    _patchMyRecord(patch) {
      const prev = get().myRecord;
      if (!prev) return;
      const next = { ...prev, ...patch };
      get()._setMyRecord(next);
    },

    _setTeamRecord(record) {
      set((state) => {
        const idx = state.teamRecords.findIndex(
          (r) => r.user_id === record.user_id && r.date === record.date,
        );
        if (idx === -1) {
          return { teamRecords: [...state.teamRecords, record] };
        }
        const next = [...state.teamRecords];
        next[idx] = { ...next[idx], ...record };
        return { teamRecords: next };
      });
    },

    // ── Load initial data ─────────────────────────────────────

    /**
     * Load current user's record + team board + shifts.
     * Called once on mount from the dashboard / widget.
     *
     * @param {string} userId  Current authenticated user ID
     * @param {string} [date]  Defaults to today
     */
    async loadAttendance(userId, date) {
      set({ loading: true, error: null });
      try {
        const [myRecord, teamRecords, shifts] = await Promise.all([
          fetchTodayRecord(userId, date),
          fetchTeamAttendance(date),
          fetchShifts(),
        ]);

        const activeBreak = myRecord?._breaks
          ? myRecord._breaks.find((b) => !b.end_time) ?? null
          : (myRecord?.break_sessions ?? []).find((b) => !b.end_time) ?? null;

        set({ myRecord, activeBreak, teamRecords, shifts, loading: false });
      } catch (err) {
        set({ error: err.message, loading: false });
      }
    },

    // ── Check-in ──────────────────────────────────────────────

    /**
     * @param {string} userId
     * @param {object} [opts]  forwarded to attendanceService.checkIn
     * @returns {Promise<{ lateByMinutes: number, shift: object }>}
     */
    async checkIn(userId, opts = {}) {
      set({ loading: true, error: null });
      try {
        const { record, lateByMinutes, shift } = await svcCheckIn(userId, opts);
        get()._setMyRecord(record);
        get()._setTeamRecord(record);
        set({ loading: false });
        return { lateByMinutes, shift };
      } catch (err) {
        set({ error: err.message, loading: false });
        throw err;
      }
    },

    // ── Check-out ─────────────────────────────────────────────

    /**
     * @param {string} userId
     * @param {object} [opts]
     * @returns {Promise<{ workedMinutes: number, overtimeMinutes: number }>}
     */
    async checkOut(userId, opts = {}) {
      set({ loading: true, error: null });
      try {
        const { record, workedMinutes, overtimeMinutes, shift } = await svcCheckOut(userId, opts);
        get()._setMyRecord(record);
        get()._setTeamRecord(record);
        set({ loading: false });
        return { workedMinutes, overtimeMinutes, shift };
      } catch (err) {
        set({ error: err.message, loading: false });
        throw err;
      }
    },

    // ── Start break ───────────────────────────────────────────

    /**
     * @param {string} userId
     * @param {string} [breakType]
     */
    async startBreak(userId, breakType) {
      set({ loading: true, error: null });
      try {
        const { record, breakSession } = await svcStartBreak(userId, breakType);
        get()._setMyRecord(record);
        get()._setTeamRecord(record);
        set({ activeBreak: breakSession, loading: false });
        return breakSession;
      } catch (err) {
        set({ error: err.message, loading: false });
        throw err;
      }
    },

    // ── End break ─────────────────────────────────────────────

    /**
     * @param {string} userId
     * @returns {Promise<{ durationMinutes: number }>}
     */
    async endBreak(userId) {
      set({ loading: true, error: null });
      try {
        const { record, breakSession, durationMinutes } = await svcEndBreak(userId);
        get()._setMyRecord(record);
        get()._setTeamRecord(record);
        set({ activeBreak: null, loading: false });
        return { durationMinutes, breakSession };
      } catch (err) {
        set({ error: err.message, loading: false });
        throw err;
      }
    },

    // ── Realtime ──────────────────────────────────────────────

    /**
     * Subscribe to Supabase realtime for attendance_records.
     * No-op in mock mode (mock data mutates synchronously via service).
     *
     * @param {string} [filterUserId]  If provided, filter to one user's record.
     */
    subscribeRealtime(filterUserId) {
      if (USE_MOCK) return; // mock updates are synchronous — no subscription needed
      if (get()._realtimeChannel) return; // already subscribed

      const channel = supabase
        .channel('attendance_realtime')
        .on(
          'postgres_changes',
          {
            event:  '*',
            schema: 'public',
            table:  'attendance_records',
            ...(filterUserId ? { filter: `user_id=eq.${filterUserId}` } : {}),
          },
          (payload) => {
            const record = payload.new ?? payload.old;
            if (!record) return;

            // Mirror into my record if it's mine
            if (filterUserId && record.user_id === filterUserId) {
              get()._setMyRecord(record);
            }

            // Mirror into team board
            get()._setTeamRecord(record);
          },
        )
        .subscribe();

      set({ _realtimeChannel: channel });
    },

    /** Unsubscribe and clean up the realtime channel. */
    unsubscribeRealtime() {
      const ch = get()._realtimeChannel;
      if (ch) {
        supabase.removeChannel(ch);
        set({ _realtimeChannel: null });
      }
    },

    // ── Misc helpers ──────────────────────────────────────────

    clearError() {
      set({ error: null });
    },

    /** Refresh the team board (pull latest snapshot). */
    async refreshTeam(date) {
      try {
        const teamRecords = await fetchTeamAttendance(date);
        set({ teamRecords });
      } catch (err) {
        set({ error: err.message });
      }
    },

    // ── Computed selectors (used by hooks) ────────────────────

    /** Quick stats derived from teamRecords. */
    getTeamStats() {
      const records = get().teamRecords;
      const total   = records.length;
      return {
        total,
        present:    records.filter((r) => r.status === ATTENDANCE_STATUS.PRESENT).length,
        late:       records.filter((r) => r.status === ATTENDANCE_STATUS.LATE).length,
        absent:     records.filter((r) => r.status === ATTENDANCE_STATUS.ABSENT).length,
        onBreak:    records.filter((r) => r.status === ATTENDANCE_STATUS.ON_BREAK).length,
        checkedOut: records.filter((r) => r.status === ATTENDANCE_STATUS.CHECKED_OUT).length,
        pending:    records.filter((r) => r.status === ATTENDANCE_STATUS.PENDING).length,
        attendanceRate: total
          ? Math.round(
              (records.filter(
                (r) => r.check_in_time &&
                  r.status !== ATTENDANCE_STATUS.ABSENT
              ).length / total) * 100,
            )
          : 0,
      };
    },
  })),
);

export default useAttendanceStore;
