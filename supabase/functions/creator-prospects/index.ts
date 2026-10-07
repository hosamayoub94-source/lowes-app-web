// Supabase Edge Function: creator-prospects  (ADMIN ONLY)
// Single door to public.creator_prospects (RLS on, no policies, no grants for anon/authenticated).
// Auth: real Supabase Auth session -> profiles.role_type = 'admin' (derived server-side, never from the body).
// Actions: search (v2: server-side query/filter/score/page) | list | add | update | bulk_update | delete (soft) | restore | import (dry_run / merge) | audit
// Hard duplicate prevention: unique (platform, handle_key) in the database + pre-check here with a report.
// The client never chooses a table, column list or filter: every field below is whitelisted.
// v2 (D-094): search/score logic lives in ../_shared/creatorMatch.js (same file the screen uses as fallback).
// Works on both schemas: before the v2 migration is applied, v2 columns are not read and v2 writes are refused with "migration_required".

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  parseHandle, searchCreators, CONTENT_TYPES, SKINCARE_FOCUS, CREATOR_TYPES, STATUSES as V2_STATUSES, VERIFICATION, LOCATION_CONFIDENCE, PLATFORMS, GOVERNORATES,
} from "../_shared/creatorMatch.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const V1_STATUSES = ["new", "reviewing", "approved", "contacted", "package_sent", "posted", "declined", "rejected"];
const PRIORITIES = ["P0", "P1", "P2"];
const TEXT_FIELDS = ["name", "location", "category", "fit", "evidence", "verification_level", "source", "profile_url", "owner"];
const V2_TEXT_FIELDS = ["city", "email", "phone", "preferred_contact", "source_url"];
const V2_FIELDS = ["country", "governorate", "city", "location_confidence", "creator_type", "content_types", "skincare_focus", "tags", "bio", "email", "phone", "preferred_contact", "other_platforms", "source_url", "last_verified_at", "last_active_at", "verification_status", "saved"];
const EDITABLE = ["platform", "handle", "followers", "engagement_pct", "priority", "status", "notes", "verified", ...TEXT_FIELDS, ...V2_FIELDS];
const SPECIAL = ["followers", "engagement_pct", "priority", "status", "verified", "saved", "country", "governorate", "location_confidence", "creator_type", "verification_status", "last_verified_at", "last_active_at", "other_platforms"];
const BULK_EDITABLE = ["status", "owner", "category", "priority", "verified", "saved", "creator_type", "verification_status"];
const MAX_IMPORT = 2000;

const COLS_V1 = "id,platform,handle,handle_key,name,location,followers,engagement_pct,category,priority,fit,evidence,verification_level,source,profile_url,status,owner,notes,verified,cohort,legacy_id,created_at,created_by,updated_at,updated_by,deleted_at,deleted_by";
const COLS_V2 = COLS_V1 + "," + V2_FIELDS.join(",");

function cleanText(v: unknown, max = 500): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s.slice(0, max);
}
function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().toLowerCase().replace(/,/g, "").replace(/%/g, "");
  let mult = 1;
  if (s.endsWith("k")) { mult = 1e3; s = s.slice(0, -1); }
  else if (s.endsWith("m")) { mult = 1e6; s = s.slice(0, -1); }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n * mult : null;
}
// "a, b" | ["a","b"] -> whitelisted, de-duplicated array. Unknown values => error.
function parseList(v: unknown, allowed: string[] | null, max = 20): { list?: string[]; error?: string } {
  if (v === null || v === undefined || v === "") return { list: [] };
  const raw = Array.isArray(v) ? v : String(v).split(/[,،;|]/);
  const out: string[] = [];
  for (const x of raw) {
    const s = allowed ? cleanText(x, 60)?.toLowerCase().replace(/\s+/g, "_") : cleanText(x, 60);
    if (!s) continue;
    if (allowed && !allowed.includes(s)) return { error: `value "${s}" not allowed` };
    if (!out.includes(s)) out.push(s);
  }
  return { list: out.slice(0, max) };
}
function parseDate(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}
const pick = (v: unknown, allowed: string[]) => { const s = cleanText(v, 40)?.toLowerCase(); return s && allowed.includes(s) ? s : undefined; };

type Row = Record<string, unknown>;
// Returns the clean row (only fields present in raw) or an error message.
function normalizeRow(raw: Row, opts: { requireHandle?: boolean } = { requireHandle: true }): { row?: Row; error?: string } {
  const row: Row = {};
  if (opts.requireHandle !== false) {
    const given = cleanText(raw.handle ?? raw.profile_url, 300);
    const nm = cleanText(raw.name, 100);
    if (!given && nm) {
      // Manual entry with a name only: keep it (needs-review) under a placeholder handle until someone finds the real account.
      const slug = nm.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60);
      if (!slug) return { error: "أدخل اسماً أو حساباً" };
      row.platform = "other";
      row.handle = `pending_${slug}`;
    } else {
      const ph = parseHandle(given);
      if (!ph) return { error: given ? "الحساب غير صالح — بلا مسافات، أو الصق رابط الحساب" : "أدخل الحساب أو الاسم" };
      const platformRaw = cleanText(raw.platform, 20)?.toLowerCase();
      row.platform = platformRaw && PLATFORMS.includes(platformRaw) ? platformRaw : (ph.platform || "instagram");
      row.handle = ph.handle;
    }
  }
  for (const f of TEXT_FIELDS) { const t = cleanText(raw[f]); if (t !== null) row[f] = t; }
  for (const f of V2_TEXT_FIELDS) { const t = cleanText(raw[f], 300); if (t !== null) row[f] = t; }
  const notes = cleanText(raw.notes, 2000); if (notes !== null) row.notes = notes;
  const bio = cleanText(raw.bio, 2000); if (bio !== null) row.bio = bio;
  const fol = parseNum(raw.followers); if (fol !== null) row.followers = Math.max(0, Math.round(fol));
  const er = parseNum(raw.engagement_pct); if (er !== null) row.engagement_pct = Math.max(0, Math.min(9999, er));
  const pr = cleanText(raw.priority, 5)?.toUpperCase(); if (pr && PRIORITIES.includes(pr)) row.priority = pr;
  const st = cleanText(raw.status, 20)?.toLowerCase(); if (st && (V2_STATUSES.includes(st) || V1_STATUSES.includes(st))) row.status = st;
  if (typeof raw.verified === "boolean") row.verified = raw.verified;
  if (typeof raw.saved === "boolean") row.saved = raw.saved;
  // ---- v2 ----
  const cc = cleanText(raw.country, 2)?.toUpperCase(); if (cc && /^[A-Z]{2}$/.test(cc)) row.country = cc;
  const gvRaw = cleanText(raw.governorate, 40);
  if (gvRaw) {
    const gv = gvRaw.toLowerCase().replace(/[\s-]+/g, "_");
    const list = (GOVERNORATES as Record<string, { slug: string; ar: string; en: string }[]>)[(row.country as string) || "SY"] || [];
    const g = list.find((x) => x.slug === gv || x.en.toLowerCase().replace(/[\s-]+/g, "_") === gv || x.ar === gvRaw);
    if (g) row.governorate = g.slug; else return { error: `محافظة غير معروفة: ${gvRaw}` };
  }
  const lc = pick(raw.location_confidence, LOCATION_CONFIDENCE); if (lc) row.location_confidence = lc;
  const ct = pick(raw.creator_type, CREATOR_TYPES); if (ct) row.creator_type = ct;
  const vs = pick(raw.verification_status, VERIFICATION); if (vs) row.verification_status = vs;
  for (const [f, allowed] of [["content_types", CONTENT_TYPES], ["skincare_focus", SKINCARE_FOCUS], ["tags", null]] as [string, string[] | null][]) {
    if (!(f in raw)) continue;
    const p = parseList(raw[f], allowed, f === "tags" ? 30 : 10);
    if (p.error) return { error: `${f}: ${p.error}` };
    if (p.list!.length || raw[f] !== "") row[f] = p.list;
  }
  for (const f of ["last_verified_at", "last_active_at"]) {
    if (!(f in raw) || raw[f] === "" || raw[f] === null) continue;
    const d = parseDate(raw[f]);
    if (d === undefined) return { error: `${f}: تاريخ غير صالح` };
    if (d) row[f] = f === "last_active_at" ? d.slice(0, 10) : d;
  }
  if ("other_platforms" in raw && raw.other_platforms !== null && raw.other_platforms !== "") {
    const o = raw.other_platforms;
    if (typeof o !== "object" || Array.isArray(o)) return { error: "other_platforms invalid" };
    const clean: Row = {};
    for (const p of PLATFORMS) { const ph = parseHandle((o as Row)[p]); if (ph) clean[p] = ph.handle; }
    if (Object.keys(clean).length) row.other_platforms = clean;
  }
  return { row };
}
const keyOf = (platform: unknown, handle: unknown) => `${platform}|${String(handle).replace(/^@+/, "").trim().toLowerCase()}`;
const hasV2Field = (r: Row) => Object.keys(r).some((k) => V2_FIELDS.includes(k));
const isV2Status = (s: unknown) => typeof s === "string" && V2_STATUSES.includes(s) && !V1_STATUSES.includes(s);

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
    // Admin = everything. Anyone else needs the permission granted from /admin/users (extra_permissions minus denied_permissions),
    // always derived server-side from the session's profile row, never from the request.
    const extra: string[] = Array.isArray(profile.extra_permissions) ? profile.extra_permissions : [];
    const denied: string[] = Array.isArray(profile.denied_permissions) ? profile.denied_permissions : [];
    const has = (p: string) => profile.role_type === "admin" || (extra.includes(p) && !denied.includes(p));
    const canManage = has("manage_creator_data");
    const canView = has("view_creator_intelligence") || canManage;
    if (!canView) return json({ ok: false, error: "no permission" }, 403);
    const actor = String(profile.employee_name || auth.user.id).slice(0, 100);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    if (!["search", "list", "audit"].includes(action) && !canManage) return json({ ok: false, error: "no permission", message: "ما عندك صلاحية إدارة البيانات" }, 403);
    const audit = (prospect_id: string | null, act: string, changes: unknown) =>
      admin.from("creator_prospect_audit").insert({ prospect_id, action: act, actor, changes });

    // Is the v2 migration applied? One cheap probe per request (column "saved" exists only in v2).
    const probe = await admin.from("creator_prospects").select("saved").limit(1);
    const v2 = !probe.error;
    const cols = v2 ? COLS_V2 : COLS_V1;
    const migrationRequired = () => json({ ok: false, error: "migration_required", message: "الحقول الجديدة تحتاج تطبيق migration v2 أولاً" }, 409);

    if (action === "search") {
      const deleted = body?.include_deleted === true;
      let q = admin.from("creator_prospects").select(cols).limit(10000);
      q = deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
      const f = (body?.filters && typeof body.filters === "object" ? body.filters : {}) as Row;
      if (v2 && typeof f.country === "string" && /^[A-Z]{2}$/.test(f.country)) q = q.eq("country", f.country);
      const { data, error } = await q;
      if (error) return json({ ok: false, error: "read failed" }, 500);
      const res = searchCreators(data ?? [], {
        q: cleanText(body?.q, 200) || "",
        filters: f,
        sort: cleanText(body?.sort, 20) || "best",
        page: Number(body?.page) || 1,
        pageSize: Number(body?.page_size) || 30,
      });
      return json({ ok: true, schema: v2 ? "v2" : "v1", ...res });
    }

    if (action === "list") {
      let q = admin.from("creator_prospects").select(cols).order("created_at", { ascending: true }).limit(10000);
      if (!body?.include_deleted) q = q.is("deleted_at", null);
      const { data, error } = await q;
      if (error) return json({ ok: false, error: "read failed" }, 500);
      return json({ ok: true, schema: v2 ? "v2" : "v1", rows: data ?? [] });
    }

    if (action === "add") {
      const n = normalizeRow(body?.row || {});
      if (!n.row) return json({ ok: false, error: n.error }, 400);
      if (!cleanText(n.row.source)) n.row.source = "Manual"; // manual entry never blocked by missing info; the source is still always recorded
      if (!v2 && (hasV2Field(n.row) || isV2Status(n.row.status))) return migrationRequired();
      if (v2 && !n.row.status) n.row.status = "discovered";
      const k = keyOf(n.row.platform, n.row.handle);
      const { data: ex } = await admin.from("creator_prospects").select("id,handle,deleted_at,name").eq("platform", n.row.platform as string).eq("handle_key", k.split("|")[1]).maybeSingle();
      if (ex) return json({ ok: false, error: "duplicate", duplicate: { id: ex.id, handle: ex.handle, name: ex.name, deleted: !!ex.deleted_at } }, 409);
      const cohort = cleanText(body?.cohort, 40) === "discovery" ? `discovery_${new Date().toISOString().slice(0, 10)}` : "manual";
      const { data, error } = await admin.from("creator_prospects").insert({ ...n.row, cohort, created_by: actor, updated_by: actor }).select(cols).single();
      if (error) return json({ ok: false, error: error.code === "23505" ? "duplicate" : "insert failed" }, error.code === "23505" ? 409 : 500);
      await audit(data.id, "add", n.row);
      return json({ ok: true, row: data });
    }

    if (action === "update") {
      const id = String(body?.id || "");
      const patchIn = (body?.patch || {}) as Row;
      const nr = normalizeRow(patchIn, { requireHandle: false });
      if (!nr.row) return json({ ok: false, error: nr.error }, 400);
      const norm = nr.row;
      const patch: Row = {};
      for (const f of EDITABLE) {
        if (!(f in patchIn)) continue;
        const empty = patchIn[f] === null || patchIn[f] === "";
        if (f === "handle") { const ph = parseHandle(patchIn.handle); if (!ph) return json({ ok: false, error: "handle invalid" }, 400); patch.handle = ph.handle; }
        else if (f === "platform") patch.platform = pick(patchIn.platform, PLATFORMS) || "instagram";
        else if (SPECIAL.includes(f)) {
          if (empty) patch[f] = f === "status" ? (v2 ? "needs_review" : "new") : f === "verified" || f === "saved" ? false : f === "verification_status" ? "unverified" : null;
          else if (f in norm) patch[f] = norm[f];
          else return json({ ok: false, error: `${f} invalid` }, 400);
        } else if (["content_types", "skincare_focus", "tags"].includes(f)) patch[f] = norm[f] ?? [];
        else if (f in norm) patch[f] = norm[f];
        else patch[f] = cleanText(patchIn[f], ["notes", "bio"].includes(f) ? 2000 : 500);
      }
      if (!id || Object.keys(patch).length === 0) return json({ ok: false, error: "nothing to update" }, 400);
      if (!v2 && (hasV2Field(patch) || isV2Status(patch.status))) return migrationRequired();
      if (v2 && patch.verification_status === "verified" && !("last_verified_at" in patch)) patch.last_verified_at = new Date().toISOString();
      const { data: before } = await admin.from("creator_prospects").select(cols).eq("id", id).maybeSingle();
      if (!before) return json({ ok: false, error: "not found" }, 404);
      const { data, error } = await admin.from("creator_prospects").update({ ...patch, updated_at: new Date().toISOString(), updated_by: actor }).eq("id", id).select(cols).single();
      if (error) return json({ ok: false, error: error.code === "23505" ? "duplicate" : "update failed" }, error.code === "23505" ? 409 : 500);
      const diff: Row = {}; for (const k of Object.keys(patch)) diff[k] = { from: (before as Row)[k] ?? null, to: patch[k] };
      await audit(id, "update", diff);
      return json({ ok: true, row: data });
    }

    if (action === "bulk_update") {
      const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String).slice(0, 500) : [];
      const patchIn = (body?.patch || {}) as Row;
      const patch: Row = {};
      for (const f of BULK_EDITABLE) {
        if (!(f in patchIn)) continue;
        if (f === "status") { const s = cleanText(patchIn.status, 20)?.toLowerCase(); if (!s || !(V2_STATUSES.includes(s) || V1_STATUSES.includes(s))) return json({ ok: false, error: "status invalid" }, 400); patch.status = s; }
        else if (f === "priority") { const p = cleanText(patchIn.priority, 5)?.toUpperCase(); patch.priority = p && PRIORITIES.includes(p) ? p : null; }
        else if (f === "verified" || f === "saved") patch[f] = patchIn[f] === true;
        else if (f === "creator_type") { const t = pick(patchIn.creator_type, CREATOR_TYPES); if (!t) return json({ ok: false, error: "creator_type invalid" }, 400); patch.creator_type = t; }
        else if (f === "verification_status") { const t = pick(patchIn.verification_status, VERIFICATION); if (!t) return json({ ok: false, error: "verification_status invalid" }, 400); patch.verification_status = t; }
        else patch[f] = cleanText(patchIn[f], 200);
      }
      if (ids.length === 0 || Object.keys(patch).length === 0) return json({ ok: false, error: "nothing to update" }, 400);
      if (!v2 && (hasV2Field(patch) || isV2Status(patch.status))) return migrationRequired();
      const { data, error } = await admin.from("creator_prospects").update({ ...patch, updated_at: new Date().toISOString(), updated_by: actor }).in("id", ids).is("deleted_at", null).select("id");
      if (error) return json({ ok: false, error: "bulk update failed" }, 500);
      await audit(null, "bulk_update", { ids: (data ?? []).map((r: Row) => r.id), patch });
      return json({ ok: true, updated: data?.length ?? 0 });
    }

    if (action === "delete" || action === "restore") {
      const id = String(body?.id || "");
      if (!id) return json({ ok: false, error: "id required" }, 400);
      const upd = action === "delete"
        ? { deleted_at: new Date().toISOString(), deleted_by: actor, updated_at: new Date().toISOString(), updated_by: actor }
        : { deleted_at: null, deleted_by: null, updated_at: new Date().toISOString(), updated_by: actor };
      const { data, error } = await admin.from("creator_prospects").update(upd).eq("id", id).select(cols).maybeSingle();
      if (error || !data) return json({ ok: false, error: "not found" }, 404);
      await audit(id, action, { handle: data.handle });
      return json({ ok: true, row: data });
    }

    if (action === "audit") {
      const id = String(body?.id || "");
      if (!id) return json({ ok: false, error: "id required" }, 400);
      const { data } = await admin.from("creator_prospect_audit").select("action,actor,changes,created_at").eq("prospect_id", id).order("created_at", { ascending: false }).limit(50);
      return json({ ok: true, entries: data ?? [] });
    }

    if (action === "import") {
      const inRows: Row[] = Array.isArray(body?.rows) ? body.rows : [];
      if (inRows.length === 0) return json({ ok: false, error: "no rows" }, 400);
      if (inRows.length > MAX_IMPORT) return json({ ok: false, error: `max ${MAX_IMPORT} rows per import` }, 400);
      const dryRun = body?.dry_run !== false; // default is preview only
      const merge = body?.merge === true;
      const label = cleanText(body?.label, 80) || "import";
      const cohort = `import_${new Date().toISOString().slice(0, 10)}`;

      const invalid: { line: number; handle: string | null; reason: string }[] = [];
      const seen = new Map<string, number>();
      const fresh: { line: number; row: Row }[] = [];
      const dupInFile: { line: number; handle: string }[] = [];
      let droppedV2 = 0;
      inRows.forEach((r, i) => {
        const n = normalizeRow(r);
        if (!n.row) { invalid.push({ line: i + 1, handle: cleanText((r as Row).handle, 100), reason: n.error! }); return; }
        if (!v2) {
          if (hasV2Field(n.row)) droppedV2++;
          for (const k of V2_FIELDS) delete n.row[k];
          if (isV2Status(n.row.status)) delete n.row.status;
        } else if (!n.row.status) n.row.status = "discovered";
        const k = keyOf(n.row.platform, n.row.handle);
        if (seen.has(k)) { dupInFile.push({ line: i + 1, handle: String(n.row.handle) }); return; }
        seen.set(k, i + 1);
        fresh.push({ line: i + 1, row: n.row });
      });

      // existing matches (chunked)
      const existing = new Map<string, Row>();
      const keys = fresh.map((f) => String(f.row.handle).toLowerCase());
      for (let i = 0; i < keys.length; i += 150) {
        const chunk = keys.slice(i, i + 150);
        const { data } = await admin.from("creator_prospects").select(cols).in("handle_key", chunk);
        (data ?? []).forEach((e: Row) => existing.set(keyOf(e.platform, e.handle), e));
      }

      // merge = fill empty fields only (never overwrite, never touch status)
      const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
      const toInsert: { line: number; row: Row }[] = [];
      const dupExisting: { line: number; handle: string; existing_id: unknown; existing_name: unknown; deleted: boolean; fills: string[] }[] = [];
      for (const f of fresh) {
        const ex = existing.get(keyOf(f.row.platform, f.row.handle));
        if (!ex) { toInsert.push(f); continue; }
        const fills = Object.keys(f.row).filter((k) => !["platform", "handle", "status"].includes(k) && isEmpty(ex[k]) && !isEmpty(f.row[k]));
        dupExisting.push({ line: f.line, handle: String(f.row.handle), existing_id: ex.id, existing_name: ex.name, deleted: !!ex.deleted_at, fills });
      }

      const summary = { total: inRows.length, new: toInsert.length, duplicate_existing: dupExisting.length, duplicate_in_file: dupInFile.length, invalid: invalid.length, dropped_v2_fields: droppedV2 };
      const preview = {
        new: toInsert.slice(0, 300).map((f) => ({ line: f.line, handle: f.row.handle, name: f.row.name ?? null, followers: f.row.followers ?? null })),
        duplicate_existing: dupExisting.slice(0, 300), duplicate_in_file: dupInFile.slice(0, 100), invalid: invalid.slice(0, 100),
      };
      if (dryRun) return json({ ok: true, dry_run: true, schema: v2 ? "v2" : "v1", summary, ...preview });

      let inserted = 0, merged = 0;
      // PostgREST bulk insert requires every object in one request to have the SAME keys (PGRST102),
      // and rows from a file differ (some have email/phone, some not). Group rows by their key set and insert each group.
      const groups = new Map<string, Row[]>();
      for (const f of toInsert) {
        const r = { ...f.row, cohort, source: (f.row.source as string) || label, created_by: actor, updated_by: actor };
        const sig = Object.keys(r).sort().join(",");
        groups.set(sig, [...(groups.get(sig) || []), r]);
      }
      for (const rows of groups.values()) {
        for (let i = 0; i < rows.length; i += 100) {
          const { data, error } = await admin.from("creator_prospects").upsert(rows.slice(i, i + 100), { onConflict: "platform,handle_key", ignoreDuplicates: true }).select("id");
          if (error) return json({ ok: false, error: "insert failed", detail: error.message, summary, inserted }, 500);
          inserted += data?.length ?? 0;
        }
      }
      if (merge) {
        for (const d of dupExisting) {
          if (d.deleted || d.fills.length === 0) continue;
          const src = fresh.find((f) => f.line === d.line)!.row;
          const patch: Row = {}; for (const k of d.fills) patch[k] = src[k];
          const { error } = await admin.from("creator_prospects").update({ ...patch, updated_at: new Date().toISOString(), updated_by: actor }).eq("id", d.existing_id as string);
          if (!error) merged++;
        }
      }
      await audit(null, "import", { label, summary, inserted, merged, merge });
      return json({ ok: true, dry_run: false, summary, inserted, merged, ...preview });
    }

    return json({ ok: false, error: "unknown action" }, 400);
  } catch (_e) {
    return json({ ok: false, error: "internal error" }, 500);
  }
});
