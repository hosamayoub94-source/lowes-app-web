// Supabase Edge Function: b2b-leads  (D-119)
// The only door to B2B leads of countries other than Syria (today: AE — الإمارات).
// Syria rows stay on the old direct path, unchanged; after migration 20261008 the table's RLS lets the browser
// touch Syria rows only, so every non-Syria read/write goes through here (service_role + server-side permission).
//
// Auth: real Supabase Auth session (Bearer) -> profiles row. Access per country:
//   admin, or the country's permission (countries.js leadsPermission, e.g. view_uae_leads) in extra_permissions
//   and not in denied_permissions. Always derived from the session's profile, never from the request body.
// Actions:
//   list            { country }                                   — rows of that country only
//   add             { country, row }                              — manual team entry (same rules as Syria createLead)
//   update_status   { country, id, status, notes }                — team contact fields only
//   update_presence { country, id, lowes_presence, lowes_listing_url }
//   import          { country, rows, dry_run = true }             — research batch; ADMIN ONLY; insert-only, never overwrites
// Every update first checks that the row belongs to the requested country (a UAE user cannot touch a Syria row by id).
// Before the migration is applied the function answers 409 migration_required and writes nothing.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  COUNTRIES, normalizeRegion, normalizeCity, websiteKey, nameKey, waLinkFor, telLinkOf,
} from "../_shared/countries.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

type Row = Record<string, unknown>;
const TABLE = "syria_b2b_leads";
const STATUSES = ["not_contacted", "contacted", "interested", "not_interested", "customer"];
const PRESENCE = ["not_listed", "contacted", "in_talks", "listed", "rejected", "not_applicable", "unverified"];
const CHANNELS = ["website", "marketplace", "app", "instagram", "facebook"];
const PRIORITIES = ["A+", "A", "B", "C", "D"];
const VERIFIED = ["verified_multi_source", "verified_single_source", "discovered_unconfirmed", "closed_or_uncertain", "manual_team_entry"];
const MAX_IMPORT = 500;

function cleanText(v: unknown, max = 500): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s.slice(0, max);
}
function parseBool(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (["true", "yes", "1", "نعم"].includes(s)) return true;
  if (["false", "no", "0", "لا"].includes(s)) return false;
  return null;
}
const isUrl = (s: string) => /^https?:\/\/[^\s]+\.[^\s]+/i.test(s);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
function parseSources(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : String(v ?? "").split("|");
  return [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))];
}
function normalizeInstagram(v: unknown): string | null {
  const s = cleanText(v, 200);
  if (!s) return null;
  return s.startsWith("@") ? s : "@" + s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/+$/, "");
}
function normalizeFacebook(v: unknown): string | null {
  const s = cleanText(v, 300);
  if (!s) return null;
  return s.startsWith("http") ? s : "https://facebook.com/" + s.replace(/^facebook\.com\//i, "");
}

// Fields every inserted row carries — one fixed key set (PostgREST bulk inserts need identical keys).
function contactBlock(src: Row, cc: string) {
  const phone = cleanText(src.phone, 40);
  const whatsapp = cleanText(src.whatsapp, 40);
  const ig = normalizeInstagram(src.instagram);
  return {
    phone, phone_tel: telLinkOf(phone) || null,
    whatsapp, whatsapp_link: waLinkFor(whatsapp, cc) || null,
    instagram: ig, instagram_link: ig ? "https://instagram.com/" + ig.slice(1) : null,
    facebook: normalizeFacebook(src.facebook),
    email: cleanText(src.email, 200),
    telegram: cleanText(src.telegram, 200),
    website: cleanText(src.website, 300),
  };
}

// Validates one research row for import. Returns { row } or { error }.
function researchRow(src: Row, code: string, idx: number, stamp: string): { row?: Row; error?: string } {
  const c = COUNTRIES[code];
  const name = cleanText(src.name, 200);
  if (!name) return { error: "name required" };
  const province = normalizeRegion(code, src.province);
  if (!province) return { error: `unknown ${c.regionLabel}: ${src.province ?? ""}` };
  const lead_type = src.lead_type === "physical" ? "physical" : src.lead_type === "online" ? "online" : null;
  if (!lead_type) return { error: "lead_type must be physical|online" };
  const channel = cleanText(src.channel, 20);
  if (channel && !CHANNELS.includes(channel)) return { error: `unknown channel: ${channel}` };
  const contact = contactBlock(src, c.phoneCc);
  if (contact.website && !isUrl(contact.website)) return { error: "website must be an http(s) URL" };
  if (contact.email && !isEmail(contact.email)) return { error: "invalid email" };
  const sources = parseSources(src.source_urls);
  if (!sources.length) return { error: "source_urls required (every research row needs a public source)" };
  if (sources.some((u) => !isUrl(u))) return { error: "every source must be an http(s) URL" };
  const lastVerified = cleanText(src.last_verified_at, 40);
  if (!lastVerified || Number.isNaN(Date.parse(lastVerified))) return { error: "last_verified_at required (date)" };
  const priority = cleanText(src.priority, 2) || "D";
  if (!PRIORITIES.includes(priority)) return { error: `unknown priority: ${priority}` };
  if ((priority === "A" || priority === "A+") && sources.length < 2) return { error: "priority A needs 2 independent sources" };
  const verified = cleanText(src.verified, 40) || "discovered_unconfirmed";
  if (!VERIFIED.includes(verified) || verified === "manual_team_entry") return { error: `unknown verified: ${verified}` };
  const presence = cleanText(src.lowes_presence, 20) || "unverified";
  if (!PRESENCE.includes(presence)) return { error: `unknown lowes_presence: ${presence}` };
  const listingUrl = cleanText(src.lowes_listing_url, 400);
  if (presence === "listed" && !listingUrl) return { error: "lowes_presence=listed needs lowes_listing_url as evidence" };
  const score = Math.max(0, Math.min(100, Math.round(Number(src.score) || 0)));
  const now = new Date().toISOString();
  return {
    row: {
      id: `${c.idPrefix}-${lead_type === "online" ? "ONL" : "PHY"}-${stamp}-${String(idx + 1).padStart(3, "0")}`,
      country: code, province, city: normalizeCity(code, src.city), district: cleanText(src.district, 200),
      name, category: cleanText(src.category, 100), address: cleanText(src.address, 300), contact_person: null,
      ...contact,
      priority, score, verified,
      reason: cleanText(src.reason, 2000), source_urls: sources.join(" | "),
      status: "not_contacted", status_updated_at: null, status_updated_by: null,
      added_by: null, added_manually: false,
      lead_type, channel,
      sells_beauty: parseBool(src.sells_beauty), accepts_sellers: parseBool(src.accepts_sellers),
      delivery_coverage: cleanText(src.delivery_coverage, 200),
      lowes_presence: presence, lowes_listing_url: listingUrl,
      discovery_source: cleanText(src.discovery_source, 100) || `research:${now.slice(0, 10)}`,
      discovered_at: now, last_verified_at: new Date(lastVerified).toISOString(),
      created_at: now, updated_at: now,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const raw = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    const token = raw.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ ok: false, error: "authenticated user session required" }, 401);
    const { data: auth, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !auth?.user?.id) return json({ ok: false, error: "authenticated user session required" }, 401);
    const { data: profile } = await admin.from("profiles").select("role_type,is_active,employee_name,extra_permissions,denied_permissions").eq("id", auth.user.id).maybeSingle();
    if (!profile || profile.is_active === false) return json({ ok: false, error: "no permission" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const code = String(body?.country || "").toUpperCase();
    const c = COUNTRIES[code];
    if (!c || !c.enabled || c.legacyDirect || !c.leadsPermission) return json({ ok: false, error: "country_not_served" }, 400);

    const isAdmin = profile.role_type === "admin";
    const extra: string[] = Array.isArray(profile.extra_permissions) ? profile.extra_permissions : [];
    const denied: string[] = Array.isArray(profile.denied_permissions) ? profile.denied_permissions : [];
    const canView = isAdmin || (extra.includes(c.leadsPermission) && !denied.includes(c.leadsPermission));
    if (!canView) return json({ ok: false, error: "no permission", message: `ما عندك صلاحية ليدز ${c.ar}` }, 403);
    if (action === "import" && !isAdmin) return json({ ok: false, error: "no permission", message: "الاستيراد للأدمن فقط" }, 403);
    const actor = String(profile.employee_name || auth.user.id).slice(0, 100);

    // Is migration 20261008 applied? (column "country" exists only after it)
    const probe = await admin.from(TABLE).select("country").limit(1);
    if (probe.error) return json({ ok: false, error: "migration_required", message: "قسم الدول الجديد يحتاج تطبيق migration 20261008 أولاً" }, 409);

    // Row must exist AND belong to the requested country — otherwise behave as not found (no cross-country access).
    const ownRow = async (id: unknown) => {
      const sid = cleanText(id, 100);
      if (!sid) return null;
      const { data } = await admin.from(TABLE).select("id,country").eq("id", sid).maybeSingle();
      return data && data.country === code ? data : null;
    };

    if (action === "list") {
      const { data, error } = await admin.from(TABLE).select("*").eq("country", code).order("score", { ascending: false });
      if (error) return json({ ok: false, error: "read failed" }, 500);
      return json({ ok: true, country: code, rows: data ?? [] });
    }

    if (action === "update_status") {
      const status = String(body?.status || "");
      if (!STATUSES.includes(status)) return json({ ok: false, error: "invalid status" }, 400);
      if (!(await ownRow(body?.id))) return json({ ok: false, error: "not_found" }, 404);
      const now = new Date().toISOString();
      const patch = { status, notes: cleanText(body?.notes, 1000), status_updated_at: now, status_updated_by: actor, updated_at: now };
      const { data, error } = await admin.from(TABLE).update(patch).eq("id", body.id).eq("country", code).select("*").maybeSingle();
      if (error || !data) return json({ ok: false, error: "update failed" }, 500);
      return json({ ok: true, row: data });
    }

    if (action === "update_presence") {
      const presence = String(body?.lowes_presence || "");
      if (!PRESENCE.includes(presence)) return json({ ok: false, error: "invalid lowes_presence" }, 400);
      const url = cleanText(body?.lowes_listing_url, 400);
      if (url && !isUrl(url)) return json({ ok: false, error: "invalid lowes_listing_url", message: "الرابط لازم يبدأ بـhttp" }, 400);
      if (!(await ownRow(body?.id))) return json({ ok: false, error: "not_found" }, 404);
      const now = new Date().toISOString();
      const patch = { lowes_presence: presence, lowes_listing_url: url, presence_updated_at: now, presence_updated_by: actor, updated_at: now };
      const { data, error } = await admin.from(TABLE).update(patch).eq("id", body.id).eq("country", code).select("*").maybeSingle();
      if (error || !data) return json({ ok: false, error: "update failed" }, 500);
      return json({ ok: true, row: data });
    }

    // Existing keys for duplicate checks: websites across ALL countries (the DB unique index is global),
    // names inside this country + region.
    const loadKeys = async () => {
      const { data, error } = await admin.from(TABLE).select("id,country,province,name,website");
      if (error) return null;
      const web = new Map<string, Row>(), names = new Map<string, Row>();
      for (const r of data ?? []) {
        const w = websiteKey(r.website);
        if (w) web.set(w, r);
        if (r.country === code) { const n = nameKey(code, r.province, r.name); if (n) names.set(n, r); }
      }
      return { web, names };
    };

    if (action === "add") {
      const src = (body?.row && typeof body.row === "object" ? body.row : {}) as Row;
      const name = cleanText(src.name, 200);
      if (!name) return json({ ok: false, error: "invalid", message: "الاسم مطلوب" }, 400);
      const province = normalizeRegion(code, src.province);
      if (!province) return json({ ok: false, error: "invalid", message: `${c.regionLabel} مطلوبة` }, 400);
      const lead_type = src.lead_type === "online" ? "online" : "physical";
      const channel = cleanText(src.channel, 20);
      if (channel && !CHANNELS.includes(channel)) return json({ ok: false, error: "invalid", message: "قناة غير معروفة" }, 400);
      const contact = contactBlock(src, c.phoneCc);
      if (contact.website && !isUrl(contact.website)) return json({ ok: false, error: "invalid", message: "الموقع لازم يبدأ بـhttp" }, 400);
      if (contact.email && !isEmail(contact.email)) return json({ ok: false, error: "invalid", message: "إيميل غير صالح" }, 400);
      const keys = await loadKeys();
      if (!keys) return json({ ok: false, error: "read failed" }, 500);
      const w = websiteKey(contact.website);
      const dup = (w && keys.web.get(w)) || keys.names.get(nameKey(code, province, name) as string);
      if (dup) return json({ ok: false, error: "duplicate", message: `موجود مسبقاً: ${dup.name}`, duplicate: { id: dup.id, name: dup.name } }, 409);
      const status = STATUSES.includes(String(src.initialStatus)) ? String(src.initialStatus) : "not_contacted";
      const methods = [contact.phone, contact.whatsapp, contact.instagram, contact.facebook, contact.email, contact.telegram].filter(Boolean).length;
      const contactPerson = cleanText(src.contact_person, 200);
      const reason = cleanText(src.reason, 1000);
      const now = new Date().toISOString();
      const row: Row = {
        id: `${c.idPrefix}-${lead_type === "online" ? "ONA" : "ADD"}-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
        country: code, province, city: normalizeCity(code, src.city), district: cleanText(src.district, 200),
        name, category: cleanText(src.category, 100), address: cleanText(src.address, 300), contact_person: contactPerson,
        ...contact,
        priority: methods >= 1 ? "B" : "C",                       // manual entry = one source -> B at most (same rule as Syria)
        score: Math.min(65, 40 + methods * 8 + (contactPerson ? 5 : 0)),
        verified: "manual_team_entry",
        reason: reason ? `إضافة يدوية من الفريق: ${reason}` : "إضافة يدوية من الفريق.",
        source_urls: null,
        status, status_updated_at: status !== "not_contacted" ? now : null, status_updated_by: status !== "not_contacted" ? actor : null,
        added_by: actor, added_manually: true,
        lead_type, channel,
        sells_beauty: parseBool(src.sells_beauty), accepts_sellers: parseBool(src.accepts_sellers),
        delivery_coverage: cleanText(src.delivery_coverage, 200),
        lowes_presence: "unverified", lowes_listing_url: null,
        discovery_source: "manual_team_entry", discovered_at: now, last_verified_at: now,
        created_at: now, updated_at: now,
      };
      const { data, error } = await admin.from(TABLE).insert(row).select("*").maybeSingle();
      if (error) {
        if (error.code === "23505") return json({ ok: false, error: "duplicate", message: "الموقع موجود مسبقاً" }, 409);
        return json({ ok: false, error: "insert failed" }, 500);
      }
      return json({ ok: true, row: data ?? row });
    }

    if (action === "import") {
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      if (!rows.length) return json({ ok: false, error: "no rows" }, 400);
      if (rows.length > MAX_IMPORT) return json({ ok: false, error: `max ${MAX_IMPORT} rows per import` }, 400);
      const dryRun = body?.dry_run !== false;
      const keys = await loadKeys();
      if (!keys) return json({ ok: false, error: "read failed" }, 500);
      const stamp = Date.now().toString(36).toUpperCase();
      const fresh: Row[] = [], invalid: Row[] = [], dupExisting: Row[] = [], dupInFile: Row[] = [];
      const seenWeb = new Set<string>(), seenName = new Set<string>();
      rows.forEach((src: Row, i: number) => {
        const line = i + 1;
        if (!src || typeof src !== "object" || Array.isArray(src)) { invalid.push({ line, error: "row must be an object" }); return; }
        if (src.country && String(src.country).toUpperCase() !== code) { invalid.push({ line, name: src.name, error: `row country ${src.country} ≠ ${code}` }); return; }
        const { row, error } = researchRow(src, code, i, stamp);
        if (!row) { invalid.push({ line, name: src.name, error }); return; }
        const w = websiteKey(row.website), n = nameKey(code, row.province, row.name) as string;
        const existing = (w && keys.web.get(w)) || keys.names.get(n);
        if (existing) { dupExisting.push({ line, name: row.name, existing: { id: existing.id, name: existing.name, country: existing.country } }); return; }
        if ((w && seenWeb.has(w)) || seenName.has(n)) { dupInFile.push({ line, name: row.name }); return; }
        if (w) seenWeb.add(w);
        seenName.add(n);
        fresh.push(row);
      });
      const summary = { total: rows.length, new: fresh.length, duplicate_existing: dupExisting.length, duplicate_in_file: dupInFile.length, invalid: invalid.length };
      const report = { summary, new: fresh.map((r) => ({ id: r.id, name: r.name, province: r.province })), duplicate_existing: dupExisting, duplicate_in_file: dupInFile, invalid };
      if (dryRun || !fresh.length) return json({ ok: true, dry_run: dryRun, inserted: 0, ...report });
      const { error } = await admin.from(TABLE).insert(fresh);
      if (error) return json({ ok: false, error: "insert failed", detail: error.code || null, ...report }, 500);
      return json({ ok: true, dry_run: false, inserted: fresh.length, ...report });
    }

    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    console.error("b2b-leads", e);
    return json({ ok: false, error: "server error" }, 500);
  }
});
