// creatorProspectsApi — باب الواجهة الوحيد لـ Edge Function `creator-prospects` (أدمن فقط).
// search: يطلب من الخادم (v2). إذا الدالة المنشورة ما زالت v1 (ما بتعرف `search`) نرجع لـ list + نفس منطق البحث بالمتصفح،
// فالشاشة الجديدة تشتغل قبل نشر الدالة. الكتابة على الحقول الجديدة تحتاج migration v2 (الخادم يرد migration_required).
import { supabase } from '@services/supabase';
import { searchCreators, V1_STATUS } from '../../supabase/functions/_shared/creatorMatch.js';

export async function call(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('creator-prospects', { body: { action, ...payload } });
  if (error) {
    let body = null;
    try { body = await error.context.clone().json(); } catch { /* not json */ }
    const st = error.context?.status;
    if (st === 401) return { ok: false, error: 'جلستك بلا هوية حقيقية — سجّل خروج ثم ادخل بالـPIN.' };
    if (st === 403) return { ok: false, error: 'هذا القسم للأدمن فقط.' };
    if (body?.error === 'migration_required') return { ok: false, error: 'migration_required', message: 'الحقول الجديدة (النوع، المحتوى، الحفظ…) تحتاج تطبيق migration v2 أولاً — بانتظار موافقة.' };
    return body && body.ok === false ? body : { ok: false, error: error.message };
  }
  return data;
}

let mode = null; // 'server' | 'client'
let cache = null; // client-fallback rows: { deleted:boolean, rows:[] }
export const invalidate = () => { cache = null; };

export async function searchProspects({ q = '', filters = {}, sort = 'best', page = 1, pageSize = 30, includeDeleted = false } = {}) {
  if (mode !== 'client') {
    const res = await call('search', { q, filters, sort, page, page_size: pageSize, include_deleted: includeDeleted });
    if (res.ok) { mode = 'server'; return { ...res, mode }; }
    if (res.error !== 'unknown action') return res;
    mode = 'client';
  }
  if (!cache || cache.deleted !== includeDeleted) {
    const l = await call('list', { include_deleted: includeDeleted });
    if (!l.ok) return l;
    cache = { deleted: includeDeleted, rows: l.rows || [] };
  }
  const rows = cache.rows.filter((r) => (includeDeleted ? !!r.deleted_at : !r.deleted_at));
  const schema = rows.length && 'saved' in rows[0] ? 'v2' : 'v1';
  return { ok: true, mode, schema, ...searchCreators(rows, { q, filters, sort, page, pageSize }) };
}

// Status written to the DB: v2 values, or the closest v1 value while the deployed schema is still v1.
export const wireStatus = (status, schema) => (schema === 'v2' ? status : V1_STATUS[status] || status);

export async function updateProspect(id, patch, schema) {
  const p = { ...patch };
  if (p.status) p.status = wireStatus(p.status, schema);
  const res = await call('update', { id, patch: p });
  if (res.ok) invalidate();
  return res;
}
export async function addProspect(row, schema, cohort) {
  const r = { ...row };
  if (r.status) r.status = wireStatus(r.status, schema);
  const res = await call('add', { row: r, cohort });
  if (res.ok) invalidate();
  return res;
}
