// =============================================================
// Turkey address API (turkiyeapi.dev) — live, official İl/İlçe/Mahalle.
// Used to autocomplete the Mahalle (neighborhood) once a district is
// chosen. Falls back gracefully to free-text if the API is unreachable.
// =============================================================

let provincesCache = null;
const neighCache = {};

const norm = (s) => String(s || '').trim().toLocaleLowerCase('tr-TR');

async function loadProvinces() {
  if (provincesCache) return provincesCache;
  try {
    const r = await fetch('https://turkiyeapi.dev/api/v1/provinces?fields=districts');
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
    const r = await fetch(`https://turkiyeapi.dev/api/v1/neighborhoods?districtId=${dist.id}&limit=3000`);
    const j = await r.json();
    const names = [...new Set((j.data || []).map((n) => n.name).filter(Boolean))];
    neighCache[key] = names;
    return names;
  } catch { return []; }
}
