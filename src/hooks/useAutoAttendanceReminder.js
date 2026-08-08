// =============================================================
// useAutoAttendanceReminder
// Runs once per session for ALL roles.
// After 90s, checks if user hasn't checked in today.
// Sends an in-app notification + toast reminder.
// Dedup: one reminder per user per calendar day.
//
// ⚠️ إصلاح 9 آب 2026: كان يرسل بلا أي اعتبار لوقت الدوام الفعلي — بلاغ مالك
// حي (سجل حقيقي 21:12 UTC ≈ منتصف الليل بتوقيت اسطنبول): "كل شخص عم يسجل
// بروفايله إيمتى بيبدأ دوامه — بدي الإشعار بس لما يتأخر عن هالوقت، مش خارج
// أوقات دوامه ولا بعطلته". profiles.work_start و profiles.rest_day موجودين
// أصلاً (نفس الحقول يلي شاشة /admin/users تعدّلها) — صار الفحص يستخدمهم
// فعلياً بدل نافذة زمنية عامة موحّدة للجميع.
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

const REST_DAY_INDEX = { 'الأحد': 0, 'الاثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3, 'الخميس': 4, 'الجمعة': 5, 'السبت': 6 };
const LATE_GRACE_MINUTES = 30; // فترة سماح بعد بداية الدوام قبل ما نعتبره "تأخّر"
const LATEST_REMINDER_HOUR = 20; // ما نزعج بعد 8 مساءً حتى لو دوامه أبكر (نافذة أمان إضافية)

async function checkAttendance(session) {
  try {
    const now = new Date();

    const { data: profile } = await supabase
      .from('profiles')
      .select('work_start, rest_day')
      .eq('id', session.id)
      .maybeSingle();

    // يوم راحته المحدَّد بالبروفايل — ما نرسل إشعار دوام إطلاقاً.
    if (profile?.rest_day && REST_DAY_INDEX[profile.rest_day] === now.getDay()) return;

    // بداية دوامه الفعلية من بروفايله (افتراضي 09:00 لو غير محدَّدة) + فترة سماح.
    const workStart = profile?.work_start || '09:00';
    const [wh, wm] = String(workStart).split(':').map(Number);
    const deadline = new Date(now);
    deadline.setHours(wh, (wm || 0) + LATE_GRACE_MINUTES, 0, 0);
    if (now < deadline) return; // لسا ما تأخر فعلياً عن دوامه

    if (now.getHours() >= LATEST_REMINDER_HOUR) return; // خارج نافذة معقولة لإزعاج أي حدا

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
