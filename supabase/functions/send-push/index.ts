// =============================================================
// Supabase Edge Function — send-push
// Sends a Web Push notification to one user's subscribed devices.
//
// Deploy:
//   supabase functions deploy send-push --no-verify-jwt
//
// Required secrets (Dashboard → Edge Functions → Secrets) — values NOT stored here:
//   VAPID_PUBLIC_KEY   (public key is also in client .env)
//   VAPID_PRIVATE_KEY  (secret — set in Supabase Secrets only)
//   VAPID_SUBJECT      = mailto:hosam.ayoub94@gmail.com
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected.
// =============================================================

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush          from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      userId,
      title = 'لويز برو 🌿',
      body  = '',
      url   = '/',
      tag   = 'lowes-push',
      icon  = '/icons/icon-192.png',
    } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Admin client — bypasses RLS so it can read any user's subscriptions
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    // Fetch all registered devices for this user
    const { data: subs, error: fetchErr } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId);

    if (fetchErr) throw new Error(fetchErr.message);
    if (!subs?.length) {
      return new Response(
        JSON.stringify({ sent: 0, message: 'no subscriptions' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT')!,
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    );

    const payload = JSON.stringify({ title, body, url, tag, icon });

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 3600 },
        )
      ),
    );

    // Remove expired/invalid subscriptions (410 = Gone)
    const stale: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const code = (r.reason as any)?.statusCode;
        if (code === 410 || code === 404) stale.push(subs[i].endpoint);
      }
    });
    if (stale.length) {
      await supabase.from('push_subscriptions').delete().in('endpoint', stale);
    }

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    return new Response(
      JSON.stringify({ sent, total: subs.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[send-push]', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
