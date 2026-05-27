// =============================================================
// useMyAttendanceToday — lightweight hook for today's attendance
//
// Queries the real `attendance` table directly:
//   - date format: "YYYY/MM/DD"
//   - two rows per day: type="in" + type="out"
//   - time stored in `time_in` column (HH:MM)
//
// Returns:
//   { checkedIn, checkedOut, timeIn, timeOut, loading }
//
// Used by: AttendanceWidget, SmartSuggestions, useWorkspace,
//           useQuickActions — replacing the broken useAttendanceStore
// =============================================================
import { useState, useEffect } from 'react';
import { useAuth }   from '@hooks/useAuth';
import { supabase }  from '@services/supabase';
import { todaySlash } from '@utils/date';

export function useMyAttendanceToday() {
  const { name: employeeName } = useAuth();

  const [state, setState] = useState({
    checkedIn:  false,
    checkedOut: false,
    timeIn:     null,   // "HH:MM"
    timeOut:    null,   // "HH:MM"
    loading:    true,
  });

  useEffect(() => {
    if (!employeeName) {
      setState(s => ({ ...s, loading: false }));
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const { data } = await supabase
          .from('attendance')
          .select('type, time_in')
          .eq('employee_name', employeeName)
          .eq('date', todaySlash())
          .in('type', ['in', 'out']);

        if (cancelled) return;

        const inRow  = data?.find(r => r.type === 'in');
        const outRow = data?.find(r => r.type === 'out');

        setState({
          checkedIn:  !!inRow,
          checkedOut: !!outRow,
          timeIn:     inRow?.time_in  ?? null,
          timeOut:    outRow?.time_in ?? null,
          loading:    false,
        });
      } catch {
        if (!cancelled) setState(s => ({ ...s, loading: false }));
      }
    }

    load();

    // Refresh every 60 seconds so widget stays current
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [employeeName]);

  return state;
}
