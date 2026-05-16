// =============================================================
// Attendance — AttendanceWidget
//
// Compact all-in-one card for the main app sidebar / home screen.
// Composes CheckInButton + ShiftStatusCard + BreakTimer.
//
// Initialises the store (loads data + wires realtime) on mount.
// =============================================================
import React from 'react';
import { useAttendanceInit, useAttendanceError, useClearAttendanceError } from '../hooks/useAttendance';
import CheckInButton   from './CheckInButton';
import ShiftStatusCard from './ShiftStatusCard';
import BreakTimer      from './BreakTimer';

/**
 * @param {object}  props
 * @param {string}  props.userId
 * @param {string}  [props.employeeName]
 * @param {string}  [props.className]
 */
export default function AttendanceWidget({ userId, employeeName, className = '' }) {
  // Boot the store once on mount
  useAttendanceInit(userId);

  const error      = useAttendanceError();
  const clearError = useClearAttendanceError();

  return (
    <div className={`flex flex-col gap-3 ${className}`}>

      {/* Global error banner */}
      {error && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          <span>{error}</span>
          <button
            onClick={clearError}
            className="text-red-400 hover:text-red-600 font-bold ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Shift info */}
      <ShiftStatusCard />

      {/* Check-in / out */}
      <CheckInButton userId={userId} employeeName={employeeName} />

      {/* Break management */}
      <BreakTimer userId={userId} />
    </div>
  );
}
