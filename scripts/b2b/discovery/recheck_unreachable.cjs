// Re-checks entities that failed the first automated audit (timeouts / DNS / odd statuses) with URL variants and longer timeouts.
// Public GET only; never bypasses Cloudflare/captcha/login. A page that answers with a challenge is reported as protected, not retried harder.
// usage: node recheck_unreachable.cjs <platforms.json> <out.json>
const fs = require('fs');
const [inFile, outFile] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
const j = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const targets = j.rows.filter((r) => r.tier === 'D' && ['unreachable'].includes(r.verification_status));
async function get(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en,ar;q=0.8' }, redirect: 'follow', signal: ctl.signal });
    const html = Buffer.from(await r.arrayBuffer()).subarray(0, 800000).toString('utf8');
    return { status: r.status, final: r.url, html };
  } catch (e) { return { status: 0, error: String(e.cause?.code || e.message).slice(0, 40), html: '' }; } finally { clearTimeout(t); }
}
(async () => {
  const out = [];
  for (const r of targets) {
    const base = r.url_guess_not_verified || r.official_website || r.url_in_source_file;
    let host = ''; try { host = new URL(base).hostname.replace(/^www\./, ''); } catch { /* */ }
    const variants = [...new Set([`https://www.${host}/`, `https://${host}/`, `http://${host}/`])].filter(() => host);
    let best = null;
    for (const v of variants) { const res = await get(v); if (!best || (res.status >= 200 && res.status < 400)) best = { ...res, tried: v }; if (res.status >= 200 && res.status < 400) break; await sleep(800); }
    const h = best?.html || '';
    const title = dec((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const desc = dec((h.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || [])[1] || '').slice(0, 200);
    out.push({ name: r.name, host, status: best?.status ?? 0, error: best?.error || null, final_url: best?.final || '', title, desc });
    console.log(r.name, '|', best?.status, best?.error || '', '|', title.slice(0, 60));
    await sleep(1000);
  }
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
})();
