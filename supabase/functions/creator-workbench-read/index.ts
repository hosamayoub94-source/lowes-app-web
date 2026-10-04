// Supabase Edge Function: creator-workbench-read  (READ-ONLY)
// Why: public.creator_workbench_items was locked for anon/authenticated (Window 1, 4 Oct 2026).
// This is the only read path: it verifies a real Supabase Auth session, requires profiles.role_type = 'admin'
// (derived server-side from that session, never from the request), then reads with the service role.
// It never writes. It never accepts a table/column/filter from the client.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
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

    const { data: profile } = await admin
      .from("profiles")
      .select("role_type,is_active")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (!profile || profile.is_active === false || profile.role_type !== "admin") {
      return json({ ok: false, error: "admin only" }, 403);
    }

    const { data, error } = await admin
      .from("creator_workbench_items")
      .select("kind,id,data,updated_at")
      .in("kind", ["queue", "assign", "meta"])
      .order("kind", { ascending: true })
      .order("id", { ascending: true })
      .limit(5000);
    if (error) return json({ ok: false, error: "read failed" }, 500);

    return json({ ok: true, count: data?.length ?? 0, rows: data ?? [] });
  } catch (_e) {
    return json({ ok: false, error: "internal error" }, 500);
  }
});
