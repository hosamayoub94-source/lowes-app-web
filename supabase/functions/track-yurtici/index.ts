// track-yurtici — Edge Function
// يستعلم من Yurtiçi API كل 30 دقيقة عن الطلبات النشطة التي عندها tracking_number
// يحدّث status في DB إذا تغيّر + يزامن الجدول تلقائياً
// ════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')  ?? 'https://fghdumrgimoeqsafdhhh.supabase.co';
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE5MTc5NCwiZXhwIjoyMDkxNzY3Nzk0fQ.xpvq4jRX-SiEy5WpLCOnAbY68k_hXlpPDn6Jp_MhhRs';
// YKSS portal credentials — replace with actual API credentials once created in API Bilgileri
const API_USER      = Deno.env.get('YURTICI_API_USER') ?? 'YOUSEF034';
const API_PASS      = Deno.env.get('YURTICI_API_PASS') ?? '9i4hfKi4KJ';

const YURTICI_BASE  = 'https://api.yurticikargo.com';

// Statuses that don't need tracking anymore
const TERMINAL_STATUSES = ['delivered', 'returned', 'cancelled', 'settled'];

// ── Yurtiçi status code → our status ─────────────────────────
// Based on YKSS documentation status codes
function mapYurticiStatus(statusCode: number, statusText: string): string | null {
  const text = (statusText || '').toLowerCase();

  // Delivered
  if (statusCode === 40 || text.includes('teslim edildi') || text.includes('delivered')) return 'delivered';

  // Out for delivery
  if (statusCode === 30 || text.includes('dağıtımda') || text.includes('dağıtım')) return 'on_way';

  // At branch / transfer center
  if ([20, 21, 22, 23].includes(statusCode) || text.includes('şubede') || text.includes('transfer')) return 'at_center';

  // In transit (picked up from sender)
  if ([10, 11, 12].includes(statusCode) || text.includes('kargoya verildi') || text.includes('taşımada')) return 'shipped';

  // Could not deliver → not_received
  if ([35, 45].includes(statusCode) || text.includes('teslim edilemedi') || text.includes('bulunamadı')) return 'not_received';

  // Returned to sender
  if ([50, 55].includes(statusCode) || text.includes('iade')) return 'returning';

  return null; // unknown → don't change
}

// ── Get Yurtiçi Bearer token ──────────────────────────────────
async function getToken(): Promise<string> {
  const creds = btoa(`${API_USER}:${API_PASS}`);
  const res = await fetch(`${YURTICI_BASE}/auth/v1`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    // Some versions use Basic auth directly without a token step
    return creds; // fall back to Basic
  }
  const data = await res.json();
  return data?.access_token || data?.token || creds;
}

// ── Query Yurtiçi tracking for a batch of barcodes ───────────
async function fetchTracking(barcodes: string[], token: string): Promise<any[]> {
  const res = await fetch(`${YURTICI_BASE}/v2/TrackDelivery/tracking`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ barcodes }),
  });
  if (!res.ok) {
    console.error('Yurtiçi API error:', res.status, await res.text());
    return [];
  }
  const data = await res.json();
  return Array.isArray(data) ? data : (data?.trackingList ?? data?.data ?? []);
}

// ── Sync order to sheet (re-use existing edge fn) ────────────
async function syncSheet(orderId: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/sync-order-to-sheet`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId }),
    });
  } catch { /* best-effort */ }
}

// ── Main handler ──────────────────────────────────────────────
Deno.serve(async (req) => {
  // Allow manual trigger via POST, or scheduled invocation
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // 1. Load all active Turkey orders with a tracking number
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_id, tracking_number, shipping_company, status, market')
    .eq('market', 'turkey')
    .not('tracking_number', 'is', null)
    .not('tracking_number', 'eq', '')
    .not('status', 'in', `(${TERMINAL_STATUSES.map(s => `"${s}"`).join(',')})`)
    .or('archived.is.null,archived.eq.false');

  if (error) {
    console.error('DB error:', error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  if (!orders || orders.length === 0) {
    return new Response(JSON.stringify({ ok: true, checked: 0, updated: 0 }), { status: 200 });
  }

  // 2. Filter only Yurtiçi orders (the only company we have API access for now)
  const yurticiOrders = orders.filter(o =>
    !o.shipping_company || // no company set → try anyway
    o.shipping_company.toLowerCase().includes('yurtiçi') ||
    o.shipping_company.toLowerCase().includes('yurtici')
  );

  if (yurticiOrders.length === 0) {
    return new Response(JSON.stringify({ ok: true, checked: 0, updated: 0, note: 'no yurtici orders' }), { status: 200 });
  }

  console.log(`Checking ${yurticiOrders.length} Yurtiçi orders...`);

  // 3. Get auth token
  let token: string;
  try {
    token = await getToken();
  } catch (e) {
    console.error('Auth error:', e);
    return new Response(JSON.stringify({ ok: false, error: 'auth failed' }), { status: 500 });
  }

  // 4. Process in batches of 20 (API limit)
  const BATCH = 20;
  let updated = 0;
  const results: any[] = [];

  for (let i = 0; i < yurticiOrders.length; i += BATCH) {
    const batch = yurticiOrders.slice(i, i + BATCH);
    const barcodes = batch.map(o => o.tracking_number);

    const trackingData = await fetchTracking(barcodes, token);

    for (const item of trackingData) {
      const barcode = item.barcode || item.trackingNumber || item.kargo_no;
      const order = batch.find(o => o.tracking_number === barcode);
      if (!order) continue;

      // Get latest status from events (most recent first)
      const events: any[] = item.events || item.trackingEvents || [];
      const latest = events[0] || item;
      const statusCode = latest.statusCode ?? latest.status_code ?? item.deliveryStatusCode ?? item.statusCode;
      const statusText = latest.status ?? latest.description ?? item.deliveryStatus ?? '';

      const newStatus = mapYurticiStatus(Number(statusCode), String(statusText));

      results.push({ order_id: order.order_id, barcode, statusCode, statusText, newStatus, current: order.status });

      if (!newStatus || newStatus === order.status) continue;

      // 5. Update DB
      const { error: upErr } = await supabase
        .from('orders')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
          updated_by: 'يورتيتشي-تلقائي',
        })
        .eq('id', order.id);

      if (!upErr) {
        updated++;
        // الخط الزمني: تغيير الحالة من شركة الشحن (source='yurtici')
        await supabase.from('order_status_history').insert({
          order_id: order.id, from_status: order.status, to_status: newStatus,
          changed_by: 'يورتيتشي', source: 'yurtici',
        }).then(() => {}, () => {});
        // 6. Sync sheet
        await syncSheet(order.id);
        console.log(`✅ ${order.order_id}: ${order.status} → ${newStatus}`);
      }
    }
  }

  console.log(`Done: checked=${yurticiOrders.length}, updated=${updated}`);
  return new Response(
    JSON.stringify({ ok: true, checked: yurticiOrders.length, updated, results }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
