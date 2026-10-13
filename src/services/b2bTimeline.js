// سجل مبسّط لجهة B2B من الطوابع الموجودة فعلاً (ليس سجل تدقيق كاملاً — ذاك يحتاج جدولاً مقترحاً). منطق نقي.
export const STATUS_AR = { not_contacted: 'لم يُتَّصل', contacted: 'تم التواصل', interested: 'مهتم', not_interested: 'غير مهتم', customer: 'عميل' };

export function timelineOf(lead) {
  const ev = [];
  if (lead.discovered_at) ev.push({ at: lead.discovered_at, t: `اكتُشفت${lead.discovery_source ? ` (${lead.discovery_source})` : ''}` });
  if (lead.created_at && lead.added_manually) ev.push({ at: lead.created_at, t: `أضافها ${lead.added_by || 'الفريق'} يدوياً` });
  if (lead.last_verified_at) ev.push({ at: lead.last_verified_at, t: 'آخر تحقق من البيانات' });
  if (lead.status_updated_at) ev.push({ at: lead.status_updated_at, t: `حالة التواصل: ${STATUS_AR[lead.status] || lead.status}${lead.status_updated_by ? ` — ${lead.status_updated_by}` : ''}` });
  if (lead.presence_updated_at) ev.push({ at: lead.presence_updated_at, t: `تواجد Lowe's: ${lead.lowes_presence}${lead.presence_updated_by ? ` — ${lead.presence_updated_by}` : ''}` });
  return ev.sort((a, b) => new Date(b.at) - new Date(a.at));
}
