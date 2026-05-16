// =============================================================
// Attendance Module — Public API
//
// Import from here, never from sub-paths directly:
//   import { AttendanceWidget, useMyRecord } from '@modules/attendance'
// =============================================================

// ── Types & constants ─────────────────────────────────────────
export * from './types/attendance.types';

// ── Services ─────────────────────────────────────────────────
export {
  checkIn,
  checkOut,
  startBreak,
  endBreak,
  fetchTodayRecord,
  fetchTeamAttendance,
  detectLateEmployees,
  manualUpdateRecord,
  clearMockData,
  USE_MOCK as ATTENDANCE_USE_MOCK,
} from './services/attendanceService';

export {
  fetchShifts,
  fetchShiftById,
  getActiveShift,
  computeLateMinutes,
  computeWorkedMinutes,
  computeOvertimeMinutes,
  formatDuration,
  isAbsent,
} from './services/shiftService';

// ── Store ─────────────────────────────────────────────────────
export { default as useAttendanceStore } from './store/useAttendanceStore';

// ── Hooks ─────────────────────────────────────────────────────
export {
  useAttendanceInit,
  useMyRecord,
  useActiveBreak,
  useTeamRecords,
  useShifts,
  useAttendanceLoading,
  useAttendanceError,
  useTeamStats,
  useIsCheckedIn,
  useIsCheckedOut,
  useIsOnBreak,
  useMyStatus,
  useLateMinutes,
  useWorkedMinutes,
  useCheckIn,
  useCheckOut,
  useStartBreak,
  useEndBreak,
  useClearAttendanceError,
  useTeamRefresh,
} from './hooks/useAttendance';

// ── Integration ───────────────────────────────────────────────
export {
  bootAttendanceIntegration,
  teardownAttendanceIntegration,
  emitCheckIn,
  emitCheckOut,
  emitAbsent,
} from './integrations/attendanceEventBus';

// ── UI Components ─────────────────────────────────────────────
export { default as AttendanceWidget    } from './components/AttendanceWidget';
export { default as CheckInButton       } from './components/CheckInButton';
export { default as ShiftStatusCard     } from './components/ShiftStatusCard';
export { default as BreakTimer          } from './components/BreakTimer';
export { default as TeamAttendanceBoard } from './components/TeamAttendanceBoard';

// ── Pages ─────────────────────────────────────────────────────
export { default as AttendanceDashboard } from './pages/AttendanceDashboard';

// ── Dev tools ─────────────────────────────────────────────────
export { default as DevAttendanceMonitor } from './monitor/DevAttendanceMonitor';
