// =============================================================
// sync-prices — Edge Function
// يقرأ تبويب أسعار سوريا (Product Price) عبر gviz (سعر البيع بالدولار $)
// ويحدّث product_economics.sale_price_usd. السعر الأساسي بالدولار هو المرساة
// الثابتة (العروض تتغيّر بالعملة المحلية فقط، والأكواد/الأسماء مشتركة مع تركيا).
// يُستدعى من زر «🔄 مزامنة الأسعار» للمدير. لا يلمس المنتجات غير الموجودة
// بالجدول (مثل الدِرما/الإكسسوارات المُدخلة يدوياً) لأن الـupsert يطال صفوف الجدول فقط.
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://fghdumrgimoeqsafdhhh.supabase.co';
// Prefer new secret API key (SB_SECRET_KEY); fall back to the auto-injected legacy service_role during migration.
const SERVICE_KEY  = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) ?? '';
const VALID_TOKENS = [
  Deno.env.get('SHEET_SYNC_TOKEN'),
  'LOWES-SYRIA-2026',
  'LOWES-TURKEY-2026',
].filter(Boolean);

// Syria pricing sheet — the $ column is the authoritative USD base price.
const SYRIA_SHEET = '1YIEv5EwLq3wz1KlObquLVtd0ep9sk4ZHq9dueEO-vcw';
const PRICE_GID   = '109674203';

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// Parse a gviz JSON response into rows of cell values.
async function gviz(sheetId: string, gid: string): Promise<any[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}&headers=0`;
  const txt = await (await fetch(url)).text();
  const data = JSON.parse(txt.match(/setResponse\((.*)\);?\s*$/s)![1]);
  return data.table.rows.map((r: any) => r.c.map((c: any) => (c ? c.v : null)));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const token = body?.token ?? req.headers.get('x-sync-token');
    if (!VALID_TOKENS.includes(token)) return json({ error: 'unauthorized' }, 401);

    const rows = await gviz(SYRIA_SHEET, PRICE_GID);
    // columns: 0=code, 2=EN name, 3=AR name, 4=$ (USD base price)
    const entries: { item_name: string; sale_price_usd: number }[] = [];
    for (const c of rows) {
      const usd = Number(c[4]);
      if (!Number.isFinite(usd) || usd <= 0) continue;
      for (const name of [c[2], c[3]]) {
        if (name && String(name).trim()) entries.push({ item_name: String(name).trim(), sale_price_usd: usd });
      }
    }
    if (!entries.length) return json({ error: 'no prices parsed' }, 422);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { error } = await supabase
      .from('product_economics')
      .upsert(entries, { onConflict: 'item_name' });
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, synced: entries.length });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
