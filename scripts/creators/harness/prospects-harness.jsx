// DEV-ONLY harness: mounts «صناع المحتوى» v2 without login and without touching Supabase — functions.invoke is replaced
// by an in-memory fake that uses the same _shared/creatorMatch.js as the edge function. All rows below are FAKE (تجريبي).
// Open via the Vite dev server: /scripts/creators/harness/prospects.html   (?schema=v1 shows the transitional mode)
// Never shipped: not part of the app bundle.
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../../../src/styles/theme.css';
import '../../../src/styles/globals.css';
import { supabase } from '../../../src/services/supabase';
import { searchCreators, normalizeHandle } from '../../../supabase/functions/_shared/creatorMatch.js';
import CreatorProspectsScreen from '../../../src/screens/CreatorProspectsScreen.jsx';

const schema = new URLSearchParams(location.search).get('schema') === 'v1' ? 'v1' : 'v2';
const day = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const fake = (o) => ({ platform: 'instagram', status: 'needs_review', verified: false, deleted_at: null, content_types: [], skincare_focus: [], tags: [], saved: false, verification_status: 'unverified', country: 'SY', created_at: '2026-10-01T10:00:00Z', ...o, handle_key: o.handle.toLowerCase(), name: `${o.name} (تجريبي)` });
let rows = [
  fake({ id: '1', handle: 'demo.reem.skin', name: 'Reem Demo', governorate: 'damascus', city: 'دمشق', location_confidence: 'high', creator_type: 'skincare', content_types: ['ugc', 'unboxing', 'reels'], skincare_focus: ['serums', 'sunscreen'], followers: 8400, engagement_pct: 4.1, last_active_at: day(4), source: 'Google Search', source_url: 'https://example.com/a', status: 'verified', verification_status: 'verified', last_verified_at: '2026-10-05T09:00:00Z', saved: true, email: 'demo@example.com', preferred_contact: 'email' }),
  fake({ id: '2', handle: 'demo_lana_reviews', name: 'لانا تجربة', governorate: 'damascus', location_confidence: 'medium', creator_type: 'reviewer', content_types: ['review', 'ugc'], followers: 3200, engagement_pct: 2.3, last_active_at: day(20), source: 'Instagram' }),
  fake({ id: '3', handle: 'demo.big.fashion', name: 'Big Fashion Demo', governorate: 'damascus', location_confidence: 'medium', creator_type: 'general', category: 'fashion', content_types: ['reels'], followers: 250000, engagement_pct: 0.5, source: 'Influencer Directory' }),
  fake({ id: '4', handle: 'demo.halab.glow', name: 'حلا تجربة', governorate: 'aleppo', location_confidence: 'medium', creator_type: 'beauty', content_types: ['unboxing', 'stories'], skincare_focus: ['face_care'], followers: 15000, source: 'Manual', status: 'discovered' }),
  fake({ id: '5', handle: 'demo_old_row', name: 'Old Row', category: 'beauty', followers: null, engagement_pct: null, source: 'legacy', location_confidence: 'low', notes: 'سجل قديم ناقص المعلومات' }),
  fake({ id: '6', handle: 'demo.dr.derm', name: 'Dr. Demo', governorate: 'latakia', location_confidence: 'low', creator_type: 'expert', followers: 60000, engagement_pct: 25.2, source: 'Google Search' }),
  ...Array.from({ length: 40 }, (_, i) => fake({ id: `x${i}`, handle: `demo_creator_${i}`, name: `Creator ${i}`, governorate: ['homs', 'tartus', 'hama', 'damascus'][i % 4], location_confidence: 'low', category: ['beauty', 'makeup', 'fashion', 'skincare'][i % 4], followers: 1000 * (i + 1), source: 'Influencer Directory' })),
];
const V2_KEYS = ['country', 'governorate', 'city', 'location_confidence', 'creator_type', 'content_types', 'skincare_focus', 'tags', 'saved', 'verification_status', 'last_active_at', 'last_verified_at', 'email', 'preferred_contact', 'source_url'];
if (schema === 'v1') rows = rows.map((r) => { const o = { ...r, status: 'new', location: r.governorate || null }; V2_KEYS.forEach((k) => delete o[k]); return o; });

const ok = (data) => ({ data, error: null });
let seq = 100;
// supabase.functions is a getter that builds a new client each time -> shadow it with an own property.
const invoke = async (_name, { body }) => {
  await new Promise((r) => setTimeout(r, 150));
  const { action } = body;
  if (action === 'search') return ok({ ok: true, schema, ...searchCreators(rows.filter((r) => (body.include_deleted ? r.deleted_at : !r.deleted_at)), { q: body.q, filters: body.filters, sort: body.sort, page: body.page, pageSize: body.page_size }) });
  if (action === 'list') return ok({ ok: true, schema, rows });
  if (action === 'update') {
    const r = rows.find((x) => x.id === body.id);
    const p = { ...body.patch };
    if (typeof p.skincare_focus === 'string') p.skincare_focus = p.skincare_focus.split(',').map((s) => s.trim());
    if (p.followers === '') p.followers = null;
    Object.assign(r, p, { updated_at: new Date().toISOString() });
    return ok({ ok: true, row: { ...r } });
  }
  if (action === 'add') {
    const h = normalizeHandle(body.row.handle);
    if (rows.some((r) => r.handle_key === h)) return ok({ ok: false, error: 'duplicate', duplicate: { name: rows.find((r) => r.handle_key === h).name } });
    const row = fake({ ...body.row, id: String(seq++), handle: h, name: body.row.name || h, status: body.row.status || 'discovered' });
    rows.unshift(row);
    return ok({ ok: true, row });
  }
  if (action === 'bulk_update') { rows.filter((r) => body.ids.includes(r.id)).forEach((r) => Object.assign(r, body.patch)); return ok({ ok: true, updated: body.ids.length }); }
  if (action === 'delete' || action === 'restore') { const r = rows.find((x) => x.id === body.id); r.deleted_at = action === 'delete' ? new Date().toISOString() : null; return ok({ ok: true, row: { ...r } }); }
  if (action === 'audit') return ok({ ok: true, entries: [] });
  if (action === 'import') {
    const keys = new Set(rows.map((r) => r.handle_key));
    const fresh = body.rows.filter((r) => !keys.has(normalizeHandle(r.handle)));
    if (!body.dry_run) fresh.forEach((r) => rows.unshift(fake({ ...r, id: String(seq++), handle: normalizeHandle(r.handle), name: normalizeHandle(r.handle), status: 'discovered' })));
    return ok({ ok: true, dry_run: body.dry_run !== false, summary: { total: body.rows.length, new: fresh.length, duplicate_existing: body.rows.length - fresh.length, duplicate_in_file: 0, invalid: 0 }, new: fresh.map((r, i) => ({ line: i + 1, handle: r.handle })), duplicate_existing: [], duplicate_in_file: [], invalid: [], inserted: fresh.length, merged: 0 });
  }
  return ok({ ok: false, error: 'unknown action' });
};
Object.defineProperty(supabase, 'functions', { value: { invoke }, configurable: true });

createRoot(document.getElementById('root')).render(
  <MemoryRouter><CreatorProspectsScreen /></MemoryRouter>
);
