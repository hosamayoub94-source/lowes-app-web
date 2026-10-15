/* eslint-disable react-refresh/only-export-components -- dev-only harness entry, never hot-reloaded */
// DEV-ONLY harness (لوحة الميديا باير v2): يركّب «الحملات» + «لوحة الميديا باير» + «تقريري اليومي»
// بلا دخول وبلا اتصال بـSupabase — supabase.from مستبدَلة بجداول وهمية بالذاكرة. كل البيانات وهمية.
// افتحه عبر Vite dev: /scripts/media-buyer/harness/campaigns.html?persona=buyer&screen=campaigns
//   persona = buyer (ميديا باير) | emp (موظفة مكلّفة «ريم وهمية»)
//   screen  = campaigns | board | report
// لا يُشحن: ليس جزءاً من حزمة التطبيق.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../../../src/styles/theme.css';
import '../../../src/styles/globals.css';
import { supabase } from '../../../src/services/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import CampaignsScreen from '../../../src/screens/CampaignsScreen.jsx';
import MediaBuyerBoardScreen from '../../../src/screens/MediaBuyerBoardScreen.jsx';
import DailyReportScreen from '../../../src/screens/DailyReportScreen.jsx';

const qs = new URLSearchParams(location.search);
const PERSONAS = {
  buyer: { role: 'media_buyer', name: 'أولغا وهمية', team: 'ميديا' },
  emp:   { role: 'employee', name: 'ريم وهمية', team: 'تركيا' },
};
const me = PERSONAS[qs.get('persona')] || PERSONAS.buyer;
useAuthStore.setState({ session: { ...me }, isAuthenticated: true, ready: true });

// ── تواريخ ──
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const ts = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

// ── جداول وهمية ──
let seq = 1;
const id = (p) => `${p}-${seq++}`;
const db = {
  campaigns: [
    { id: 'c1', name: 'حملة سيروم الخريف (وهمي)', team: 'تيم Lowes تركيا', status: 'active', is_active: true, members: ['ريم وهمية', 'سارة وهمية', 'لينا وهمية'], manager_name: 'أولغا وهمية', budget_usd: 0, spend: 0, spend_currency: 'TRY', daily_budget_try: 750, cost_per_message_try: 12.5, paused_at: null, created_at: ts(12), channel_type_custom: 'page', channel_name_custom: 'صفحة لويز' },
    { id: 'c2', name: 'حملة واقي الشمس (وهمي)', team: 'تيم Lowes تركيا', status: 'active', is_active: true, members: ['سارة وهمية'], manager_name: null, budget_usd: 0, spend: 0, spend_currency: 'TRY', daily_budget_try: null, cost_per_message_try: null, paused_at: null, created_at: ts(5), channel_type_custom: 'whatsapp', channel_name_custom: 'واتساب 1' },
    { id: 'c3', name: 'حملة الصيف القديمة (وهمي)', team: 'تيم سوريا', status: 'paused', is_active: false, members: ['ريم وهمية'], manager_name: null, budget_usd: 0, spend: 0, spend_currency: 'TRY', daily_budget_try: 500, cost_per_message_try: null, paused_at: ts(3), created_at: ts(40), channel_type_custom: 'page', channel_name_custom: 'صفحة' },
    { id: 'c4', name: 'حملة رمضان (وهمي، أُوقفت قبل v2)', team: 'تيم سوريا', status: 'active', is_active: false, members: [], manager_name: null, budget_usd: 0, spend: 0, spend_currency: 'TRY', daily_budget_try: null, cost_per_message_try: null, paused_at: null, created_at: ts(200), channel_type_custom: 'page', channel_name_custom: null },
  ],
  campaign_ads: [
    { id: 'a1', campaign_id: 'c1', ad_name: 'فيديو السيروم 1', ad_image_url: null, status: 'active', sort_order: 0, added_by: 'أولغا وهمية', deleted_at: null, deleted_by: null, created_at: ts(12) },
    { id: 'a2', campaign_id: 'c1', ad_name: 'صورة قبل/بعد', ad_image_url: null, status: 'active', sort_order: 1, added_by: 'ريم وهمية', deleted_at: null, deleted_by: null, created_at: ts(6) },
    { id: 'a3', campaign_id: 'c1', ad_name: 'ريلز قديم', ad_image_url: null, status: 'active', sort_order: 2, added_by: 'سارة وهمية', deleted_at: ts(1), deleted_by: 'سارة وهمية', created_at: ts(10) },
    { id: 'a4', campaign_id: 'c2', ad_name: 'كاروسيل الواقي', ad_image_url: null, status: 'active', sort_order: 0, added_by: 'أولغا وهمية', deleted_at: null, deleted_by: null, created_at: ts(5) },
    { id: 'a5', campaign_id: 'c3', ad_name: 'إعلان الصيف', ad_image_url: null, status: 'active', sort_order: 0, added_by: null, deleted_at: null, deleted_by: null, created_at: ts(40) },
  ],
  daily_reports: [], report_ad_results: [], report_source_results: [], report_source_platforms: [],
  profiles: ['أولغا وهمية', 'ريم وهمية', 'سارة وهمية', 'لينا وهمية'].map((n, i) => ({ id: 'p' + i, employee_name: n, team: 'تركيا', role_type: i ? 'employee' : 'media_buyer', is_active: true })),
  orders: [], meta_ad_insights: [],
};
// تقارير: ريم كل يوم آخر 5 أيام · سارة يومان (ليس اليوم) · لينا لا شيء
const addReport = (name, n, lines) => {
  const rid = id('r');
  db.daily_reports.push({ id: rid, employee_name: name, team: 'تركيا', report_date: dayISO(n), total_messages: lines.reduce((s, l) => s + l.messages, 0), total_confirmations: lines.reduce((s, l) => s + l.confirmations, 0), total_sales_try: 0, total_sales_syp: 0, total_sales_usd: 0, created_at: ts(n) });
  for (const l of lines) db.report_ad_results.push({ id: id('x'), report_id: rid, currency: 'TRY', amount_try: l.confirmations * 900, amount_syp: 0, amount_usd: 0, star_rating: 4, notes: null, image_urls: [], ...l });
};
for (let n = 0; n < 5; n++) addReport('ريم وهمية', n, [{ campaign_id: 'c1', ad_id: 'a1', messages: 20 + n, confirmations: 3 }, { campaign_id: 'c1', ad_id: 'a2', messages: 8, confirmations: 1 }]);
addReport('سارة وهمية', 1, [{ campaign_id: 'c1', ad_id: 'a3', messages: 15, confirmations: 4 }, { campaign_id: 'c2', ad_id: 'a4', messages: 9, confirmations: 2 }]);
addReport('سارة وهمية', 2, [{ campaign_id: 'c1', ad_id: 'a3', messages: 11, confirmations: 2 }]);
addReport('ريم وهمية', 8, [{ campaign_id: 'c3', ad_id: 'a5', messages: 30, confirmations: 5 }]);
// ?seed=deleted ⇒ الإعلان a1 محذوف ناعماً (لاختبار أن إعادة حفظ تقرير اليوم لا تمسح نتائجه)
if (qs.get('seed') === 'deleted') Object.assign(db.campaign_ads.find(a => a.id === 'a1'), { deleted_at: ts(0), deleted_by: 'ريم وهمية' });
window.__db = db;

// ── باني استعلامات وهمي (مجموعة PostgREST المستخدمة فقط) ──
function query(table) {
  const st = { op: 'select', filters: [], order: null, limit: null, range: null, payload: null, head: false, single: false, count: null };
  const rows = () => (db[table] ||= []);
  const match = (r) => st.filters.every(f => f(r));
  const run = () => {
    if (st.op === 'insert') {
      const list = (Array.isArray(st.payload) ? st.payload : [st.payload]).map(p => ({ id: id(table), created_at: new Date().toISOString(), ...p }));
      rows().push(...list);
      return { data: st.single ? list[0] : list, error: null };
    }
    if (st.op === 'update') { rows().filter(match).forEach(r => Object.assign(r, st.payload)); return { data: null, error: null }; }
    if (st.op === 'delete') { db[table] = rows().filter(r => !match(r)); return { data: null, error: null }; }
    let out = rows().filter(match);
    if (st.order) out = [...out].sort((a, b) => String(a[st.order.col] ?? '').localeCompare(String(b[st.order.col] ?? '')) * (st.order.asc ? 1 : -1));
    if (st.range) out = out.slice(st.range[0], st.range[1] + 1);
    if (st.limit != null) out = out.slice(0, st.limit);
    if (st.head) return { data: null, count: out.length, error: null };
    return { data: st.single ? (out[0] ?? null) : out.map(r => ({ ...r })), error: null, count: out.length };
  };
  const b = {
    select(_c, opts) { if (st.op === 'select' && opts?.head) st.head = true; return b; },
    insert(p) { st.op = 'insert'; st.payload = p; return b; },
    update(p) { st.op = 'update'; st.payload = p; return b; },
    delete() { st.op = 'delete'; return b; },
    eq(c, v) { st.filters.push(r => r[c] === v); return b; },
    is(c, v) { st.filters.push(r => (r[c] ?? null) === v); return b; },
    in(c, vs) { st.filters.push(r => vs.includes(r[c])); return b; },
    gte(c, v) { st.filters.push(r => String(r[c]) >= v); return b; },
    lte(c, v) { st.filters.push(r => String(r[c]) <= v); return b; },
    lt(c, v) { st.filters.push(r => String(r[c]) < v); return b; },
    or() { st.filters.push(r => r.is_active == null || r.is_active === true); return b; }, // يُستخدم فقط لـ is_active
    order(col, o) { st.order = { col, asc: o?.ascending !== false }; return b; },
    limit(n) { st.limit = n; return b; },
    range(a, z) { st.range = [a, z]; return b; },
    single() { st.single = true; return b; },
    maybeSingle() { st.single = true; return b; },
    then(res, rej) { return Promise.resolve(run()).then(res, rej); },
  };
  return b;
}
supabase.from = query;
supabase.storage.from = () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) });

const SCREENS = { campaigns: CampaignsScreen, board: MediaBuyerBoardScreen, report: DailyReportScreen };
const screen = SCREENS[qs.get('screen')] ? qs.get('screen') : 'campaigns';
const Screen = SCREENS[screen];
const link = (p, s) => `?persona=${p}&screen=${s}`;
createRoot(document.getElementById('root')).render(
  <MemoryRouter>
    <div className="max-w-5xl mx-auto p-3 sm:p-6">
      <div className="mb-3 text-[11px] text-muted flex flex-wrap gap-2">
        <b>⚠️ بيانات وهمية — harness</b>
        {Object.keys(PERSONAS).flatMap(p => Object.keys(SCREENS).map(s => (
          <a key={p + s} href={link(p, s)} className={'underline ' + (p === (qs.get('persona') || 'buyer') && s === screen ? 'font-bold text-teal' : '')}>{PERSONAS[p].name} · {s}</a>
        )))}
      </div>
      <Screen />
    </div>
  </MemoryRouter>,
);
