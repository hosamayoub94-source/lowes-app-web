// =============================================================
// useKpiMonthReminder
// Fires once per session for managers/admins only.
// • Days 1-5 of a new month → check how many employees have no
//   KPI data for last month → send one summary notification.
// • Dedup key: one per manager per month.
// =============================================================
import { useEffect, useRef } from 'react';
import { supabase }          from '@services/supabase';
import { useAuthStore }      from '@stores/authStore';
import { sendNotification }  from '@modules/notifications/services/notificationService';
import { NOTIFICATION_TYPE } from '@modules/notifications/types/notification.types';
import { ROLES }             from '@data/teams';

const MGMT_ROLES = new Set([ROLES.MANAGER, ROLES.ADMIN, ROLES.SALES_MANAGER]);
const MONTHS_AR  = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                    'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

async function runKpiCheck(session) {
  try {
    const now  = new Date();
    const day  = now.getDate();
    // Only run on days 1–5 of the month
    if (day > 5) return;

    // Last month
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lYear  = lastMonth.getFullYear();
    const lMonth = lastMonth.getMonth() + 1;

    const [{ data: emps }, { data: kpis }] = await Promise.all([
      supabase.from('profiles').select('id').eq('is_active', true),
      supabase.from('employee_kpis').select('employee_id').eq('year', lYear).eq('month', lMonth),
    ]);

    const totalEmps   = (emps ?? []).length;
    const enteredIds  = new Set((kpis ?? []).map(k => k.employee_id));
    const missing     = totalEmps - enteredIds.size;

    if (missing <= 0) return;

    await sendNotification({
      userId:   session.id,
      type:     NOTIFICATION_TYPE.SYSTEM_ALERT,
      title:    `📊 ${missing} موظف بدون KPI — ${MONTHS_AR[lMonth - 1]} ${lYear}`,
      message:  'يرجى إدخال بيانات الأداء للشهر الماضي من شاشة الأداء والعمولات',
      severity: 'warning',
      entityId: `kpi_reminder_${lYear}_${lMonth}`,
      metadata: { missing, year: lYear, month: lMonth },
    });
  } catch {
    // silent
  }
}

export function useKpiMonthReminder() {
  const session  = useAuthStore((s) => s.session);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!session?.id || firedRef.current) return;
    if (!MGMT_ROLES.has(session.role)) return;
    firedRef.current = true;
    const t = setTimeout(() => runKpiCheck(session), 5000);
    return () => clearTimeout(t);
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
