/* eslint-env node */
// D-119 — client-side checks for the UAE B2B leads section (no network, no DB):
//   • the 4 access cases on the client layer: menu item + route rule (role OR permission) + which countries the screen shows
//   • Syria's provinces/labels/presence values are exactly the pre-D-119 values (no behaviour change)
//   • the central country config (7 emirates + Al Ain, Arabic aliases, WhatsApp 971, website key = DB index rule)
//   • computeInsights with the new 'unverified' presence and per-country regions
// Run: node test-b2b-leads-client.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const root = process.cwd();

// Bundle the real modules; the Supabase client is replaced by a stub (never called here).
const entry = `
  export * as perms from './src/data/permissions.js';
  export * as nav from './src/data/navigation.js';
  export * as svc from './src/services/syriaLeadsService.js';
  export * as countries from './supabase/functions/_shared/countries.js';
`;
const stubSupabase = { name: 'stub-supabase', setup(b) { b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => (a.importer.includes('services') ? { path: 'stub', namespace: 'stub' } : undefined)); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const supabase = {};' })); } };
const out = path.join(root, '.tmp-b2b-client.mjs');
await build({ stdin: { contents: entry, resolveDir: root, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, plugins: [stubSupabase], logLevel: 'silent' });
let m;
try { m = await import(pathToFileURL(out).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(out); }
const { perms, nav, svc, countries } = m;
const P = perms.PERMISSIONS;

// ── 4 access cases (+ Syria-only) on the client layer ──
const personas = {
  admin: { role: 'admin' },
  granted: { role: 'employee', extra_permissions: ['view_uae_leads'], denied_permissions: [] },
  denied: { role: 'employee', extra_permissions: ['view_uae_leads'], denied_permissions: ['view_uae_leads'] },
  none: { role: 'employee' },
  syriaOnly: { role: 'employee', extra_permissions: ['view_syria_leads'] },
};
const expectCountries = { admin: ['SY', 'AE'], granted: ['AE'], denied: [], none: [], syriaOnly: ['SY'] };
const rows = [];
for (const [k, session] of Object.entries(personas)) {
  const set = perms.resolvePermissions(session);
  const menu = nav.navItemsForRole(session.role, set).map((i) => i.id);
  // ProtectedRoute rule (src/routes/ProtectedRoute.jsx): roles [admin] OR perm
  const routeUae = session.role === 'admin' || set.has(P.VIEW_UAE_LEADS);
  const routeSy = session.role === 'admin' || set.has(P.VIEW_SYRIA_LEADS);
  // CountrySwitcher rule (SyriaLeadsScreen.jsx)
  const visible = countries.enabledCountries().filter((c) => c.leadsPermission && perms.sessionCan(session, c.leadsPermission)).map((c) => c.code);
  ok(JSON.stringify(visible) === JSON.stringify(expectCountries[k]), `${k}: countries ${visible}`);
  ok(menu.includes('uae-leads') === expectCountries[k].includes('AE') && routeUae === expectCountries[k].includes('AE'), `${k}: UAE menu/route`);
  ok(menu.includes('syria-leads') === expectCountries[k].includes('SY') && routeSy === expectCountries[k].includes('SY'), `${k}: Syria menu/route unchanged`);
  rows.push({ persona: k, uaeMenu: menu.includes('uae-leads'), uaeRoute: routeUae, syriaRoute: routeSy, countries: visible.join(',') || '—' });
}
console.table(rows);
ok(countries.COUNTRIES.AE.leadsPermission === P.VIEW_UAE_LEADS && countries.COUNTRIES.SY.leadsPermission === P.VIEW_SYRIA_LEADS, 'config permissions = app permission keys');
ok(perms.PERMISSION_GROUPS.some((g) => g.permissions.includes(P.VIEW_UAE_LEADS)) && perms.PERMISSION_LABELS[P.VIEW_UAE_LEADS] && perms.PERMISSION_DESCRIPTIONS[P.VIEW_UAE_LEADS], 'UAE permission appears in the admin editor (group + label + description)');
const defaults = Object.entries(perms.ROLE_PERMISSIONS).filter(([r, list]) => r !== 'admin' && list.includes(P.VIEW_UAE_LEADS));
ok(defaults.length === 0, 'no role gets UAE leads by default (per-user grant only)');

// ── Syria unchanged ──
const OLD_PROVINCES = ['Damascus', 'Rif Damascus', 'Aleppo', 'Homs', 'Hama', 'Latakia', 'Tartous', 'Idlib', 'Daraa', 'Sweida', 'Quneitra', 'Deir Ezzor', 'Raqqa', 'Hasakah'];
ok(JSON.stringify(svc.PROVINCES) === JSON.stringify(OLD_PROVINCES), 'Syria PROVINCES identical to before');
ok(svc.PROVINCE_LABELS_AR.Tartous === 'طرطوس' && svc.PROVINCE_LABELS_AR.Hasakah === 'الحسكة' && Object.keys(svc.PROVINCE_LABELS_AR).length === 14, 'Syria labels identical');
ok(JSON.stringify(Object.keys(svc.PRESENCE_LABELS)) === JSON.stringify(['not_listed', 'contacted', 'in_talks', 'listed', 'rejected', 'not_applicable']), 'Syria presence options unchanged (no "unverified" for Syria)');
ok(svc.PRESENCE_LABELS_WITH_UNVERIFIED.unverified === 'غير متحقق', 'UAE presence has "غير متحقق"');
ok(svc.waLink('0912345678') === 'https://wa.me/963912345678', 'Syria waLink unchanged');

// ── central config ──
const C = countries;
ok(C.COUNTRIES.AE.regions.length === 7 && C.COUNTRIES.AE.cities['Abu Dhabi'].includes('Al Ain'), '7 emirates + Al Ain under Abu Dhabi');
ok(['أبوظبي', 'دبي', 'الشارقة', 'عجمان', 'أم القيوين', 'رأس الخيمة', 'الفجيرة'].every((ar) => C.normalizeRegion('AE', ar)), 'every Arabic emirate name maps to a key');
ok(C.normalizeRegion('AE', 'dubai') === 'Dubai' && C.normalizeRegion('AE', 'Damascus') === null && C.normalizeRegion('SY', 'Dubai') === null, 'regions never cross countries');
ok(C.normalizeRegion('AE', 'على مستوى الإمارات') === C.NATIONWIDE && C.regionLabelAr('AE', 'Nationwide') === 'على مستوى الإمارات' && C.COUNTRIES.AE.nationwideLabel !== C.COUNTRIES.AE.allRegionsLabel && C.regionLabelAr('SY', 'Nationwide') === 'كل سوريا', 'Nationwide per country');
ok(C.normalizeCity('AE', 'العين') === 'Al Ain' && C.cityLabelAr('AE', 'Al Ain') === 'العين', 'Al Ain city both ways');
ok(C.waLinkFor('0501234567', '971') === 'https://wa.me/971501234567' && C.waLinkFor('+971 50 123 4567', '971') === 'https://wa.me/971501234567', 'UAE WhatsApp links');
ok(C.websiteKey('https://www.Noon.com/') === 'noon.com' && C.websiteKey('http://noon.com') === 'noon.com', 'website key = DB unique-index normalisation');
ok(C.countryOfMarket('uae').code === 'AE' && C.countryOfMarket('syria').code === 'SY', 'orders market ↔ ISO mapping');
ok(C.COUNTRIES.AE.currency === 'AED' && C.COUNTRIES.AE.phoneCc === '971', 'AED + 971');
ok(!C.enabledCountries().some((c) => c.code === 'TR'), 'Turkey defined but disabled');

// ── insights ──
const leads = [
  { id: '1', province: 'Dubai', lead_type: 'online', lowes_presence: 'unverified', accepts_sellers: true, score: 40, status: 'not_contacted', phone: '050' },
  { id: '2', province: 'Dubai', lead_type: 'online', lowes_presence: 'listed', score: 30, status: 'contacted' },
  { id: '3', province: 'Nationwide', lead_type: 'physical', score: 20, status: 'customer' },
];
const ins = svc.computeInsights(leads, C.COUNTRIES.AE.regions);
ok(ins.online.presence.unverified === 1 && ins.online.presence.listed === 1 && !Number.isNaN(ins.online.presence.unverified), 'unverified counted (no NaN)');
ok(ins.missingProvinces.length === 6 && !ins.missingProvinces.includes('Dubai') && ins.missingProvinces.includes('Fujairah'), 'missing emirates computed from UAE regions');
ok(ins.online.sellerPlatformsGap.length === 1, 'unverified seller platform counts as a gap');
const insSy = svc.computeInsights([{ province: 'Damascus', lead_type: 'physical', status: 'not_contacted' }]);
ok(insSy.missingProvinces.length === 13, 'Syria insights default unchanged');

console.log(`b2b-leads client: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
