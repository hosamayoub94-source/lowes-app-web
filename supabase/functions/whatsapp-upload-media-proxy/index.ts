// Supabase Edge Function: whatsapp-upload-media-proxy
// Part of the R-14 fix (14 Sep 2026) -- same design as whatsapp-send-proxy, see
// lowes-classic/AI/Architecture/TrustBoundary-WhatsApp-CrossProject.md.
//
// Verifies a real lowes-app-web user session (the WhatsApp admin screen is already behind
// ProtectedRoute.jsx), then relays server-to-server to kesoqnwyydycuyifqfhl's
// whatsapp-upload-media carrying LOWES_WHATSAPP_INTERNAL_API_KEY -- never sent to the browser.
//
// CALLED FROM src/services/whatsappService.js via
// supabase.functions.invoke('whatsapp-upload-media-proxy', {body}).

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

const UPSTREAM_URL = "https://kesoqnwyydycuyifqfhl.supabase.co/functions/v1/whatsapp-upload-media";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const raw = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    const token = raw.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ ok: false, error: "authenticated user session required" }, 401);
    const { data, error } = await authAdmin.auth.getUser(token);
    if (error || !data?.user?.id) return json({ ok: false, error: "authenticated user session required" }, 401);

    const internalKey = Deno.env.get("LOWES_WHATSAPP_INTERNAL_API_KEY");
    if (!internalKey) return json({ ok: false, error: "internal key not configured" }, 503);

    const bodyText = await req.text();

    const upstream = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": internalKey },
      body: bodyText,
    });
    const upstreamJson = await upstream.json().catch(() => ({}));
    return json(upstreamJson, upstream.status);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
