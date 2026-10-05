// Supabase Edge Function: creator-prospects  (ADMIN ONLY)
// Single door to public.creator_prospects (RLS on, no policies, no grants for anon/authenticated).
// Auth: real Supabase Auth session -> profiles.role_type = 'admin' (derived server-side, never from the body).
// Actions: list | add | update | bulk_update | delete (soft) | restore | import (dry_run / merge) | audit
// Hard duplicate prevention: unique (platform, handle_key) in the database + pre-check here with a report.
// The client never chooses a table, column list or filter: every field below is whitelisted.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const PLATFORMS = ["instagram", "tiktok", "youtube", "facebook", "other"];
const STATUSES = ["new", "reviewing", "approved", "contacted", "package_sent", "posted", "declined", "rejected"];
const PRIORITIES = ["P0", "P1", "P2"];
const TEXT_FIELDS = ["name", "location", "category", "fit", "evidence", "verification_level", "source", "profile_url", "owner"];
const EDITABLE = ["platform", "handle", "followers", "engagement_pct", "priority", "status", "notes", "verified", ...TEXT_FIELDS];
const BULK_EDITABLE = ["status", "owner", "category", "priority", "verified"];
const MAX_IMPORT = 2000;

const cols = "id,platform,handle,handle_key,name,location,followers,engagement_pct,category,priority,fit,evidence,verification_level,source,profile_url,status,owner,notes,verified,cohort,legacy_id,created_at,created_by,updated_at,updated_by,deleted_at,deleted_by";

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
// Accepts "@handle", "handle", or a profile URL. Returns {platform?, handle}.
function parseHandle(raw: unknown): { platform?: string; handle: string } | null {
  let s = cleanText(raw, 300);
  if (!s) return null;
  let platform: string | undefined;
  if (/^https?:\/\//i.test(s) || /^(www\.)?(instagram|tiktok|youtube|facebook)\.com/i.test(s)) {
    try {
      const u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s);
      const host = u.hostname.replace(/^www\./, "");
      if (host.includes("instagram.com")) platform = "instagram";
      else if (host.includes("tiktok.com")) platform = "tiktok";
      else if (host.includes("youtube.com")) platform = "youtube";
      else if (host.includes("facebook.com")) platform = "facebook";
      const seg = u.pathname.split("/").filter(Boolean)[0] || "";
      s = decodeURIComponent(seg);
    } catch { return null; }
  }
  s = s.replace(/^@+/, "").replace(/\/+$/, "").trim();
  if (!s || s.length > 100 || /\s/.test(s)) return null;
  return { platform, handle: s };
}

type Row = Record<string, unknown>;
function normalizeRow(raw: Row): { row?: Row; error?: string } {
  const ph = parseHandle(raw.handle ?? raw.profile_url);
  if (!ph) return { error: "الحساب (handle) ناقص أو غير صالح" };
  const platformRaw = cleanText(raw.platform, 20)?.toLowerCase();
  const platform = platformRaw && PLATFORMS.includes(platformRaw) ? platformRaw : (ph.platform || "instagram");
  const row: Row = { platform, handle: ph.handle };
  for (const f of TEXT_FIELDS) { const t = cleanText(raw[f]); if (t !== null) row[f] = t; }
  const notes = cleanText(raw.notes, 2000); if (notes !== null) row.notes = notes;
  const fol = parseNum(raw.followers); if (fol !== null) row.followers = Math.max(0, Math.round(fol));
  const er = parseNum(raw.engagement_pct); if (er !== null) row.engagement_pct = Math.max(0, Math.min(9999, er));
  const pr = cleanText(raw.priority, 5)?.toUpperCase(); if (pr && PRIORITIES.includes(pr)) row.priority = pr;
  const st = cleanText(raw.status, 20)?.toLowerCase(); if (st && STATUSES.includes(st)) row.status = st;
  if (typeof raw.verified === "boolean") row.verified = raw.verified;
  return { row };
}
const keyOf = (platform: unknown, handle: unknown) => `${platform}|${String(handle).replace(/^@+/, "").trim().toLowerCase()}`;

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
    const { data: profile } = await admin.from("profiles").select("role_type,is_active,employee_name").eq("id", auth.user.id).maybeSingle();
    if (!profile || profile.is_active === false || profile.role_type !== "admin") return json({ ok: false, error: "admin only" }, 403);
    const actor = String(profile.employee_name || auth.user.id).slice(0, 100);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const audit = (prospect_id: string | null, act: string, changes: unknown) =>
      admin.from("creator_prospect_audit").insert({ prospect_id, action: act, actor, changes });

    if (action === "list") {
      let q = admin.from("creator_prospects").select(cols).order("created_at", { ascending: true }).limit(10000);
      if (!body?.include_deleted) q = q.is("deleted_at", null);
      const { data, error } = await q;
      if (error) return json({ ok: false, error: "read failed" }, 500);
      return json({ ok: true, rows: data ?? [] });
    }

    if (action === "add") {
      const n = normalizeRow(body?.row || {});
      if (!n.row) return json({ ok: false, error: n.error }, 400);
      const k = keyOf(n.row.platform, n.row.handle);
      const { data: ex } = await admin.from("creator_prospects").select("id,handle,deleted_at,name").eq("platform", n.row.platform as string).eq("handle_key", k.split("|")[1]).maybeSingle();
      if (ex) return json({ ok: false, error: "duplicate", duplicate: { id: ex.id, handle: ex.handle, name: ex.name, deleted: !!ex.deleted_at } }, 409);
      const { data, error } = await admin.from("creator_prospects").insert({ ...n.row, cohort: "manual", created_by: actor, updated_by: actor }).select(cols).single();
      if (error) return json({ ok: false, error: error.code === "23505" ? "duplicate" : "insert failed" }, error.code === "23505" ? 409 : 500);
      await audit(data.id, "add", n.row);
      return json({ ok: true, row: data });
    }

    if (action === "update") {
      const id = String(body?.id || "");
      const patchIn = (body?.patch || {}) as Row;
      const patch: Row = {};
      const norm = normalizeRow({ handle: "x", ...patchIn }).row || {};
      for (const f of EDITABLE) {
        if (!(f in patchIn)) continue;
        if (f === "handle") { const ph = parseHandle(patchIn.handle); if (!ph) return json({ ok: false, error: "handle invalid" }, 400); patch.handle = ph.handle; }
        else if (f === "followers" || f === "engagement_pct" || f === "priority" || f === "status" || f === "platform" || f === "verified") {
          if (patchIn[f] === null || patchIn[f] === "") patch[f] = (f === "status" ? "new" : f === "platform" ? "instagram" : f === "verified" ? false : null);
          else if (f in norm) patch[f] = norm[f];
          else if (f === "verified" && typeof patchIn.verified === "boolean") patch.verified = patchIn.verified;
          else return json({ ok: false, error: `${f} invalid` }, 400);
        } else patch[f] = cleanText(patchIn[f], f === "notes" ? 2000 : 500);
      }
      if (!id || Object.keys(patch).length === 0) return json({ ok: false, error: "nothing to update" }, 400);
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
        if (f === "status") { const s = cleanText(patchIn.status, 20)?.toLowerCase(); if (!s || !STATUSES.includes(s)) return json({ ok: false, error: "status invalid" }, 400); patch.status = s; }
        else if (f === "priority") { const p = cleanText(patchIn.priority, 5)?.toUpperCase(); patch.priority = p && PRIORITIES.includes(p) ? p : null; }
        else if (f === "verified") patch.verified = patchIn.verified === true;
        else patch[f] = cleanText(patchIn[f], 200);
      }
      if (ids.length === 0 || Object.keys(patch).length === 0) return json({ ok: false, error: "nothing to update" }, 400);
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
      inRows.forEach((r, i) => {
        const n = normalizeRow(r);
        if (!n.row) { invalid.push({ line: i + 1, handle: cleanText((r as Row).handle, 100), reason: n.error! }); return; }
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

      const toInsert: { line: number; row: Row }[] = [];
      const dupExisting: { line: number; handle: string; existing_id: unknown; existing_name: unknown; deleted: boolean; fills: string[] }[] = [];
      for (const f of fresh) {
        const ex = existing.get(keyOf(f.row.platform, f.row.handle));
        if (!ex) { toInsert.push(f); continue; }
        const fills = Object.keys(f.row).filter((k) => !["platform", "handle"].includes(k) && (ex[k] === null || ex[k] === undefined || ex[k] === "") );
        dupExisting.push({ line: f.line, handle: String(f.row.handle), existing_id: ex.id, existing_name: ex.name, deleted: !!ex.deleted_at, fills });
      }

      const summary = { total: inRows.length, new: toInsert.length, duplicate_existing: dupExisting.length, duplicate_in_file: dupInFile.length, invalid: invalid.length };
      const preview = {
        new: toInsert.slice(0, 300).map((f) => ({ line: f.line, handle: f.row.handle, name: f.row.name ?? null, followers: f.row.followers ?? null })),
        duplicate_existing: dupExisting.slice(0, 300), duplicate_in_file: dupInFile.slice(0, 100), invalid: invalid.slice(0, 100),
      };
      if (dryRun) return json({ ok: true, dry_run: true, summary, ...preview });

      let inserted = 0, merged = 0;
      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100).map((f) => ({ ...f.row, cohort, source: (f.row.source as string) || label, created_by: actor, updated_by: actor }));
        const { data, error } = await admin.from("creator_prospects").upsert(chunk, { onConflict: "platform,handle_key", ignoreDuplicates: true }).select("id");
        if (error) return json({ ok: false, error: "insert failed", summary, inserted }, 500);
        inserted += data?.length ?? 0;
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
