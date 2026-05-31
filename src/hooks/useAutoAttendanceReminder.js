// =============================================================
// useAutoAttendanceReminder
// Runs once per session for ALL roles.
// After 90s, checks if user hasn't checked in today.
// Sends an in-app notification + toast reminder.
// Dedup: one reminder per user per calendar day.
// =============================================================
import { useEffect, useRef } from 'react';
import { supabase }          from '@services/supabase';
import { useAuthStore }      from '@stores/authStore';
import { sendNotification }  from '@modules/notifications/services/notificationService';
import { NOTIFICATION_TYPE } from '@modules/notifications/types/notification.types';

function todaySlash() {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

async function checkAttendance(session) {
  try {
    const { data } = await supabase
      .from('attendance')
      .select('id')
      .eq('employee_name', session.name)
      .eq('date', todaySlash())
      .eq('type', 'in')
      .maybeSingle();

    if (data) return; // already checked in

    await sendNotification({
      userId:   session.id,
      type:     NOTIFICATION_TYPE.ATTENDANCE_ALERT,
      title:    '⏰ لم تسجّل حضورك اليوم!',
      message:  'اذهب إلى شاشة الحضور وسجّل دخولك الآن',
      severity: 'warning',
      entityId: 'auto_att_reminder',
    });
  } catch {
    // silent
  }
}

export function useAutoAttendanceReminder() {
  const session  = useAuthStore((s) => s.session);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!session?.id || !session?.name || firedRef.current) return;
    firedRef.current = true;
    // Wait 90s so user has time to check in naturally on arrival
    const t = setTimeout(() => checkAttendance(session), 90_000);
    return () => clearTimeout(t);
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
