// b2bLeadsApi — ليدز B2B حسب الدولة (D-119).
// سوريا (SY): نفس المسار المباشر القديم بـsyriaLeadsService بلا أي تغيير بالسلوك.
// أي دولة أخرى (الإمارات AE…): عبر Edge Function `b2b-leads` فقط — القراءة والكتابة والاستيراد،
// والصلاحية تُفحص على الخادم من جلسة المستخدم (لا من المتصفح).
// كل نداء له timeout، وكل فشل يُصنَّف (جلسة/صلاحية/غير منشورة/migration/اتصال/timeout) عبر b2bErrors — لا نصوص تقنية للمستخدم.
import { supabase } from '@services/supabase';
import { COUNTRIES } from '../../supabase/functions/_shared/countries.js';
import { listLeads, updateLeadStatus, updateLeadPresence, createLead } from '@services/syriaLeadsService';
import { B2bError, classifyB2bFailure, toB2bError, withTimeout, logB2bError, LOAD_TIMEOUT_MS } from '@services/b2bErrors';

const fail = (err, extra = {}) => ({ ok: false, error: err.message, kind: err.kind, status: err.status ?? null, ...extra });

export async function callB2b(action, payload = {}, { timeoutMs = LOAD_TIMEOUT_MS } = {}) {
  let res;
  try {
    res = await withTimeout(supabase.functions.invoke('b2b-leads', { body: { action, ...payload } }), timeoutMs, action);
  } catch (e) {
    const err = toB2bError(e, action);
    logB2bError(err, action);
    return fail(err);
  }
  const { data, error } = res;
  if (!error) return data;
  let body = null;
  try { body = await error.context.clone().json(); } catch { /* not json */ }
  const status = error.context?.status ?? null;
  const code = typeof body?.error === 'string' ? body.error : null;
  // business answers the UI shows as-is (not load failures)
  if (code === 'duplicate') return { ok: false, error: body.message || 'موجود مسبقاً', code, status };
  const kind = classifyB2bFailure({ status, code, network: error.name === 'FunctionsFetchError' });
  // the server's own Arabic text is more specific for permission refusals ("ما عندك صلاحية ليدز الإمارات")
  const message = kind === 'forbidden' && body?.message ? body.message : null;
  const err = new B2bError(kind, { status, action, detail: code, message });
  logB2bError(err, action);
  return fail(err, { code });
}

const unwrap = (res) => {
  if (res?.ok) return res;
  throw new B2bError(res?.kind || 'server', { status: res?.status ?? null, detail: res?.code ?? null, message: res?.error || null });
};

/**
 * استيراد دفعة بحث (أدمن فقط، الخادم يفحص). dryRun=true = معاينة بلا أي حفظ (الافتراضي).
 * يرجّع الرد كاملاً { ok, dry_run, inserted, summary, new, duplicate_existing, duplicate_in_file, invalid } أو يرمي B2bError.
 */
export async function importLeads(code, rows, dryRun = true, { sourceMode = null, fileName = null } = {}) {
  // sourceMode 'file' = ملف من الفريق: بلا إلزام مصدر/تاريخ، تدخل الصفوف «غير متحقق» (الخادم يفرض ذلك).
  const extra = sourceMode === 'file' ? { source_mode: 'file', file_name: fileName } : {};
  return unwrap(await callB2b('import', { country: code, rows, dry_run: dryRun !== false, ...extra }));
}

// Syria's direct path: bounded wait; load failures become friendly classified errors, write errors keep their own text.
const direct = (fn, action, { friendly = false } = {}) => async (...args) => {
  try { return await withTimeout(fn(...args), LOAD_TIMEOUT_MS, action); }
  catch (e) {
    if (e instanceof B2bError) { logB2bError(e, action); throw e; }
    if (friendly) { const err = toB2bError(e, action); logB2bError(err, action); throw err; }
    const err = toB2bError(e, action);
    if (err.kind === 'forbidden' && e?.message) { const own = new B2bError('forbidden', { status: err.status, action, message: e.message }); logB2bError(own, action); throw own; }  // نصّ الرفض المحدّد أوضح من العام
    if (err.kind === 'session' || err.kind === 'network') { logB2bError(err, action); throw err; }
    throw e;
  }
};

// بعد إغلاق الجدول على anon: جلسة يدوية (بلا JWT) تقرأ صفاً صفراً بلا خطأ — نكشف ذلك ونعرض «انتهت جلستك» بدل «لا بيانات».
async function hasRealSession() {
  try {
    const { data } = await withTimeout(supabase.auth.getSession(), 8000, 'session');
    return !!data?.session;
  } catch { return true; /* لا نحكم على الجلسة إن تعذّر فحصها (تجنّباً لرسالة خاطئة) */ }
}
const listWithSessionCheck = async () => {
  const rows = await listLeads();
  if (rows.length === 0 && !(await hasRealSession())) throw new B2bError('session', { action: 'list' });
  return rows;
};

/** One interface for the screen, whatever the country. */
export function leadsApiFor(code) {
  if (COUNTRIES[code]?.legacyDirect) {
    return {
      list: direct(listWithSessionCheck, 'list', { friendly: true }),
      updateStatus: direct((id, fields, by) => updateLeadStatus(id, fields, by), 'update_status'),
      updatePresence: direct((id, fields, by) => updateLeadPresence(id, fields, by), 'update_presence'),
      updateMarketEntry: async (id, patch) => unwrap(await callB2b('update_market_entry', { country: code, id, patch })).row,
      create: direct((form, by) => createLead(form, by), 'add'),
    };
  }
  return {
    list: async () => unwrap(await callB2b('list', { country: code })).rows,
    updateStatus: async (id, { status, notes, assigned_to }) => unwrap(await callB2b('update_status', { country: code, id, status, notes, assigned_to })).row,
    updatePresence: async (id, { lowes_presence, lowes_listing_url }) =>
      unwrap(await callB2b('update_presence', { country: code, id, lowes_presence, lowes_listing_url })).row,
    updateMarketEntry: async (id, patch) => unwrap(await callB2b('update_market_entry', { country: code, id, patch })).row,
    create: async (form) => unwrap(await callB2b('add', { country: code, row: form })).row,
  };
}
