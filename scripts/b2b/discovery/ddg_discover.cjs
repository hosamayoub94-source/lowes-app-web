// Runs many public search queries on DuckDuckGo's HTML endpoint (no login; stops immediately if a challenge/captcha appears)
// and collects candidate DOMAINS (not pages). Output = unique candidate list for audit_platforms.cjs. Nothing is verified here.
// usage: node ddg_discover.cjs <queries.txt> <out.json> [excludeDomainsFile.json]
const fs = require('fs');
const [qFile, outFile, exFile] = process.argv.slice(2);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const queries = fs.readFileSync(qFile, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const exclude = new Set(exFile ? JSON.parse(fs.readFileSync(exFile, 'utf8')) : []);
// aggregator / media / social / marketplaces-we-know domains that are results but not candidate channels
const NOISE = /(google\.|bing\.|duckduckgo\.|facebook\.|instagram\.|twitter\.|x\.com|linkedin\.|youtube\.|tiktok\.com|pinterest\.|wikipedia\.|reddit\.|quora\.|medium\.|blogspot\.|wordpress\.com|gulfnews|khaleejtimes|thenationalnews|arabianbusiness|harpersbazaar|vogue|cosmopolitan\.com|elle\.|emirateswoman|timeout|hidubai|tripadvisor|yelp|bayut|propertyfinder|dubizzle|justdial|yellowpages|indeed|glassdoor|bayt\.|naukri|crunchbase|zoominfo|apollo\.io|lusha|rocketreach|dnb\.com|opencorporates|alibaba|aliexpress|amazon\.|noon\.com|ebay|trustpilot|sortlist|clutch|mordor|marketresearch|statista|imarc|grandview|meydanfz|virtuzone|shuraa|ripple|rizmona|dubaisouth|saif-zone|ifza|freezone|businessbay|setup|company-formation|cbinsights|tracxn|owler|ensun|oncosmetics|cphi|exhibitor|messefrankfurt|jufair|eventbrite|ipi\.ph|projectsegy|scribd|slideshare|pdf|\.gov\.|\.edu)/i;
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
(async () => {
  const found = new Map(); let stopped = null;
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    try {
      const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), { headers: { 'User-Agent': UA, 'Accept-Language': 'en,ar;q=0.8' } });
      const h = await r.text();
      if (r.status !== 200 || /anomaly|captcha|unusual traffic|are you a human/i.test(h.slice(0, 5000))) { stopped = `challenge/http ${r.status} at query ${i + 1}`; break; }
      let n = 0;
      for (const m of h.matchAll(/result__a" href="([^"]+)"/g)) {
        const real = decodeURIComponent((m[1].match(/uddg=([^&]+)/) || [])[1] || '');
        const d = domainOf(real); if (!d || NOISE.test(d) || exclude.has(d)) continue;
        const e = found.get(d) || { domain: d, first_url: real, queries: [] }; if (!e.queries.includes(q)) e.queries.push(q); found.set(d, e); n++;
      }
      process.stdout.write(`${i + 1}/${queries.length} +${n} ${q}\n`);
    } catch (e) { process.stdout.write(`${i + 1} error ${String(e.message).slice(0, 40)}\n`); }
    await sleep(3500);
  }
  fs.writeFileSync(outFile, JSON.stringify({ stopped, total_domains: found.size, domains: [...found.values()].sort((a, b) => b.queries.length - a.queries.length) }, null, 1));
  console.log('domains', found.size, stopped ? 'STOPPED: ' + stopped : '');
})();
