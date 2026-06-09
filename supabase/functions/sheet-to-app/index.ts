// =============================================================
// sheet-to-app — Edge Function
// يستقبل webhook من Google Apps Script عند تعديل الجدول:
//   - تغيير رقم التتبع (عمود P) → يحدّث tracking_number في DB
//   - تغيير الحالة (عمود الحالة) → يحدّث status في DB
//   - استيراد جماعي (bulk import) → يُدرج/يُحدّث طلبات من الجدول في DB
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')  ?? 'https://fghdumrgimoeqsafdhhh.supabase.co';
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE5MTc5NCwiZXhwIjoyMDkxNzY3Nzk0fQ.xpvq4jRX-SiEy5WpLCOnAbY68k_hXlpPDn6Jp_MhhRs';
// Accept either the Turkey or Syria sheet token (both sheets call this fn)
const VALID_TOKENS = [
  Deno.env.get('SHEET_SYNC_TOKEN'),
  Deno.env.get('TURKEY_SHEET_SYNC_TOKEN'),
  'LOWES-TURKEY-2026',
  'LOWES-SYRIA-2026',
].filter(Boolean);

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const STATUS_MAP: Record<string, string> = {
  'وارد جديد': 'pending',     'pending': 'pending',
  'في التجهيز': 'preparing',  'preparing': 'preparing',
  'جاهز': 'ready',             'ready': 'ready',
  'قيد توصيل الموتور': 'motor','motor': 'motor',
  'تحضير الموتور': 'motor_prep', 'motor_prep': 'motor_prep',
  'في المركز': 'at_center',    'at_center': 'at_center',
  'في النقل': 'shipped',       'shipped': 'shipped',
  'في الطريق للعميل': 'on_way','قيد التوصيل': 'on_way', 'on_way': 'on_way',
  'توصيل خاص': 'special_delivery', 'special_delivery': 'special_delivery',
  'مسبق الدفع': 'prepaid',     'prepaid': 'prepaid',
  'تم التسليم': 'delivered',   'delivered': 'delivered',
  // مرادفات جدول سوريا (STATUS_AR_SY مختلفة عن المعيارية)
  'تعبئة وتجهيز': 'preparing',
  'جاهز للشحن': 'ready',
  'مع الموتور': 'motor',
  'تم الشحن': 'shipped',
  'في الطريق': 'on_way',
  'راجع للمخزن': 'returning',
  'مرتجع': 'returned',
  'بالانتظار': 'waiting',      'waiting': 'waiting',
  'لم يتم الاستلام': 'not_received', 'not_received': 'not_received',
  'راجع للمركز': 'returning',  'returning': 'returning',
  'راجع': 'returned',           'returned': 'returned',
  'تمت التسوية': 'settled',    'settled': 'settled',
  'ملغي': 'cancelled', 'الغاء': 'cancelled', 'الإلغاء': 'cancelled', 'cancelled': 'cancelled',
};

function resolveStatus(raw: string): string | null {
  if (!raw) return null;
  const clean = raw.replace(/[🆕📦🚀🏍️🛠️🏢🚚🛵🚗💳✅⏳📭↩️🔁🤝❌]/g, '').trim();
  return STATUS_MAP[clean] ?? STATUS_MAP[raw.trim()] ?? null;
}

const STATUS_AR: Record<string, string> = {
  pending:'وارد جديد', preparing:'في التجهيز', ready:'جاهز', motor:'قيد توصيل الموتور',
  motor_prep:'تحضير الموتور', at_center:'في المركز', shipped:'في النقل', on_way:'قيد التوصيل',
  special_delivery:'توصيل خاص', prepaid:'مسبق الدفع', delivered:'تم التسليم',
  waiting:'بالانتظار', not_received:'لم يتم الاستلام', returning:'راجع للمركز', returned:'راجع',
  settled:'تمت التسوية', cancelled:'ملغي',
};

// إشعار البائع عند تغيّر حالة طلبه من الجدول/شركة الشحن (server-side).
async function notifySeller(supabase: any, order: any, newStatus: string, sourceLabel: string) {
  try {
    if (!order?.handler_name) return;
    const { data: prof } = await supabase.from('profiles').select('id').eq('employee_name', order.handler_name).maybeSingle();
    if (!prof?.id) return;
    const label = STATUS_AR[newStatus] || newStatus;
    const title = `📦 تحديث حالة طلب ${order.customer_name || ''}`.trim();
    const message = `انتقل الطلب إلى «${label}» (من ${sourceLabel}).`;
    await supabase.from('notifications').insert({
      user_id: prof.id, type: 'system_alert', title, message,
      entity_type: 'order', entity_id: String(order.id), severity: 'info',
      metadata: { status: newStatus, source: sourceLabel, kind: 'order_status_remote' },
      dedup_key: `${prof.id}|order_status|${order.id}|${newStatus}`,
    }).then(() => {}, () => {});
    // Web Push (best-effort)
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: prof.id, title, body: message, url: '/orders' }),
    }).then(() => {}, () => {});
  } catch { /* best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json();

    // Token check (accepts Turkey or Syria token)
    if (!VALID_TOKENS.includes(body.token)) {
      return json({ ok: false, error: 'invalid token' }, 403);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const action   = body.action ?? 'update'; // 'update' | 'bulk_import'

    // ── 1. Single update: tracking_number or status from onSheetEdit ──
    if (action === 'update') {
      const { order_id, tracking_number, status } = body;
      if (!order_id) return json({ ok: false, error: 'order_id required' }, 400);

      // اقرأ الحالة الحالية أولاً (للخط الزمني + إشعار البائع + تجنّب كتابة نفس القيمة)
      const { data: cur } = await supabase
        .from('orders')
        .select('id, status, handler_name, customer_name, deleted_at')
        .eq('order_id', order_id)
        .maybeSingle();

      // طلب محذوف (soft-delete) — لا نُحييه بتعديل من الجدول.
      if (cur?.deleted_at) return json({ ok: true, skipped: 'deleted' }, 200);

      // مصدر الحقيقة: الجدول يحدّث الحالة + رقم التتبع فقط (لا يلمس بيانات العميل/الأصناف).
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: 'جدول-تلقائي' };

      if (tracking_number !== undefined && tracking_number !== null) {
        patch.tracking_number = String(tracking_number).trim();
      }
      let newStatus: string | null = null;
      if (status) {
        const resolved = resolveStatus(status);
        if (resolved) { patch.status = resolved; newStatus = resolved; }
      }

      if (Object.keys(patch).length <= 2) return json({ ok: false, error: 'nothing to update' }, 400);

      const { error } = await supabase
        .from('orders')
        .update(patch)
        .eq('order_id', order_id)
        .is('deleted_at', null);

      if (error) return json({ ok: false, error: error.message }, 500);

      // الخط الزمني + إشعار البائع: تغيير الحالة القادم من الجدول (source='sheet')
      if (cur?.id && newStatus && newStatus !== cur.status) {
        await supabase.from('order_status_history').insert({
          order_id: cur.id, from_status: cur.status, to_status: newStatus,
          changed_by: 'الجدول', source: 'sheet',
        }).then(() => {}, () => {});
        await notifySeller(supabase, cur, newStatus, 'الجدول');
      }

      // Sync back to sheet so status bar updates
      try {
        const { data: o } = await supabase.from('orders').select('id').eq('order_id', order_id).maybeSingle();
        if (o?.id) {
          await fetch(`${SUPABASE_URL}/functions/v1/sync-order-to-sheet`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: o.id }),
          });
        }
      } catch { /* best-effort */ }

      return json({ ok: true, updated: order_id });
    }

    // ── 2. Bulk import: insert/upsert many rows from sheet ──
    if (action === 'bulk_import') {
      const rows: any[] = body.rows ?? [];
      if (!rows.length) return json({ ok: true, inserted: 0, updated: 0 });

      let inserted = 0, updated = 0, skipped = 0;
      const batchMarket = body.market || 'turkey';

      for (const row of rows) {
        // A real order is identified by customer NAME + PHONE — never by trailing
        // cells (WhatsApp/tracking links/buttons) that the sheet fills on blank
        // rows. Reject phantom rows: require order_id + a non-empty name + a
        // phone containing at least 6 digits.
        const cName  = String(row.customer_name || '').trim();
        const cPhone = String(row.phone_1 || row.phone || row.wa_number || '').replace(/\D/g, '');
        if (!row.order_id || !cName || cPhone.length < 6) { skipped++; continue; }

        // Map status_ar to status key
        const status = resolveStatus(row.status_ar || row.status || '') ?? 'pending';
        const market = row.market || batchMarket;
        const currency = row.currency || (market === 'syria' ? 'SYP' : 'TRY');

        const record = {
          order_id:         String(row.order_id).trim(),
          market,
          brand:            row.brand || 'lowes',
          customer_name:    row.customer_name || '',
          phone_1:          row.phone_1 || row.phone || '',
          wa_number:        row.wa_number || row.phone_1 || '',
          city:             row.city || '',
          district:         row.district || '',
          address:          row.address || '',
          amount:           Number(row.amount) || 0,
          currency,
          status,
          handler_name:     row.handler_name || '',
          shipping_company: row.shipping_company || '',
          tracking_number:  row.tracking_number || null,
          payment_method:   row.payment_method || 'دفع عند الباب',
          pickup_type:      row.pickup_type || '',
          notes:            row.notes || '',
          items:            row.items || [],
          order_date:       row.order_date ? new Date(row.order_date).toISOString() : new Date().toISOString(),
          sheet_synced:     true,
          created_by:       'استيراد-جدول',
        };

        // Check if order_id already exists
        const { data: existing } = await supabase
          .from('orders')
          .select('id, deleted_at')
          .eq('order_id', record.order_id)
          .maybeSingle();

        if (existing) {
          if (existing.deleted_at) { skipped++; continue; }  // طلب محذوف — لا نُحييه
          // Update tracking_number and status only (don't overwrite manual data)
          const upd: Record<string, unknown> = { updated_by: 'استيراد-جدول' };
          if (record.tracking_number) upd.tracking_number = record.tracking_number;
          if (status !== 'pending') upd.status = status;
          await supabase.from('orders').update(upd).eq('id', existing.id);
          updated++;
        } else {
          const { error } = await supabase.from('orders').insert(record);
          if (!error) inserted++;
          else { console.error('insert error:', error.message, record.order_id); skipped++; }
        }
      }

      return json({ ok: true, inserted, updated, skipped });
    }

    return json({ ok: false, error: 'unknown action' }, 400);

  } catch (err) {
    console.error('[sheet-to-app]', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
