// Samples talabat public "pharmacies in <area>" pages across ALL emirates and collects pharmacy vendors (brand, branch, area, city, link).
// Public pages only, no login, ~2s between requests. Output: talabat_pharmacies.json
const fs = require('fs');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextData = (h) => { const m = h.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/); return m ? JSON.parse(m[1]) : null; };
const PER_CITY = { 'Dubai': 12, 'Abu Dhabi': 7, 'Sharjah': 8, 'Ajman': 5, 'Al Ain': 5, 'Ras Al Khaima': 5 };   // other cities: all areas (they are small)
const PROVINCE = { 'Dubai': 'Dubai', 'Abu Dhabi': 'Abu Dhabi', 'Al Ain': 'Abu Dhabi', 'Sharjah': 'Sharjah', 'Ajman': 'Ajman', 'Ras Al Khaima': 'Ras Al Khaimah', 'Fujairah': 'Fujairah', 'Umm Al Quwain': 'Umm Al Quwain' };

(async () => {
  const idx = nextData(fs.readFileSync('raw/tb/all_areas.html', 'utf8'));
  const groups = Object.values(idx.props.pageProps.areas);
  const plan = [];
  for (const areas of groups) {
    const city = areas[0].cityName;
    const n = PER_CITY[city] ?? Math.min(areas.length, 4);
    const step = Math.max(1, Math.floor(areas.length / n));
    for (let i = 0; i < areas.length && plan.filter((p) => p.city === city).length < n; i += step) plan.push({ city, id: areas[i].id, slug: areas[i].slug, name: areas[i].name });
  }
  console.log('cities:', [...new Set(plan.map((p) => p.city))].join(', '), '| area pages planned:', plan.length);
  const vendors = new Map(); let ok = 0, fail = 0;
  for (const a of plan) {
    const url = `https://www.talabat.com/uae/pharmacies/${a.id}/${a.slug}`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
      const h = await r.text();
      const j = r.ok ? nextData(h) : null;
      const list = j?.props?.pageProps?.vendors || [];
      ok++;
      for (const v of list) {
        const key = `${v.branchId || v.id}`;
        if (!vendors.has(key)) vendors.set(key, { brand: (v.name || '').trim(), branch: (v.branchName || '').trim(), area_listed: v.areaName || a.name, city: a.city, province: PROVINCE[a.city] || null, branch_url: v.branchUrl ? `https://www.talabat.com${v.branchUrl.startsWith('/') ? '' : '/'}${v.branchUrl}` : null, accept_cash: v.acceptCash ?? null, sample_area_page: url });
      }
    } catch (e) { fail++; }
    await sleep(2000);
  }
  const all = [...vendors.values()];
  fs.writeFileSync('talabat_pharmacies.json', JSON.stringify({ fetched_pages: ok, failed: fail, vendors: all }, null, 1));
  const brands = new Map(); all.forEach((v) => { const b = v.brand.toLowerCase().replace(/\s+/g, ' '); (brands.get(b) || brands.set(b, []).get(b)).push(v); });
  console.log('pages ok', ok, 'failed', fail, '| branches', all.length, '| brands', brands.size);
  console.log('by city:', Object.entries(all.reduce((m, v) => (m[v.city] = (m[v.city] || 0) + 1, m), {})).map(([c, n]) => `${c}:${n}`).join(' '));
})();
