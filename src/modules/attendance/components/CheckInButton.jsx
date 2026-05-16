// =============================================================
// Attendance — CheckInButton
//
// Smart button that cycles through:
//   PENDING       → "تسجيل الدخول"
//   PRESENT/LATE  → "تسجيل الخروج"
//   ON_BREAK      → disabled (BreakTimer handles this)
//   CHECKED_OUT   → "انتهى الدوام" (disabled)
//
// Emits Event Bus events after each successful action.
// =============================================================
import React, { useState } from 'react';
import {
  useMyStatus,
  useIsCheckedIn,
  useIsCheckedOut,
  useIsOnBreak,
  useCheckIn,
  useCheckOut,
  useAttendanceLoading,
} from '../hooks/useAttendance';
import { ATTENDANCE_STATUS } from '../types/attendance.types';
import { emitCheckIn, emitCheckOut } from '../integrations/attendanceEventBus';

/**
 * @param {object}   props
 * @param {string}   props.userId          Authenticated user's ID
 * @param {string}   [props.employeeName]  For notification body
 * @param {string}   [props.className]
 */
export default function CheckInButton({ userId, employeeName, className = '' }) {
  const status      = useMyStatus();
  const isCheckedIn = useIsCheckedIn();
  const isCheckedOut = useIsCheckedOut();
  const isOnBreak   = useIsOnBreak();
  const loading     = useAttendanceLoading();
  const checkIn     = useCheckIn();
  const checkOut    = useCheckOut();

  const [feedback, setFeedback] = useState(null); // { text, type }

  const _flash = (text, type = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleClick = async () => {
    if (!userId || loading || isOnBreak || isCheckedOut) return;

    try {
      if (!isCheckedIn) {
        // ── Check in ──────────────────────────────────────
        const { lateByMinutes, shift } = await checkIn(userId, { source: 'web' });

        emitCheckIn({ userId, employeeName, lateByMinutes, shift });

        if (lateByMinutes > 0) {
          _flash(`تم تسجيل دخولك متأخراً بـ ${lateByMinutes} دقيقة`, 'warning');
        } else {
          _flash('تم تسجيل الدخول بنجاح ✓');
        }
      } else {
        // ── Check out ─────────────────────────────────────
        const { workedMinutes, overtimeMinutes } = await checkOut(userId, { source: 'web' });

        emitCheckOut({ userId, employeeName, workedMinutes, overtimeMinutes });

        const h = Math.floor(workedMinutes / 60);
        const m = String(workedMinutes % 60).padStart(2, '0');
        _flash(`انصرفت بعد ${h}:${m} ساعة عمل`);
      }
    } catch (err) {
      _flash(err.message, 'error');
    }
  };

  // ── Derive label + style ──────────────────────────────────
  let label   = 'تسجيل الدخول';
  let bgClass = 'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700';
  let disabled = loading;

  if (isCheckedOut) {
    label    = 'انتهى الدوام';
    bgClass  = 'bg-slate-400 cursor-not-allowed';
    disabled = true;
  } else if (isOnBreak) {
    label    = 'في استراحة';
    bgClass  = 'bg-sky-400 cursor-not-allowed';
    disabled = true;
  } else if (isCheckedIn) {
    label   = 'تسجيل الخروج';
    bgClass = 'bg-rose-500 hover:bg-rose-600 active:bg-rose-700';
  }

  const feedbackColors = {
    success: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    warning: 'bg-amber-100  text-amber-800  border-amber-300',
    error:   'bg-red-100    text-red-800    border-red-300',
  };

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`
          inline-flex items-center justify-center gap-2
          px-6 py-3 rounded-xl text-white font-semibold text-base
          transition-all duration-200 shadow-md select-none
          disabled:opacity-60 disabled:shadow-none
          ${bgClass}
        `}
      >
        {loading ? (
          <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <span>{isCheckedOut ? '🏁' : isOnBreak ? '☕' : isCheckedIn ? '🚪' : '👋'}</span>
        )}
        {label}
      </button>

      {feedback && (
        <div
          className={`
            text-sm px-4 py-2 rounded-lg border font-medium transition-all
            ${feedbackColors[feedback.type] ?? feedbackColors.success}
          `}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
}
