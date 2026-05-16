// =============================================================
// useCountdown — live countdown label that updates every minute.
// Returns a human-readable Arabic string and a severity level.
// =============================================================

import { useState, useEffect, useMemo } from 'react';
import { countdownLabel, dueDateColorClass } from '../utils/taskUtils';

/**
 * @param {string|null} dueDate  – ISO date string (YYYY-MM-DD)
 * @param {string} status        – task status
 * @returns {{ label: string|null, colorClass: string }}
 */
export function useCountdown(dueDate, status) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!dueDate) return;
    // Refresh label every 60 seconds
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [dueDate]);

  return useMemo(
    () => ({
      label:      countdownLabel(dueDate),
      colorClass: dueDateColorClass(dueDate, status),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dueDate, status, tick],
  );
}

export default useCountdown;
