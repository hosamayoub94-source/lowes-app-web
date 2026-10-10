// Supabase Edge Function: whatsapp-send-proxy
// Part of the R-13 fix (14 Sep 2026) -- see
// lowes-classic/AI/Architecture/TrustBoundary-WhatsApp-CrossProject.md for the full design.
//
// WHY THIS EXISTS: whatsapp-send lives on a different Supabase project
// (kesoqnwyydycuyifqfhl -- lowes-classic's WhatsApp/Twilio backend). The browser can never hold a
// secret (anything shipped to it is public by definition -- the anon key was never actually a
// secret, which is exactly why the old direct-fetch call was a real vulnerability there). What the
// browser CAN legitimately prove is a real user session against THIS project's own Auth -- the
// WhatsApp admin screen is already behind ProtectedRoute.jsx, so that session already exists at
// call time. This function verifies that real session, then relays server-to-server to
// kesoqnwyydycuyifqfhl carrying LOWES_WHATSAPP_INTERNAL_API_KEY (a secret generated for this fix,
// stored only as an edge-function env var on both projects -- never sent to any browser).
//
// CALLED FROM src/services/whatsappService.js via supabase.functions.invoke('whatsapp-send-proxy',
// {body}), which attaches the caller's real session Authorization header automatically.

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

// +963 / 00963 / 963… أو الصيغة المحلية السورية 09xxxxxxxx (10 خانات). نفس المنطق بـwhatsappService.js.
function isSyrianNumber(raw: string): boolean {
  const s = raw.replace(/^whatsapp:/, "").replace(/[^\d+]/g, "");
  const intl = s.replace(/^\+/, "").replace(/^00/, "");
  if (s.startsWith("+") || s.startsWith("00") || intl.length > 10) return intl.startsWith("963");
  return /^09\d{8}$/.test(s);
}

const UPSTREAM_URL = "https://kesoqnwyydycuyifqfhl.supabase.co/functions/v1/whatsapp-send";

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

    // 10 تشرين الأول 2026 (قرار حسام): واتساب الرسمي محظور على أرقام سوريا (+963)
    // ولا نريد إرسالاً لها إطلاقاً — حظر مركزي يشمل الإرسال اليدوي والتحويل والحملات.
    try {
      const sentPhone = String(JSON.parse(bodyText)?.phone ?? "");
      if (isSyrianNumber(sentPhone)) {
        return json({ ok: false, error: "الإرسال لأرقام سوريا (+963) متوقف — واتساب الرسمي محظور عليها." }, 403);
      }
    } catch { /* جسم غير JSON — يمرّ للوسيط كما كان */ }

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
