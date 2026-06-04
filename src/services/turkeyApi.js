// =============================================================
// Turkey address API (turkiyeapi.dev) — live, official İl/İlçe/Mahalle.
// Used to autocomplete the Mahalle (neighborhood) once a district is
// chosen. Falls back gracefully to free-text if the API is unreachable.
// =============================================================

let provincesCache = null;
const neighCache = {};

const norm = (s) => String(s || '').trim().toLocaleLowerCase('tr-TR');
// Normalizer that also folds the dotted-i for index keys built offline.
const nkey = (s) => norm(s).replace('i̇', 'i');

// ── Streets (Sokak) — served as static per-district JSON from /public ──
// Source: official UAVT national address DB (1.2M streets), split per district.
// Free, same-origin, lazy-loaded; no external API / DB storage.
let streetIndexCache = null;          // { "cityNorm|districtNorm": districtId }
const streetDistrictCache = {};       // districtId -> { mahalleName: [streets] }

async function loadStreetIndex() {
  if (streetIndexCache) return streetIndexCache;
  try {
    streetIndexCache = await fetch('/tr-streets/index.json').then((r) => r.json());
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
