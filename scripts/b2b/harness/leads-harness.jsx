/* eslint-disable react-refresh/only-export-components -- dev-only harness entry, never hot-reloaded */
// DEV-ONLY harness (D-119): mounts «ليدز B2B» for Syria + UAE without login and without touching Supabase.
// Syria rows: fake `supabase.from('syria_b2b_leads')` (the old direct path). UAE rows: fake `functions.invoke('b2b-leads')`.
// Every row below is FAKE (وهمي). The real routes + ProtectedRoute + permissions are used, so personas show the real gating.
// Open via the Vite dev server: /scripts/b2b/harness/leads.html?persona=admin&route=/uae-leads
//   persona = admin | granted | denied | none | syria      route = /uae-leads | /syria-leads
// Never shipped: not part of the app bundle.
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import '../../../src/styles/theme.css';
import '../../../src/styles/globals.css';
import { supabase } from '../../../src/services/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import { ProtectedRoute } from '../../../src/routes/ProtectedRoute';
import { ROUTES } from '../../../src/routes/paths';
import { PERMISSIONS as P } from '../../../src/data/permissions';
import { ROLES } from '../../../src/data/teams';
import { normalizeRegion, normalizeCity, waLinkFor } from '../../../supabase/functions/_shared/countries.js';
import SyriaLeadsScreen from '../../../src/screens/SyriaLeadsScreen.jsx';

const qs = new URLSearchParams(location.search);
const PERSONAS = {
  admin:   { role: 'admin', name: 'أدمن وهمي' },
  granted: { role: 'employee', name: 'موظفة إمارات (وهمي)', extra_permissions: ['view_uae_leads'], denied_permissions: [] },
  denied:  { role: 'employee', name: 'ممنوحة ثم محجوبة (وهمي)', extra_permissions: ['view_uae_leads'], denied_permissions: ['view_uae_leads'] },
  none:    { role: 'employee', name: 'بلا صلاحية (وهمي)' },
  syria:   { role: 'employee', name: 'موظفة سوريا (وهمي)', extra_permissions: ['view_syria_leads'] },
};
const personaKey = PERSONAS[qs.get('persona')] ? qs.get('persona') : 'admin';
const me = PERSONAS[personaKey];
useAuthStore.setState({ session: { ...me, team: 'sales' }, isAuthenticated: true, ready: true });

const day = (d) => new Date(Date.now() - d * 864e5).toISOString();
const base = { status: 'not_contacted', priority: 'C', score: 35, lead_type: 'online', notes: null, discovered_at: day(30), last_verified_at: day(1), created_at: day(30) };
const rows = [
  { ...base, id: 'SYR-ONL-T1', country: 'SY', province: 'Nationwide', name: 'متجر سوري وهمي', category: 'متجر أونلاين — تجميل', channel: 'website', website: 'https://fake-sy-store.example', accepts_sellers: true, sells_beauty: true, lowes_presence: 'not_listed', source_urls: 'https://example.com/sy1' },
  { ...base, id: 'SYR-DAM-T2', country: 'SY', province: 'Damascus', name: 'صيدلية دمشق الوهمية', lead_type: 'physical', category: 'صيدلية', phone: '0999000001', phone_tel: 'tel:0999000001', priority: 'B', score: 55, lowes_presence: 'not_listed', source_urls: 'https://example.com/sy2' },
  { ...base, id: 'UAE-ONL-T1', country: 'AE', province: 'Nationwide', name: 'Fake Marketplace AE (وهمي)', category: 'منصة متعددة البائعين', channel: 'marketplace', website: 'https://fake-marketplace.example', accepts_sellers: true, lowes_presence: 'unverified', score: 45, source_urls: 'https://example.com/ae1', reason: 'وهمي — للمعاينة فقط. يحتاج تحقق: قبول فئة التجميل، العمولة، تسجيل المنتجات.' },
  { ...base, id: 'UAE-ONL-T2', country: 'AE', province: 'Dubai', name: 'Fake Dubai Beauty (وهمي)', category: 'متجر أونلاين — تجميل', channel: 'website', website: 'https://fake-dubai-beauty.example', sells_beauty: true, lowes_presence: 'in_talks', discovered_at: day(2), source_urls: 'https://example.com/ae2' },
  { ...base, id: 'UAE-PHY-T3', country: 'AE', province: 'Abu Dhabi', city: 'Al Ain', name: 'صيدلية العين الوهمية', lead_type: 'physical', category: 'صيدلية', whatsapp: '0501234567', whatsapp_link: 'https://wa.me/971501234567', priority: 'B', score: 50, lowes_presence: 'unverified', source_urls: 'https://example.com/ae3' },
  { ...base, id: 'UAE-PHY-T4', country: 'AE', province: 'Sharjah', name: 'Fake Distributor Sharjah (وهمي)', lead_type: 'physical', category: 'موزّع', priority: 'D', score: 15, lowes_presence: 'unverified', source_urls: 'https://example.com/ae4' },
];
const log = (...a) => console.info('[harness]', ...a);
const ok = (data) => ({ data, error: null });

// ── Syria: fake direct table access (after the migration, RLS lets the browser see Syria rows only) ──
class Q {
  constructor() { this.f = []; this.op = 'select'; }
  select() { return this; }
  order() { return this; }
  eq(c, v) { this.f.push((r) => r[c] === v); return this; }
  update(p) { this.op = 'update'; this.p = p; return this; }
  insert(p) { this.op = 'insert'; this.p = p; return this; }
  then(res) {
    const visible = rows.filter((r) => r.country === 'SY');
    if (this.op === 'select') return res(ok(visible.filter((r) => this.f.every((fn) => fn(r))).sort((a, b) => b.score - a.score)));
    if (this.op === 'update') { visible.filter((r) => this.f.every((fn) => fn(r))).forEach((r) => Object.assign(r, this.p)); log('SY update', this.p); return res(ok(null)); }
    rows.unshift({ country: 'SY', ...this.p }); log('SY insert', this.p.id); return res(ok(null));
  }
}
Object.defineProperty(supabase, 'from', { value: () => new Q(), configurable: true });

// ── UAE: fake b2b-leads edge function (same permission rule as the server) ──
const refused = { data: null, error: { message: 'no permission', context: { status: 403, clone: () => ({ json: async () => ({ ok: false, error: 'no permission', message: 'ما عندك صلاحية ليدز الإمارات' }) }) } } };
const invoke = async (_name, { body }) => {
  await new Promise((r) => setTimeout(r, 120));
  const allowed = me.role === 'admin' || ((me.extra_permissions || []).includes('view_uae_leads') && !(me.denied_permissions || []).includes('view_uae_leads'));
  if (body.country !== 'AE') return ok({ ok: false, error: 'country_not_served' });
  if (!allowed) return refused;
  const own = (id) => rows.find((r) => r.id === id && r.country === 'AE');
  const stamp = new Date().toISOString();
  if (body.action === 'list') return ok({ ok: true, rows: rows.filter((r) => r.country === 'AE').sort((a, b) => b.score - a.score) });
  if (body.action === 'update_status') { const r = own(body.id); Object.assign(r, { status: body.status, notes: body.notes || null, status_updated_at: stamp, status_updated_by: me.name }); log('AE status', body); return ok({ ok: true, row: r }); }
  if (body.action === 'update_presence') { const r = own(body.id); Object.assign(r, { lowes_presence: body.lowes_presence, lowes_listing_url: body.lowes_listing_url || null, presence_updated_at: stamp, presence_updated_by: me.name }); log('AE presence', body); return ok({ ok: true, row: r }); }
  if (body.action === 'add') {
    const src = body.row;
    const province = normalizeRegion('AE', src.province);
    if (!src.name?.trim() || !province) return ok({ ok: false, error: 'الاسم والإمارة مطلوبان' });
    if (rows.some((r) => r.country === 'AE' && r.province === province && r.name.toLowerCase() === src.name.trim().toLowerCase())) return ok({ ok: false, error: 'موجود مسبقاً' });
    const row = { ...base, id: `UAE-ONA-${Date.now()}`, country: 'AE', name: src.name.trim(), province, city: normalizeCity('AE', src.city), lead_type: src.lead_type, category: src.category, website: src.website || null, whatsapp: src.whatsapp || null, whatsapp_link: waLinkFor(src.whatsapp, '971') || null, lowes_presence: 'unverified', priority: 'C', score: 40, added_manually: true, added_by: me.name, discovered_at: stamp, source_urls: null };
    rows.unshift(row); log('AE add', row.id);
    return ok({ ok: true, row });
  }
  return ok({ ok: false, error: 'unknown action' });
};
Object.defineProperty(supabase, 'functions', { value: { invoke }, configurable: true });

function Bar() {
  return (
    <div dir="rtl" style={{ fontSize: 12, padding: '6px 10px', background: '#fff7e6', borderBottom: '1px solid #f0d9a8' }}>
      🧪 Harness وهمي — الشخصية: <b>{personaKey}</b> ({me.name}) ·{' '}
      {Object.keys(PERSONAS).map((p) => <a key={p} href={`?persona=${p}&route=${qs.get('route') || ROUTES.UAE_LEADS}`} style={{ marginInline: 4 }}>{p}</a>)}
      {' · '}<Link to={ROUTES.UAE_LEADS}>الإمارات</Link> · <Link to={ROUTES.SYRIA_LEADS}>سوريا</Link>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <MemoryRouter initialEntries={[qs.get('route') || ROUTES.UAE_LEADS]}>
    <Bar />
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 16 }}>
      <Routes>
        <Route path={ROUTES.HOME} element={<p dir="rtl" data-testid="home">🏠 الرئيسية — تم التحويل لأن الصلاحية غير متوفرة</p>} />
        <Route path={ROUTES.SYRIA_LEADS} element={<ProtectedRoute roles={[ROLES.ADMIN]} perm={P.VIEW_SYRIA_LEADS}><SyriaLeadsScreen key="SY" country="SY" /></ProtectedRoute>} />
        <Route path={ROUTES.UAE_LEADS} element={<ProtectedRoute roles={[ROLES.ADMIN]} perm={P.VIEW_UAE_LEADS}><SyriaLeadsScreen key="AE" country="AE" /></ProtectedRoute>} />
      </Routes>
    </div>
  </MemoryRouter>,
);
