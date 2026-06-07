// =============================================================
// orderSyncService — كل منطق مزامنة الطلب مع Google Sheet + سجل الحالات
// + الحذف الناعم + حارس التكرار، في مكان واحد بحدود واضحة.
//
// مصدر الحقيقة (المالك): الحالة + رقم التتبع يفوزان من الجدول/شركة الشحن؛
// بيانات العميل + الأصناف تفوز من التطبيق. هذه الخدمة تكتب من جهة التطبيق فقط.
// =============================================================
import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;

const SYNCABLE_MARKETS = ['syria', 'turkey'];
export const isSyncable = (o) => o && SYNCABLE_MARKETS.includes(o.market) && o.archived !== true && !o.deleted_at;

// ── المزامنة: التطبيق → الجدول ─────────────────────────────────
// يستدعي edge fn ويحدّث مؤشر المزامنة (sync_status/sync_error/attempts/last_synced_at)
// حسب الرد. أعمدة sync_* تُضاف بالـDDL (المرحلة 1)؛ التحديث best-effort.
export async function syncToSheet(orderId, { markPending = false } = {}) {
  if (!orderId) return { ok: false, error: 'no order id' };
  if (markPending) {
    await supabase.from('orders').update({ sync_status: 'pending' }).eq('id', orderId).then(() => {}, () => {});
  }
  let ok = false, errText = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-order-to-sheet`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
    let body = null;
    try { body = await res.json(); } catch { /* non-json */ }
    ok = res.ok && body?.ok !== false && !body?.error;
    if (!ok) errText = String(body?.error || `HTTP ${res.status}`).slice(0, 300);
  } catch (e) {
    ok = false; errText = String(e?.message || e).slice(0, 300);
  }
  // حدّث المؤشر (لا يكسر شيئاً لو الأعمدة لم تُطبّق بعد — نتجاهل الخطأ).
  const patch = ok
    ? { sync_status: 'synced', sheet_synced: true, sync_error: null, last_synced_at: new Date().toISOString() }
    : { sync_status: 'failed', sync_error: errText };
  await supabase.rpc('increment_order_sync_attempts', { p_order_id: orderId }).then(() => {}, () => {});
  await supabase.from('orders').update(patch).eq('id', orderId).then(() => {}, () => {});
  return { ok, error: errText };
}

// إعادة المزامنة يدوياً (يصفّر الخطأ ويعيد المحاولة فوراً).
export const retrySync = (orderId) => syncToSheet(orderId, { markPending: true });

// إعادة مزامنة جماعية للطلبات الفاشلة (للوحة الأدمن). يُرجّع {done, failed}.
export async function retryAllFailed(orderIds = []) {
  let done = 0, failed = 0;
  for (const id of orderIds) {
    const r = await syncToSheet(id, { markPending: true });
    if (r.ok) done++; else failed++;
  }
  return { done, failed };
}

// جلب الطلبات الفاشلة المزامنة (للوحة الأدمن).
export async function listFailedSync({ limit = 100 } = {}) {
  const { data } = await supabase
    .from('orders')
    .select('id, order_id, market, customer_name, handler_name, sync_status, sync_error, last_synced_at, sync_attempts')
    .eq('sync_status', 'failed')
    .or('archived.is.null,archived.eq.false')
    .is('deleted_at', null)
    .order('order_date', { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ── سجل الحالات (الخط الزمني) ──────────────────────────────────
// append-only. source: app | sheet | yurtici.
export async function recordStatusChange({ orderId, from, to, by, source = 'app' }) {
  if (!orderId || !to || from === to) return;
  await supabase.from('order_status_history').insert({
    order_id: orderId, from_status: from || null, to_status: to,
    changed_by: by || null, source,
  }).then(() => {}, () => {});
}

export async function getStatusHistory(orderId) {
  if (!orderId) return [];
  const { data } = await supabase
    .from('order_status_history')
    .select('*')
    .eq('order_id', orderId)
    .order('changed_at', { ascending: false });
  return data ?? [];
}

// ── الحذف الناعم ──────────────────────────────────────────────
// يوسم الطلب deleted_at بدل حذف الصف (آمن للمزامنة الثنائية).
export async function softDeleteOrder(order, by) {
  const { error } = await supabase.from('orders')
    .update({ deleted_at: new Date().toISOString(), deleted_by: by || null, status: 'cancelled' })
    .eq('id', order.id);
  if (error) throw new Error(error.message);
  // يزامن الجدول ليعكس الإلغاء/الحذف (الحالة صارت cancelled).
  if (isSyncable({ ...order, deleted_at: null })) syncToSheet(order.id);
}

// استرجاع طلب محذوف (للمدير): يصفّر deleted_at ويعيد المزامنة.
export async function restoreOrder(order, by) {
  const { error } = await supabase.from('orders')
    .update({ deleted_at: null, deleted_by: null, updated_by: by || null, updated_at: new Date().toISOString() })
    .eq('id', order.id);
  if (error) throw new Error(error.message);
  if (['syria', 'turkey'].includes(order.market) && order.archived !== true) syncToSheet(order.id);
}

// قائمة الطلبات المحذوفة (soft-deleted) — للمدير.
export async function listDeleted({ limit = 200 } = {}) {
  const { data } = await supabase.from('orders')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

// ── حارس التكرار ──────────────────────────────────────────────
// يحذّر لو نفس الهاتف + منتج متطابق خلال X دقيقة بنفس السوق.
export async function findDuplicates({ phone, items = [], market, withinMinutes = 10, excludeId = null }) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 6) return [];
  const since = new Date(Date.now() - withinMinutes * 60000).toISOString();
  let q = supabase.from('orders')
    .select('id, order_id, customer_name, items, created_at, handler_name, phone_1, wa_number')
    .gte('created_at', since)
    .is('deleted_at', null);
  if (market) q = q.eq('market', market);
  const { data } = await q;
  if (!data) return [];
  const names = new Set(items.map(i => String(i?.name || '').trim().toLowerCase()).filter(Boolean));
  return data.filter(o => {
    if (excludeId && o.id === excludeId) return false;
    const oPhone = String(o.phone_1 || o.wa_number || '').replace(/\D/g, '');
    const phoneMatch = oPhone && (oPhone.endsWith(digits.slice(-8)) || digits.endsWith(oPhone.slice(-8)));
    if (!phoneMatch) return false;
    if (names.size === 0) return true;
    return (o.items || []).some(it => names.has(String(it?.name || '').trim().toLowerCase()));
  });
}
