// =============================================================
// Turkey address API (turkiyeapi.dev) — live, official İl/İlçe/Mahalle.
// Used to autocomplete the Mahalle (neighborhood) once a district is
// chosen. Falls back gracefully to free-text if the API is unreachable.
// =============================================================

let provincesCache = null;
const neighCache = {};

const norm = (s) => String(s || '').trim().toLocaleLowerCase('tr-TR');
// Index-key normalizer. The bundled UAVT index has INCONSISTENT i-family
// spelling (e.g. İstanbul «kadiköy» with dotted-i, combining-dot forms like
// «denizli̇»), while the district dropdowns use «Kadıköy» (dotless ı). Strip the
// combining dot above and fold dotless ı → i so both sides agree — otherwise
// Mahalle/Sokak never resolve for İstanbul & every other ı/İ district.
const nkey = (s) => norm(s).replace(/̇/g, '').replace(/ı/g, 'i');

// ── Streets (Sokak) — served as static per-district JSON from /public ──
// Source: official UAVT national address DB (1.2M streets), split per district.
// Free, same-origin, lazy-loaded; no external API / DB storage.
let streetIndexCache = null;          // { "cityNorm|districtNorm": districtId }
const streetDistrictCache = {};       // districtId -> { mahalleName: [streets] }

async function loadStreetIndex() {
  if (streetIndexCache) return streetIndexCache;
  try {
    const raw = await fetch('/tr-streets/index.json').then((r) => r.json());
    // Re-key every entry with nkey so lookups are robust to the dataset's own
    // inconsistent i/İ/ı spelling (raw keys mix «kadiköy», «denizli̇», …). Both
    // the index and the lookup go through nkey → İstanbul/Denizli/… now resolve.
    const m = {};
    for (const k in raw) {
      const p = String(k).split('|');
      m[nkey(p[0]) + '|' + nkey(p[1] || '')] = raw[k];
    }
    streetIndexCache = m;
  } catch { streetIndexCache = {}; }
  return streetIndexCache;
}

// Street suggestions for a chosen province + district + mahalle.
// Falls back to all streets of the district if the mahalle name doesn't match.
export async function fetchStreets(provinceName, districtName, mahalleName) {
  if (!provinceName || !districtName) return [];
  try {
    const idx = await loadStreetIndex();
    const did = idx[nkey(provinceName) + '|' + nkey(districtName)];
    if (!did) return [];
    let data = streetDistrictCache[did];
    if (!data) {
      data = await fetch(`/tr-streets/${did}.json`).then((r) => r.json());
      streetDistrictCache[did] = data;
    }
    if (mahalleName) {
      const target = nkey(mahalleName);
      const k = Object.keys(data).find((m) => nkey(m) === target);
      if (k) return data[k];
    }
    // No mahalle match → offer every street in the district (deduped).
    return [...new Set([].concat(...Object.values(data)))].sort();
  } catch { return []; }
}

// Neighborhood (Mahalle) names for a province + district, derived from the SAME
// bundled UAVT street dataset (the per-district JSON is keyed by mahalle name).
// This is offline, instant and ALWAYS available — unlike fetchNeighborhoods()
// below, which depends on the external turkiyeapi.dev API that is sometimes slow
// or unreachable (the cause of "Mahalle sometimes not picked"). Also guarantees
// the Mahalle list and the Sokak list come from one consistent source.
export async function fetchMahalles(provinceName, districtName) {
  if (!provinceName || !districtName) return [];
  try {
    const idx = await loadStreetIndex();
    const did = idx[nkey(provinceName) + '|' + nkey(districtName)];
    if (!did) return [];
    let data = streetDistrictCache[did];
    if (!data) {
      data = await fetch(`/tr-streets/${did}.json`).then((r) => r.json());
      streetDistrictCache[did] = data;
    }
    return Object.keys(data).filter(Boolean).sort((a, b) => a.localeCompare(b, 'tr'));
  } catch { return []; }
}

async function loadProvinces() {
  if (provincesCache) return provincesCache;
  try {
    // NB: must request `name` too — `fields=districts` alone drops the province
    // name, so the name match below always failed (Mahalle never autocompleted).
    const r = await fetch('https://turkiyeapi.dev/api/v1/provinces?fields=name,districts');
    const j = await r.json();
    provincesCache = j.data || [];
  } catch { provincesCache = []; }
  return provincesCache;
}

// Neighborhood (Mahalle) names for a province + district. Cached.
export async function fetchNeighborhoods(provinceName, districtName) {
  if (!provinceName || !districtName) return [];
  const key = norm(provinceName) + '|' + norm(districtName);
  if (neighCache[key]) return neighCache[key];
  try {
    const provs = await loadProvinces();
    const prov = provs.find((p) => norm(p.name) === norm(provinceName));
    if (!prov) return [];
    const dist = (prov.districts || []).find((d) => norm(d.name) === norm(districtName));
    if (!dist) return [];
    // limit=3000 exceeds the API's max page size and returns 0 rows; 1000 is safe
    // (any single district has far fewer than 1000 neighborhoods).
    const r = await fetch(`https://turkiyeapi.dev/api/v1/neighborhoods?districtId=${dist.id}&limit=1000`);
    const j = await r.json();
    const names = [...new Set((j.data || []).map((n) => n.name).filter(Boolean))];
    neighCache[key] = names;
    return names;
  } catch { return []; }
}
