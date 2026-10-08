// Verifies candidate UAE entities against their OWN public websites. Records only what the page actually contains.
// usage: node verify_sites.cjs candidates.json out.json
const fs = require('fs');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const cands = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');
const SELL_RE = /(sell on|sell with|become a (seller|vendor|supplier|partner)|seller|vendor|suppliers?|supplier registration|wholesale|b2b|partner with us|brand partnerships?|list your|join us|distributor|for brands|brands? (onboarding|application))/i;
const EMIRATES = ['dubai', 'abu dhabi', 'sharjah', 'ajman', 'umm al quwain', 'ras al khaimah', 'fujairah', 'al ain'];

async function get(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, redirect: 'follow', signal: ctl.signal });
    const buf = Buffer.from(await r.arrayBuffer()).subarray(0, 900000).toString('utf8');
    return { status: r.status, final: r.url, html: buf };
  } catch (e) { return { status: 0, error: String(e.message || e).slice(0, 80), html: '' }; } finally { clearTimeout(t); }
}
function analyse(c, res) {
  const html = res.html || '';
  const body = dec(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const title = dec((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const desc = dec((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) || [])[1] || '').trim().slice(0, 220);
  const low = (title + ' ' + body).toLowerCase();
  const tokens = c.name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['the', 'and', 'uae', 'pharmacy', 'beauty', 'group', 'store', 'shop'].includes(w));
  const brandMatch = tokens.length ? tokens.some((w) => low.includes(w)) : true;
  const uae = /(united arab emirates|\buae\b|\baed\b|dirham|\bdubai\b|abu dhabi|sharjah)/i.test(low);
  const emirates = EMIRATES.filter((e) => low.includes(e));
  const emails = [...new Set([...html.matchAll(/mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)].map((m) => m[1].toLowerCase()))].filter((e) => !/(example|sentry|wixpress|yourdomain|domain\.com)/.test(e)).slice(0, 4);
  const tels = [...new Set([...html.matchAll(/href=["']tel:([+\d][\d\s\-().]{6,20})["']/g)].map((m) => m[1].trim()))].slice(0, 3);
  const wa = [...new Set([...html.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\d{8,15})/g)].map((m) => m[1]))].slice(0, 2);
  const links = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi)) {
    const txt = dec(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (txt && txt.length < 60 && (SELL_RE.test(txt) || SELL_RE.test(m[1]))) {
      let href = m[1]; try { href = new URL(href, res.final).href; } catch { /* keep */ }
      if (!links.some((l) => l.href === href)) links.push({ text: txt, href });
    }
    if (links.length >= 6) break;
  }
  return { title, desc, brandMatch, uaeMention: uae, emirates_mentioned: emirates, emails, tels, whatsapp: wa, seller_or_supplier_links: links };
}
(async () => {
  const out = [];
  const queue = [...cands];
  const worker = async () => {
    while (queue.length) {
      const c = queue.shift();
      let used = null, res = null;
      for (const u of c.urls) { res = await get(u); used = u; if (res.status >= 200 && res.status < 400 && res.html.length > 500) break; }
      const a = res && res.status ? analyse(c, res) : {};
      out.push({ ...c, tried: used, http_status: res ? res.status : 0, final_url: res ? res.final : null, fetch_error: res ? res.error || null : null, ...a });
      process.stdout.write(`${String(res ? res.status : 0).padEnd(4)} ${c.name.padEnd(34)} ${(a.brandMatch === undefined ? '-' : a.brandMatch ? 'name✓' : 'name✗').padEnd(6)} ${a.uaeMention ? 'UAE✓' : 'UAE✗'} ${a.title ? a.title.slice(0, 50) : ''}\n`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  out.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
  console.log('\nverified file written:', process.argv[3], '| reachable:', out.filter((o) => o.http_status >= 200 && o.http_status < 400).length, '/', out.length);
})();
