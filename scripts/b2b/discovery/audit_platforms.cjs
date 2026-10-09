// Audits sales-platform candidates against their OWN public pages (no login, no CAPTCHA bypass, ~1.2s between requests).
// Records only what the pages actually contain. Unknown = empty. Blocked pages (403/429/challenge) are flagged, never guessed.
// usage: node audit_platforms.cjs <candidates.json> <out.json> [workDir]
//   candidates.json = [{ name, url, channel_type, ... }]
const fs = require('fs');
const path = require('path');
const [inFile, outFile, workDir = '.'] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');
const strip = (h) => dec(h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');

async function get(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en,ar;q=0.8', Accept: 'text/html,*/*' }, redirect: 'follow', signal: ctl.signal });
      const html = Buffer.from(await r.arrayBuffer()).subarray(0, 1200000).toString('utf8');
      if ((r.status === 429 || r.status >= 500) && attempt === 0) { await sleep(4000); continue; }
      return { status: r.status, final: r.url, html };
    } catch (e) { if (attempt === 1) return { status: 0, error: String(e.cause?.code || e.message || e).slice(0, 60), html: '' }; await sleep(2000); } finally { clearTimeout(t); }
  }
}
const CHALLENGE = /(attention required|just a moment|cf-chk|captcha|access denied|enable javascript and cookies|pardon our interruption|request unsuccessful)/i;
const UAE_RE = /(united arab emirates|\buae\b|dubai|abu dhabi|sharjah|ajman|الإمارات|دبي|أبوظبي|\bAED\b|د\.إ|en-ae|\/ae[-\/])/i;
const LINK_RE = /(sell|seller|vendor|supplier|supply|partner|wholesale|b2b|merchant|become|join[- ]us|list[- ]your|brand[- ]?(onboard|apply|partner)|for[- ]brands|distribut|affiliate|work[- ]with[- ]us|بائع|مورد|شراكة|تاجر|انضم)/i;
const SELL_TEXT = /(sell on|sell with|become a (seller|vendor|supplier|partner)|start selling|register as a (seller|vendor)|seller registration|vendor registration|supplier registration|list your (products|brand)|brand partnerships?|partner with us|sell your products|bulk|wholesale)/i;

function analyse(c, res) {
  const html = res.html || '';
  const body = strip(html);
  const title = dec((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const desc = dec((html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) || [])[1] || '').trim().slice(0, 240);
  const blocked = res.status === 403 || res.status === 429 || res.status === 503 || CHALLENGE.test(title) || (html.length < 3000 && CHALLENGE.test(html));
  let base; try { base = new URL(res.final || c.url); } catch { base = null; }
  const links = [];
  const seen = new Set();
  for (const m of html.matchAll(/<a\b[^>]*?href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = strip(m[2]).slice(0, 80);
    if (!(LINK_RE.test(m[1]) || LINK_RE.test(text))) continue;
    if (/^(mailto|tel|javascript):/i.test(m[1])) continue;
    let u; try { u = new URL(dec(m[1]), base || undefined).href; } catch { continue; }
    if (/best-?sellers?|seller-?rank|bestsell/i.test(u)) continue;
    if (seen.has(u)) continue; seen.add(u); links.push({ url: u, text });
  }
  const emails = [...new Set((html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []))].filter((e) => !/\.(png|jpe?g|svg|webp|gif)$/i.test(e) && !/sentry|example\.|wixpress|domain\.com|yourname|@2x/i.test(e)).slice(0, 5);
  const tels = [...new Set((body.match(/(?:\+|00)?971[\s-]?\(?\d{1,2}\)?[\s-]?\d{3}[\s-]?\d{3,4}|\b800[\s-]?\d{3,8}\b/g) || []))].slice(0, 3);
  return { http_status: res.status, final_url: res.final || '', fetch_error: res.error || null, blocked, title, desc, uae_signal: UAE_RE.test(title + ' ' + desc + ' ' + body.slice(0, 60000) + ' ' + (res.final || '')), seller_signal_text: SELL_TEXT.test(body) ? (body.match(SELL_TEXT) || [])[0] : null, candidate_links: links.slice(0, 12), emails, tels };
}
const COMM_RE = /([^.]{0,120}\b(commission|referral fee|fee schedule|subscription fee|monthly fee|registration fee|no (monthly|listing|setup) fee)\b[^.]{0,140})/i;
function snippets(html) { const body = strip(html); const out = []; for (const m of body.matchAll(new RegExp(COMM_RE.source, 'gi'))) { out.push(m[1].trim().slice(0, 260)); if (out.length >= 2) break; } return out; }

(async () => {
  const cands = JSON.parse(fs.readFileSync(inFile, 'utf8'));
  const rawDir = path.join(workDir, 'raw_audit'); fs.mkdirSync(rawDir, { recursive: true });
  const out = [];
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    const url = String(c.url || '').replace(/\s+/g, '').replace(/^https?:\/\/(?=\/)/, '');
    const rec = { ...c, url, audited_at: '2026-10-09' };
    if (!/^https?:\/\/[^/]+\.[a-z]/i.test(url)) { rec.audit = { http_status: 0, fetch_error: 'invalid_url' }; out.push(rec); continue; }
    const res = await get(url);
    fs.writeFileSync(path.join(rawDir, `p${i}.html`), res.html || '');
    rec.audit = analyse(c, res);
    // follow up to 4 most relevant seller/supplier links on the SAME registrable site family, verify they load, capture fee snippets
    rec.followed = [];
    const host = (() => { try { return new URL(rec.audit.final_url || url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    const root = host.split('.').slice(-2).join('.');
    const rank = (l) => (/sell|seller|vendor|supplier|become|register|join/i.test(l.url + ' ' + l.text) ? 0 : 1);
    const cand = rec.audit.candidate_links.filter((l) => { try { return new URL(l.url).hostname.replace(/^www\./, '').endsWith(root) || /seller|supplier|vendor|partner/i.test(new URL(l.url).hostname); } catch { return false; } }).sort((a, b) => rank(a) - rank(b)).slice(0, 4);
    for (const l of cand) {
      await sleep(1200);
      const r2 = await get(l.url);
      const a2 = analyse({ url: l.url }, r2);
      rec.followed.push({ url: l.url, link_text: l.text, http_status: r2.status, final_url: r2.final || '', title: a2.title, blocked: a2.blocked, seller_signal_text: a2.seller_signal_text, fee_snippets: snippets(r2.html || ''), emails: a2.emails });
    }
    out.push(rec);
    process.stdout.write(`${i + 1}/${cands.length} ${c.name} -> ${rec.audit.http_status}${rec.audit.blocked ? ' BLOCKED' : ''} links:${rec.audit.candidate_links.length} followed:${rec.followed.length}\n`);
    fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
    await sleep(1200);
  }
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
})();
