// track-karam — Edge Function
// يتتبّع شحنات شركة الكرم (سوريا) عبر صفحة التتبّع العامة (SSR، بلا مصادقة):
// https://newpost.mrkaram.com/track/<رقم التتبع>
// نفس نمط track-babel/track-ptt: poll يدوي {manual:true} أو cron، يحدّث orders.status
// ويحترم حالات الفريق (RETURN_GUARD) ويسجّل order_status_history + إشعار للبائع.
// اكتُشفت الصفحة العامة حيّاً 29 يوليو 2026 (لا تحتاج تسجيل دخول رغم أن /api/customer/*
// محمي بجلسة — /track/<id> منفصلة ومفتوحة، تعرض «مراحل الطرد» كخط زمني كامل).
//
// مرحلة إضافية «ربط تلقائي» (auto-link، بلا كتابة عند الكرم — قراءة فقط، مثل استيراد
// بوالص يورتيتشي): طلبات سوريا/الكرم بلا tracking_number تُطابَق تلقائياً بلوحة عميل
// الكرم المحمية بجلسة (KARAM_EMAIL/KARAM_PASSWORD) عبر فلتر receiver_phone — يقبل
// نفس صيغة phone_1 المخزّنة عندنا مباشرة («0935383830»، تحقّقتُ حيّاً 29 يوليو 2026).
// تطابق واحد فقط → يُملأ tracking_number؛ صفر أو أكثر من تطابق → يُترك للفريق يدوياً
// (تفادي ربط خاطئ يؤثر على تسوية COD).
// ════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
const KARAM_EMAIL    = Deno.env.get('KARAM_EMAIL');
const KARAM_PASSWORD = Deno.env.get('KARAM_PASSWORD');
const KARAM_UA = 'Mozilla/5.0 (compatible; LowesTracker/1.0)';

const TERMINAL = ['delivered', 'returned', 'cancelled', 'settled'];
// حالات يملكها الفريق: لا يدوسها التتبّع التلقائي (يمنع ترفرف مُسلَّم ↔ راجع).
const RETURN_GUARD = ['returning', 'returned', 'not_received', 'cancelled', 'settled'];

// حدّ أقصى للطلبات غير المربوطة بكل استدعاء — كل بحث هاتف يجلب صفحة HTML كاملة
// (حتى ~500 كيلوبايت)، ومعالجة عدد كبير دفعة واحدة ضربت حدّ موارد Supabase حيّاً
// 29 يوليو 2026 (WORKER_RESOURCE_LIMIT مع 20 طلباً). الباقي يُلتقط بالاستدعاء التالي
// (يدوي أو الاستطلاع كل 3 دقائق من الشاشة).
const AUTO_LINK_BATCH = 6;
const POLL_BATCH = 15;
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STATUS_AR: Record<string, string> = {
  preparing:'في التجهيز', at_center:'في المركز', shipped:'في النقل', on_way:'قيد التوصيل',
  delivered:'تم التسليم', not_received:'لم يتم الاستلام', returning:'راجع للمركز', returned:'راجع', cancelled:'ملغي',
};

// ترجمة حالة الكرم (نص عربي من شارة المرحلة) → حالتنا.
// الحالات المرصودة حيّاً 29 يوليو 2026: «تم الانشاء» «قيد النقل إلى مركز التجميع»
// «في مركز التجميع» «جاهزة للتسليم» «تم التسليم» «مرتجع». نسجّل المجهول (null).
function mapKaram(raw: string): string | null {
  const t = (raw || '').trim();
  if (!t) return null;
  if (t.includes('تم التسليم') || t.includes('تم تسليم')) return 'delivered';
  if (t.includes('ملغ') || t.includes('الغاء') || t.includes('إلغاء')) return 'cancelled';
  if (t.includes('مرتجع') || t.includes('راجع') || t.includes('إعادة') || t.includes('اعادة')) return 'returning';
  if (t.includes('تعذر') || t.includes('لم يتم التسليم') || t.includes('رفض')) return 'not_received';
  if (t.includes('جاهز') || t.includes('خرج')) return 'on_way';
  if (t.includes('مركز التجميع') && t.includes('قيد النقل')) return 'shipped';
  if (t.includes('مركز التجميع')) return 'at_center';
  if (t.includes('قيد النقل')) return 'shipped';
  if (t.includes('الانشاء') || t.includes('الإنشاء')) return null; // بوليصة أُنشئت فقط — لم تتحرك بعد
  return null;
}

// يجلب صفحة التتبّع العامة ويستخرج شارات «مراحل الطرد» (الأحدث أولاً) + تواريخها.
// badges[0] هو الحالة الحالية. يعمل على الـHTML الخام مباشرة (بلا تنظيف وسوم مسبق)
// لأن بعض الوسوم بمصدر الصفحة تمتد لعدة أسطر.
async function fetchKaram(trackingNumber: string): Promise<{ raw: string; timeline: { date: string; time: string; text: string }[] } | null> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`https://newpost.mrkaram.com/track/${encodeURIComponent(trackingNumber)}`, {
      headers: { 'User-Agent': KARAM_UA },
    });
  } catch { return null; }
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const html = await res.text();

  const badgeRe = /uppercase tracking-wider">\s*([^<]+?)\s*<\/span>/g;
  const dateRe  = /📅\s*(\d{4}\/\d{2}\/\d{2})\s*-\s*(\d{2}:\d{2}\s*[AP]M)/g;
  const badges: string[] = [];
  const dates: { date: string; time: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = badgeRe.exec(html))) badges.push(m[1].trim());
  while ((m = dateRe.exec(html))) dates.push({ date: m[1], time: m[2] });
  if (badges.length === 0) return null;

  const timeline = badges.map((text, i) => ({ text, date: dates[i]?.date || '', time: dates[i]?.time || '' }));
  return { raw: badges[0], timeline };
}

// يسجّل دخول إلى لوحة عميل الكرم (جلسة Laravel: CSRF token من صفحة GET ثم POST
// نموذج). يُرجع سطر Cookie جاهز للاستخدام، أو null لو فشل تسجيل الدخول.
async function karamLogin(): Promise<string | null> {
  if (!KARAM_EMAIL || !KARAM_PASSWORD) return null;
  try {
    const loginPageRes = await fetchWithTimeout('https://newpost.mrkaram.com/api/customer/login', { headers: { 'User-Agent': KARAM_UA } });
    const html = await loginPageRes.text();
    const token = html.match(/name="_token" value="([^"]+)"/)?.[1];
    if (!token) return null;
    const cookies1 = (loginPageRes.headers as any).getSetCookie?.() ?? [];

    const form = new URLSearchParams({ _token: token, email: KARAM_EMAIL, password: KARAM_PASSWORD });
    const loginRes = await fetchWithTimeout('https://newpost.mrkaram.com/api/customer-fun/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies1.map((c: string) => c.split(';')[0]).join('; '),
        'Referer': 'https://newpost.mrkaram.com/api/customer/login',
        'User-Agent': KARAM_UA,
      },
      body: form.toString(),
      redirect: 'manual',
    });
    const location = loginRes.headers.get('location') || '';
    if (location.includes('/login')) return null; // فشل: رجوع لصفحة الدخول
    const cookies2 = (loginRes.headers as any).getSetCookie?.() ?? [];

    const merged = new Map<string, string>();
    for (const c of [...cookies1, ...cookies2]) {
      const eq = c.indexOf('=');
      if (eq === -1) continue;
      merged.set(c.slice(0, eq).trim(), c.slice(eq + 1).split(';')[0]);
    }
    return [...merged.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  } catch { return null; }
}

// يبحث عن طرود الكرم برقم هاتف المستلم (نفس صيغة phone_1 عندنا: «0935383830»).
// يُرجع كل النتائج المطابقة (رقم التتبع + تاريخ الإنشاء + الحالة الحالية).
async function karamSearchByPhone(cookie: string, phone: string): Promise<{ trackingNumber: string; createdDate: string; status: string }[]> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`https://newpost.mrkaram.com/api/customer/parcels?receiver_phone=${encodeURIComponent(phone)}`, {
      headers: { Cookie: cookie, 'User-Agent': KARAM_UA },
    });
  } catch { return []; }
  if (!res.ok) return [];
  const html = await res.text();
  const nums     = [...html.matchAll(/text-lime-400">#(\d+)/g)].map(m => m[1]);
  const dates    = [...html.matchAll(/text-\[10px\] text-gray-500">([\d-]+)<\/div>/g)].map(m => m[1]);
  const statuses = [...html.matchAll(/text-xs font-black text-\w+-\d+ bg-\w+-\d+ px-2 py-0\.5 rounded-md">\s*([^<]+)/g)].map(m => m[1].trim());
  return nums.map((n, i) => ({ trackingNumber: n, createdDate: dates[i] || '', status: statuses[i] || '' }));
}

async function notifySeller(supabase: any, order: any, newStatus: string) {
  try {
    if (!order?.handler_name) return;
    const { data: prof } = await supabase.from('profiles').select('id').eq('employee_name', order.handler_name).maybeSingle();
    if (!prof?.id) return;
    const label = STATUS_AR[newStatus] || newStatus;
    const title = `📦 تحديث حالة طلب ${order.customer_name || ''}`.trim();
    const message = `انتقل الطلب إلى «${label}» (من شركة الكرم).`;
    await supabase.from('notifications').insert({
      user_id: prof.id, type: 'system_alert', title, message,
      entity_type: 'order', entity_id: String(order.id), severity: 'info',
      metadata: { status: newStatus, source: 'karam', kind: 'order_status_remote' },
      dedup_key: `${prof.id}|order_status|${order.id}|${newStatus}`,
    }).then(() => {}, () => {});
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: prof.id, title, body: message, url: '/orders' }),
    }).then(() => {}, () => {});
  } catch { /* best-effort */ }
}

async function syncSheet(orderId: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/sync-order-to-sheet`, {
      method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    });
  } catch { /* best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // وضع الاستعلام المفرد (لعرض الخط الزمني بالتطبيق): {trackingNumber:'…'} → يرجّع
  // الحالة والخط الزمني دون لمس قاعدة البيانات.
  let body: any = {};
  try { body = await req.json(); } catch { /* بلا جسم = cron */ }
  if (body?.trackingNumber) {
    const info = await fetchKaram(String(body.trackingNumber));
    if (!info) return json({ ok: false, error: 'not_found' });
    return json({ ok: true, raw: info.raw, mapped: mapKaram(info.raw), timeline: info.timeline });
  }

  // وضع تصحيح: يختبر تسجيل الدخول + بحث هاتف واحد مباشرة بلا لمس قاعدة البيانات.
  if (body?.debugPhone) {
    const cookie = await karamLogin();
    if (!cookie) return json({ ok: false, error: 'login_failed' });
    const matches = await karamSearchByPhone(cookie, String(body.debugPhone));
    return json({ ok: true, matches });
  }

  // وضع تصحيح: تسجيل دخول واحد ثم عدّة عمليات بحث متسلسلة بنفس الجلسة (لعزل مشكلة
  // إعادة استخدام الكوكي عبر طلبات متتالية).
  if (Array.isArray(body?.debugPhones)) {
    const t0 = Date.now();
    const cookie = await karamLogin();
    const loginMs = Date.now() - t0;
    if (!cookie) return json({ ok: false, error: 'login_failed', loginMs });
    const out: any[] = [];
    for (const p of body.debugPhones) {
      const t1 = Date.now();
      const matches = await karamSearchByPhone(cookie, String(p));
      out.push({ phone: p, ms: Date.now() - t1, count: matches.length });
    }
    return json({ ok: true, loginMs, out });
  }

  let linked = 0;
  const linkResults: any[] = [];

  // مرحلة الربط التلقائي: طلبات سوريا/الكرم بلا رقم تتبّع، بمطابقة رقم هاتف المستلم
  // بلوحة عميل الكرم. قراءة فقط — لا تُنشئ أو تُعدّل شيئاً عند الكرم.
  const { data: unlinked, error: unlinkedErr } = await supabase
    .from('orders')
    .select('id, order_id, phone_1, wa_number, status, shipping_company')
    .eq('market', 'syria')
    .ilike('shipping_company', '%كرم%')
    .or('tracking_number.is.null,tracking_number.eq.')
    .not('status', 'in', `(${TERMINAL.map(s => `"${s}"`).join(',')})`)
    .or('archived.is.null,archived.eq.false')
    .is('deleted_at', null);

  if (body?.debugCount) {
    return json({ ok: true, unlinkedCount: unlinked?.length ?? 0, unlinkedErr: unlinkedErr?.message ?? null, sample: (unlinked ?? []).slice(0, 5) });
  }

  if (unlinked && unlinked.length > 0) {
    const cookie = await karamLogin();
    if (cookie) {
      for (const o of unlinked.slice(0, AUTO_LINK_BATCH)) {
        try {
          const phone = String(o.phone_1 || o.wa_number || '').trim();
          if (!phone) continue;
          const matches = await karamSearchByPhone(cookie, phone);
          if (matches.length !== 1) { linkResults.push({ order: o.order_id, note: matches.length === 0 ? 'no_match' : 'ambiguous', count: matches.length }); continue; }
          const { error: linkErr } = await supabase.from('orders')
            .update({ tracking_number: matches[0].trackingNumber, updated_by: 'الكرم-ربط-تلقائي', updated_at: new Date().toISOString() })
            .eq('id', o.id).is('deleted_at', null);
          if (linkErr) continue;
          linked++;
          linkResults.push({ order: o.order_id, note: 'linked', trackingNumber: matches[0].trackingNumber, karamStatus: matches[0].status });
        } catch { /* skip this order */ }
      }
    } else {
      linkResults.push({ note: 'login_failed_or_secrets_missing' });
    }
  }

  // المسار الجماعي: طلبات سوريا مع شركة الكرم ورقم تتبّع وغير منتهية.
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_id, tracking_number, status, handler_name, customer_name, shipping_company, sheet_synced')
    .eq('market', 'syria')
    .ilike('shipping_company', '%كرم%')
    .not('tracking_number', 'is', null)
    .neq('tracking_number', '')
    .not('status', 'in', `(${TERMINAL.map(s => `"${s}"`).join(',')})`)
    .or('archived.is.null,archived.eq.false')
    .is('deleted_at', null);

  let updated = 0;
  const results: any[] = [];
  // حدّ أقصى بكل استدعاء — نفس سبب AUTO_LINK_BATCH (كل استعلام صفحة HTML كاملة).
  for (const o of (orders ?? []).slice(0, POLL_BATCH)) {
    try {
      const info = await fetchKaram(String(o.tracking_number).trim());
      if (!info) { results.push({ order: o.order_id, note: 'not_found' }); continue; }
      const newStatus = mapKaram(info.raw);
      results.push({ order: o.order_id, karam: info.raw, mapped: newStatus, current: o.status });
      if (!newStatus || newStatus === o.status || RETURN_GUARD.includes(o.status)) continue;

      const { error: upErr } = await supabase.from('orders')
        .update({ status: newStatus, updated_by: 'الكرم-تلقائي', updated_at: new Date().toISOString() })
        .eq('id', o.id).is('deleted_at', null);
      if (upErr) continue;
      updated++;
      await supabase.from('order_status_history').insert({
        order_id: o.id, from_status: o.status, to_status: newStatus, changed_by: 'شركة الكرم', source: 'karam',
      }).then(() => {}, () => {});
      await notifySeller(supabase, o, newStatus);
      // 🛡️ لا تدفع للجدول طلباً نهائياً لم يُزامَن معه أصلاً من قبل — بگ حقيقي
      // 29 يوليو 2026 (طلبات قديمة تُلحَق كصفوف «جديدة» وهمية). راجع track-babel/track-ptt.
      if (!(TERMINAL.includes(newStatus) && !o.sheet_synced)) await syncSheet(o.id);
    } catch { /* skip this shipment */ }
  }

  return json({ ok: true, linked, linkResults, checked: orders?.length ?? 0, updated, results });
});
