// b2bLeadsApi — ليدز B2B حسب الدولة (D-119).
// سوريا (SY): نفس المسار المباشر القديم بـsyriaLeadsService بلا أي تغيير.
// أي دولة أخرى (الإمارات AE…): عبر Edge Function `b2b-leads` فقط — القراءة والكتابة والاستيراد،
// والصلاحية تُفحص على الخادم من جلسة المستخدم (لا من المتصفح).
import { supabase } from '@services/supabase';
import { COUNTRIES } from '../../supabase/functions/_shared/countries.js';
import { listLeads, updateLeadStatus, updateLeadPresence, createLead } from '@services/syriaLeadsService';

export async function callB2b(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('b2b-leads', { body: { action, ...payload } });
  if (error) {
    let body = null;
    try { body = await error.context.clone().json(); } catch { /* not json */ }
    const st = error.context?.status;
    if (st === 401) return { ok: false, error: 'جلستك بلا هوية حقيقية — سجّل خروج ثم ادخل بالـPIN.' };
    if (st === 403) return { ok: false, error: body?.message || 'ما عندك صلاحية لهالإجراء — اطلبها من الأدمن (إدارة المستخدمين).' };
    if (body?.error === 'migration_required') return { ok: false, error: body.message || 'قسم الدول الجديد بانتظار تطبيق migration.' };
    if (body?.error === 'duplicate') return { ok: false, error: body.message || 'موجود مسبقاً' };
    if (st === 404 && !body) return { ok: false, error: 'خدمة ليدز الدول غير منشورة بعد.' };
    return body && body.ok === false ? { ok: false, error: body.message || body.error } : { ok: false, error: error.message };
  }
  return data;
}

const unwrap = (res) => { if (!res?.ok) throw new Error(res?.error || 'تعذّر الاتصال'); return res; };

/** One interface for the screen, whatever the country. */
export function leadsApiFor(code) {
  if (COUNTRIES[code]?.legacyDirect) {
    return {
      list: listLeads,
      updateStatus: (id, fields, by) => updateLeadStatus(id, fields, by),
      updatePresence: (id, fields, by) => updateLeadPresence(id, fields, by),
      create: (form, by) => createLead(form, by),
    };
  }
  return {
    list: async () => unwrap(await callB2b('list', { country: code })).rows,
    updateStatus: async (id, { status, notes }) => unwrap(await callB2b('update_status', { country: code, id, status, notes })).row,
    updatePresence: async (id, { lowes_presence, lowes_listing_url }) =>
      unwrap(await callB2b('update_presence', { country: code, id, lowes_presence, lowes_listing_url })).row,
    create: async (form) => unwrap(await callB2b('add', { country: code, row: form })).row,
  };
}
