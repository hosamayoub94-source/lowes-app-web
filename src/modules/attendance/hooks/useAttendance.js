// =============================================================
// Attendance Module — React Hooks
//
// Thin selectors over useAttendanceStore so components
// subscribe only to the slice they need.
// =============================================================
import { useEffect, useCallback } from 'react';
import useAttendanceStore from '../store/useAttendanceStore';

// ── Primitive selectors ───────────────────────────────────────

/** My attendance record for today (or null). */
export function useMyRecord()    { return useAttendanceStore((s) => s.myRecord); }

/** Active break session (or null). */
export function useActiveBreak() { return useAttendanceStore((s) => s.activeBreak); }

/** Team attendance records array. */
export function useTeamRecords() { return useAttendanceStore((s) => s.teamRecords); }

/** All available shifts. */
export function useShifts()      { return useAttendanceStore((s) => s.shifts); }

/** True while any async operation is running. */
export function useAttendanceLoading() { return useAttendanceStore((s) => s.loading); }

/** Current error string or null. */
export function useAttendanceError()   { return useAttendanceStore((s) => s.error); }

// ── Derived / computed ─────────────────────────────────────────

/** Derived team statistics. */
export function useTeamStats() {
  return useAttendanceStore((s) => s.getTeamStats());
}

/**
 * Whether the current user has checked in today.
 * @returns {boolean}
 */
export function useIsCheckedIn() {
  return useAttendanceStore((s) => Boolean(s.myRecord?.check_in_time));
}

/**
 * Whether the current user has checked out today.
 * @returns {boolean}
 */
export function useIsCheckedOut() {
  return useAttendanceStore((s) =>
    s.myRecord?.status === 'checked_out',
  );
}

/**
 * Whether the current user is currently on a break.
 * @returns {boolean}
 */
export function useIsOnBreak() {
  return useAttendanceStore((s) =>
    s.myRecord?.status === 'on_break',
  );
}

/**
 * Current attendance status string or null.
 * @returns {string|null}
 */
export function useMyStatus() {
  return useAttendanceStore((s) => s.myRecord?.status ?? null);
}

/**
 * Minutes the user was late today (0 if on time).
 * @returns {number}
 */
export function useLateMinutes() {
  return useAttendanceStore((s) => s.myRecord?.late_by_minutes ?? 0);
}

/**
 * Worked minutes so far today.
 * @returns {number}
 */
export function useWorkedMinutes() {
  return useAttendanceStore((s) => s.myRecord?.worked_minutes ?? 0);
}

// ── Action hooks ──────────────────────────────────────────────

/** Returns the store's checkIn action. */
export function useCheckIn()    { return useAttendanceStore((s) => s.checkIn); }

/** Returns the store's checkOut action. */
export function useCheckOut()   { return useAttendanceStore((s) => s.checkOut); }

/** Returns the store's startBreak action. */
export function useStartBreak() { return useAttendanceStore((s) => s.startBreak); }

/** Returns the store's endBreak action. */
export function useEndBreak()   { return useAttendanceStore((s) => s.endBreak); }

/** Returns clearError action. */
export function useClearAttendanceError() {
  return useAttendanceStore((s) => s.clearError);
}

// ── Compound initialisation hook ──────────────────────────────

/**
 * Load attendance data + wire realtime on mount.
 * Intended to be called once from the top-level attendance page/widget.
 *
 * @param {string|null} userId  The authenticated user's ID (or null while loading auth)
 * @param {string}      [date]  "YYYY-MM-DD", defaults to today
 */
export function useAttendanceInit(userId, date) {
  const loadAttendance      = useAttendanceStore((s) => s.loadAttendance);
  const subscribeRealtime   = useAttendanceStore((s) => s.subscribeRealtime);
  const unsubscribeRealtime = useAttendanceStore((s) => s.unsubscribeRealtime);

  useEffect(() => {
    if (!userId) return;
    loadAttendance(userId, date);
    subscribeRealtime(userId);

    return () => {
      unsubscribeRealtime();
    };
  }, [userId, date]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Periodic refresh of the team board every `intervalMs` ms.
 * Use in the admin dashboard where you want live team status
 * without relying on realtime alone (good for mock mode too).
 *
 * @param {string} [date]
 * @param {number} [intervalMs]  Defaults to 60 000 (1 minute)
 */
export function useTeamRefresh(date, intervalMs = 60_000) {
  const refreshTeam = useAttendanceStore((s) => s.refreshTeam);

  const refresh = useCallback(() => refreshTeam(date), [date, refreshTeam]);

  useEffect(() => {
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return refresh; // expose manual trigger
}
