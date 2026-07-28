// import-babel-shipments — Edge Function
// يستقبل قائمة شحنات بابل اكسبرس (مسحوبة من صفحة «شحناتي» بحساب المالك عبر
// bookmarklet/سكربت متصفح — لا API رسمي عند بابل) ويطابقها مع طلبات سوريا
// بالاسم المُطبَّع، ثم يكتب رقم التتبّع + شركة الشحن «بابل اكسبرس».
// بعد المطابقة يستدعي track-babel لتحديث الحالات فوراً.
// الجسم: { shipments: [{awb, name, dest?, date?, status?}] }
// ════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// تطبيع عربي للمقارنة: همزات→ا، ة→ه، ى→ي، إزالة تشكيل/مسافات زائدة.
function norm(s: string): string {
  return String(s || '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// dd/mm/yyyy → timestamp (منتصف اليوم)
function parseDate(d: string): number {
  const m = String(d || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return 0;
  return new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00Z`).getTime();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad_json' }, 400); }
  const shipments: any[] = Array.isArray(body?.shipments) ? body.shipments : [];
  if (shipments.length === 0) return json({ ok: false, error: 'no_shipments' }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // طلبات سوريا آخر 90 يوماً (غير محذوفة) — نطابق حتى المؤرشفة لأن الشحنات القديمة تهم أيضاً.
  // ⚠️ PostgREST يبتر صامتاً عند 1000 صف — طلبات سوريا آخر 90 يوماً ~3700+،
  // لذا نجلب بصفحات .range() حتى النهاية (نفس درس fetchAllRows بالتطبيق).
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const orders: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: qErr } = await supabase
      .from('orders')
      .select('id, order_id, customer_name, tracking_number, shipping_company, status, created_at')
      .eq('market', 'syria')
      .is('deleted_at', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (qErr) return json({ ok: false, error: qErr.message }, 500);
    orders.push(...(page ?? []));
    if (!page || page.length < PAGE) break;
  }

  // أرقام تتبّع مستخدمة أصلاً — لا نكرّر نفس awb على طلبين.
  const usedAwb = new Set((orders ?? []).map(o => String(o.tracking_number || '').trim()).filter(Boolean));

  // فهرسان: (1) بالاسم بلا مسافات إطلاقاً — يحلّ «عبدالقادر» ↔ «عبد القادر»،
  // (2) fuzzy بالأجزاء (tokens): تطابق إن كان أحد الاسمين subset من الآخر
  //     (≥2 كلمات مشتركة) والمرشّح وحيد — يحلّ «عبدو حسو» ↔ «عبدو محمد حسو».
  const byKey = new Map<string, any[]>();
  for (const o of (orders ?? [])) {
    const k = norm(o.customer_name).replace(/\s+/g, '');
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(o);
  }
  const tokenized = (orders ?? []).map(o => ({ o, toks: new Set(norm(o.customer_name).split(' ').filter(Boolean)) }));
  function fuzzyCands(nm: string): any[] {
    const st = norm(nm).split(' ').filter(Boolean);
    if (st.length < 2) return [];
    const sSet = new Set(st);
    const hits = tokenized.filter(({ toks }) => {
      if (toks.size < 2) return false;
      const small = toks.size <= sSet.size ? toks : sSet;
      const big = toks.size <= sSet.size ? sSet : toks;
      let common = 0;
      for (const t of small) { if (!big.has(t)) return false; common++; }
      return common >= 2;
    }).map(h => h.o);
    // لا نقبل الغموض بالمطابقة الضبابية: أسماء مميزة فقط
    const uniqNames = new Set(hits.map(h => norm(h.customer_name)));
    return uniqNames.size === 1 ? hits : [];
  }

  let updated = 0, already = 0;
  const unmatched: any[] = [];
  const ambiguous: any[] = [];
  const matchedList: any[] = [];

  for (const s of shipments) {
    const awb = String(s.awb || '').trim();
    const nm = norm(s.name);
    if (!awb || !nm) continue;
    if (usedAwb.has(awb)) { already++; continue; }   // مستورد سابقاً

    let cands = byKey.get(nm.replace(/\s+/g, '')) || [];
    if (cands.length === 0) cands = fuzzyCands(s.name);
    // نفضّل الطلبات بلا رقم تتبّع؛ وعند التعدد نختار الأقرب زمنياً لتاريخ الشحنة.
    const open = cands.filter(o => !String(o.tracking_number || '').trim());
    if (open.length === 0) {
      if (cands.length > 0) { already++; continue; } // طلبه موجود وعنده رقم آخر/نفسه
      unmatched.push({ awb, name: s.name, dest: s.dest || '', date: s.date || '' });
      continue;
    }
    let pick = open[0];
    if (open.length > 1) {
      const t = parseDate(s.date);
      if (t) {
        pick = open.slice().sort((a, b) =>
          Math.abs(new Date(a.created_at).getTime() - t) - Math.abs(new Date(b.created_at).getTime() - t))[0];
        ambiguous.push({ awb, name: s.name, candidates: open.map(o => o.order_id), picked: pick.order_id });
      } else {
        pick = open.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        ambiguous.push({ awb, name: s.name, candidates: open.map(o => o.order_id), picked: pick.order_id });
      }
    }

    const { error: upErr } = await supabase.from('orders')
      .update({ tracking_number: awb, shipping_company: 'بابل اكسبرس', updated_at: new Date().toISOString(), updated_by: 'استيراد-بابل' })
      .eq('id', pick.id).is('deleted_at', null);
    if (upErr) continue;
    usedAwb.add(awb);
    pick.tracking_number = awb; // حتى لا يُختار ثانيةً لشحنة أخرى بنفس الاسم
    updated++;
    matchedList.push({ awb, order: pick.order_id, name: s.name });
  }

  // حدّث الحالات فوراً بعد الاستيراد (best-effort).
  if (updated > 0) {
    await fetch(`${SUPABASE_URL}/functions/v1/track-babel`, {
      method: 'POST', headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ manual: true }),
    }).then(() => {}, () => {});
  }

  return json({ ok: true, received: shipments.length, updated, already, matched: matchedList, unmatched, ambiguous });
});
