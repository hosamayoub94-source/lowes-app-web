// =============================================================
// sync-meta-insights — Edge Function
// تسحب رؤى إعلانات ميتا (Marketing API) وتُخزّنها في meta_ad_insights.
// تتطلب سرّين: META_ACCESS_TOKEN (صلاحية ads_read) + META_AD_ACCOUNT_ID (act_…).
// بوّابة: x-admin-key (للتشغيل اليدوي/cron). idempotent (upsert على date+meta_ad_id).
// تربط حملات ميتا بحملاتنا عبر meta_campaign_id (يدوي) أو مطابقة الاسم.
// =============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// SECURITY: service-role key is auto-injected by the Edge runtime — never hardcode
// it (the old literal is in git history and MUST be rotated).
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://fghdumrgimoeqsafdhhh.supabase.co';
// Prefer new secret API key (SB_SECRET_KEY); fall back to the auto-injected legacy service_role during migration.
const SERVICE_KEY  = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
// ⚠️ SECURITY TODO (owner-coordinated): move this gate to an env secret
// (META_SYNC_ADMIN_KEY) and rotate the value — it is exposed in git history.
const ADMIN_KEY    = Deno.env.get('META_SYNC_ADMIN_KEY') ?? 'LOWES-META-SYNC-2026';
const GRAPH_VER    = 'v21.0';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// تطبيع اسم للمطابقة (مثل _normName بالتطبيق).
const norm = (s: string) => String(s || '').toLowerCase()
  .replace(/i̇/g, 'i').replace(/[ıİ]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
  .replace(/[çÇ]/g, 'c').replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
  .replace(/[^a-z0-9؀-ۿ]/g, '').replace(/^lowes/, '');

function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// نتائج (رسائل/ليدز) من مصفوفة actions.
function extractResults(actions: any[]): number {
  if (!Array.isArray(actions)) return 0;
  let n = 0;
  for (const a of actions) {
    const t = String(a.action_type || '');
    if (t.includes('messaging') || t === 'lead' || t.includes('onsite_conversion') || t === 'link_click')
      n += Number(a.value || 0);
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (req.headers.get('x-admin-key') !== ADMIN_KEY) return json({ ok: false, error: 'unauthorized' }, 401);

    const TOKEN = Deno.env.get('META_ACCESS_TOKEN');
    const ACCT  = Deno.env.get('META_AD_ACCOUNT_ID');
    if (!TOKEN || !ACCT) return json({ ok: false, error: 'missing_secrets', need: ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'] }, 400);

    const body = await req.json().catch(() => ({}));
    const until = body.until || ymd(new Date());
    const sinceD = new Date(); sinceD.setDate(sinceD.getDate() - (Number(body.days) || 7));
    const since = body.since || ymd(sinceD);

    const acct = String(ACCT).startsWith('act_') ? ACCT : `act_${ACCT}`;
    const fields = 'campaign_id,campaign_name,ad_id,ad_name,spend,reach,impressions,ctr,cpc,cpm,actions,account_currency';
    const base = `https://graph.facebook.com/${GRAPH_VER}/${acct}/insights`;
    const params = new URLSearchParams({
      level: 'ad', time_increment: '1', fields,
      time_range: JSON.stringify({ since, until }), limit: '300', access_token: TOKEN,
    });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    // حملاتنا للمطابقة بالاسم/الربط
    const { data: ourCamps } = await supabase.from('campaigns').select('id, name, meta_campaign_id');
    const byMetaId = new Map<string, string>();
    const byName   = new Map<string, string>();
    for (const c of (ourCamps ?? [])) {
      if (c.meta_campaign_id) byMetaId.set(String(c.meta_campaign_id), c.id);
      if (c.name) byName.set(norm(c.name), c.id);
    }
    const { data: ourAds } = await supabase.from('campaign_ads').select('id, meta_ad_id');
    const adByMetaId = new Map<string, string>();
    for (const a of (ourAds ?? [])) if (a.meta_ad_id) adByMetaId.set(String(a.meta_ad_id), a.id);

    // اسحب كل الصفحات
    let url = `${base}?${params.toString()}`;
    const rows: any[] = [];
    let pages = 0;
    while (url && pages < 30) {
      const res = await fetch(url);
      const j = await res.json();
      if (j.error) return json({ ok: false, error: 'meta_api', detail: j.error }, 400);
      for (const r of (j.data ?? [])) rows.push(r);
      url = j.paging?.next || '';
      pages++;
    }

    // upsert
    let upserted = 0;
    for (const r of rows) {
      const campaign_id = (r.campaign_id && byMetaId.get(String(r.campaign_id))) || byName.get(norm(r.campaign_name)) || null;
      const ad_id = (r.ad_id && adByMetaId.get(String(r.ad_id))) || null;
      const rec = {
        date: r.date_start, meta_campaign_id: r.campaign_id || null, meta_ad_id: r.ad_id || null,
        campaign_id, ad_id, campaign_name: r.campaign_name || null, ad_name: r.ad_name || null,
        spend: Number(r.spend || 0), reach: Number(r.reach || 0), impressions: Number(r.impressions || 0),
        results: extractResults(r.actions), ctr: Number(r.ctr || 0), cpc: Number(r.cpc || 0), cpm: Number(r.cpm || 0),
        currency: r.account_currency || null, updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('meta_ad_insights').upsert(rec, { onConflict: 'date,meta_ad_id' });
      if (!error) upserted++;
    }

    return json({ ok: true, since, until, fetched: rows.length, upserted });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
