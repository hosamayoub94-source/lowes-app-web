// =============================================================
// Attendance — BreakTimer
//
// Shows when the user is ON_BREAK:
//   • Live elapsed counter (ticks every second)
//   • Break type selector
//   • "إنهاء الاستراحة" button
//
// Shows break buttons when user is PRESENT/LATE:
//   • Quick buttons per break type
// =============================================================
import React, { useState, useEffect, useRef } from 'react';
import {
  useIsCheckedIn,
  useIsOnBreak,
  useIsCheckedOut,
  useActiveBreak,
  useStartBreak,
  useEndBreak,
  useAttendanceLoading,
} from '../hooks/useAttendance';
import { BREAK_TYPE, BREAK_TYPE_LABELS } from '../types/attendance.types';

const BREAK_ICONS = {
  [BREAK_TYPE.REGULAR]:  '☕',
  [BREAK_TYPE.LUNCH]:    '🍽',
  [BREAK_TYPE.PRAYER]:   '🕌',
  [BREAK_TYPE.PERSONAL]: '👤',
};

function formatElapsed(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * @param {object}  props
 * @param {string}  props.userId
 * @param {string}  [props.className]
 */
export default function BreakTimer({ userId, className = '' }) {
  const isCheckedIn  = useIsCheckedIn();
  const isOnBreak    = useIsOnBreak();
  const isCheckedOut = useIsCheckedOut();
  const activeBreak  = useActiveBreak();
  const loading      = useAttendanceLoading();
  const startBreak   = useStartBreak();
  const endBreak     = useEndBreak();

  const [elapsed, setElapsed]   = useState(0);
  const [feedback, setFeedback] = useState(null);
  const intervalRef             = useRef(null);

  // ── Live timer ─────────────────────────────────────────────
  useEffect(() => {
    if (isOnBreak && activeBreak?.start_time) {
      const calc = () =>
        Math.floor((Date.now() - new Date(activeBreak.start_time)) / 1000);
      setElapsed(calc());
      intervalRef.current = setInterval(() => setElapsed(calc()), 1000);
    } else {
      setElapsed(0);
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isOnBreak, activeBreak?.start_time]);

  const _flash = (text, type = 'success') => {
    setFeedback({ text, type });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleStart = async (breakType) => {
    try {
      await startBreak(userId, breakType);
      _flash(`بدأت استراحة ${BREAK_TYPE_LABELS[breakType]}`, 'info');
    } catch (err) {
      _flash(err.message, 'error');
    }
  };

  const handleEnd = async () => {
    try {
      const { durationMinutes } = await endBreak(userId);
      _flash(`انتهت الاستراحة — المدة: ${durationMinutes} د`);
    } catch (err) {
      _flash(err.message, 'error');
    }
  };

  // Not relevant
  if (!isCheckedIn || isCheckedOut) return null;

  const feedbackColors = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    info:    'bg-sky-50 text-sky-700 border-sky-200',
    error:   'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 p-5 ${className}`}>
      <p className="text-xs font-semibold text-slate-400 uppercase mb-3">الاستراحات</p>

      {isOnBreak ? (
        /* ── Active break state ──────────────────────── */
        <div className="flex flex-col items-center gap-4">
          <div className="text-center">
            <p className="text-sm text-slate-500 mb-1">
              {BREAK_ICONS[activeBreak?.type] ?? '⏸'}&nbsp;
              {BREAK_TYPE_LABELS[activeBreak?.type] ?? 'استراحة'}
            </p>
            <p
              className="text-4xl font-mono font-bold text-sky-600"
              dir="ltr"
            >
              {formatElapsed(elapsed)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {elapsed >= 60
                ? `${Math.floor(elapsed / 60)} دقيقة و${elapsed % 60} ثانية`
                : `${elapsed} ثانية`}
            </p>
          </div>

          <button
            onClick={handleEnd}
            disabled={loading}
            className="
              w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-600
              text-white font-semibold text-sm transition-colors
              disabled:opacity-60 flex items-center justify-center gap-2
            "
          >
            {loading
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : '▶'
            }
            إنهاء الاستراحة
          </button>
        </div>
      ) : (
        /* ── Break type selection ──────────────────────── */
        <div className="grid grid-cols-2 gap-2">
          {Object.values(BREAK_TYPE).map((type) => (
            <button
              key={type}
              onClick={() => handleStart(type)}
              disabled={loading}
              className="
                flex items-center gap-2 px-3 py-2 rounded-xl
                border border-slate-200 text-slate-600 text-sm
                hover:bg-slate-50 hover:border-slate-300
                transition-colors disabled:opacity-50
              "
            >
              <span>{BREAK_ICONS[type]}</span>
              {BREAK_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      )}

      {feedback && (
        <div
          className={`mt-3 text-xs px-3 py-2 rounded-lg border ${feedbackColors[feedback.type] ?? feedbackColors.success}`}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
}
