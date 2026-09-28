// =============================================================
// Tasks Module — موعد التسليم الفعلي (مصدر واحد للحساب).
// عمود due_date من نوع timestamptz ويُخزَّن فيه التاريخ وحده (منتصف
// الليل UTC)، فالمقارنة المباشرة بـnew Date(due_date) كانت تجعل المهمة
// «متأخرة» الساعة 3 فجراً بتوقيت تركيا/سوريا بنفس يوم التسليم.
// هنا نقرأ جزء التاريخ فقط كتاريخ تقويمي محلي، ثم نضيف due_time إن
// وُجد، وإلا نهاية اليوم (23:59:59) — نفس منطق حساب النقاط.
// بلا أي imports حتى يستعملها task.types وtaskUtils بلا دوران.
// =============================================================

/** 'YYYY-MM-DD' من أي قيمة due_date/start_date (نص تاريخ أو ISO كامل). */
export function datePart(value) {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Date محلي لبداية اليوم التقويمي. */
export function localDayStart(value) {
  const d = datePart(value);
  if (!d) return null;
  const [y, mo, da] = d.split('-').map(Number);
  return new Date(y, mo - 1, da, 0, 0, 0, 0);
}

/**
 * موعد التسليم الفعلي كـDate محلي:
 * التاريخ + due_time (HH:MM) إن وُجد، وإلا نهاية اليوم 23:59:59.
 */
export function taskDeadline(task) {
  const day = localDayStart(task?.due_date);
  if (!day) return null;
  const t = String(task?.due_time || '').match(/^(\d{1,2}):(\d{2})/);
  if (t) {
    day.setHours(Number(t[1]), Number(t[2]), 0, 0);
  } else {
    day.setHours(23, 59, 59, 0);
  }
  return day;
}
