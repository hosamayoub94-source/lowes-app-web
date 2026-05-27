// =============================================================
// Supabase Edge Function: send-push
// Deno runtime — called by webPushService.triggerWebPush()
//
// Required env vars (set in Supabase Dashboard → Edge Functions):
//   VAPID_PUBLIC_KEY   — base64url public key
//   VAPID_PRIVATE_KEY  — base64url private key (KEEP SECRET)
//   VAPID_SUBJECT      — mailto:your@email.com
//   SUPABASE_URL       — your project URL
//   SUPABASE_SERVICE_ROLE_KEY — service role key (has full DB access)
//
// Generate VAPID keys:
//   npx web-push generate-vapid-keys
//
// Deploy:
//   supabase functions deploy send-push
// =============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Web Push via webpush-deno ──────────────────────────────────
// Uses the standard VAPID protocol + AES-GCM encryption
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@lowes-pro.com';

// ── CORS headers ───────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // ── Parse body ─────────────────────────────────────────────
    const { userId, title, body = '', url = '/', notifId, tag = 'lowes' } =
      await req.json() as {
        userId: string;
        title:  string;
        body?:  string;
        url?:   string;
        notifId?: string;
        tag?:   string;
      };

    if (!userId || !title) {
      return new Response(JSON.stringify({ error: 'userId + title required' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Load push subscriptions for this user ──────────────────
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: subs, error: dbErr } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId);

    if (dbErr) throw dbErr;
    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0, message: 'no subscriptions' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Configure VAPID ────────────────────────────────────────
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    // ── Send to all subscriptions ──────────────────────────────
    const payload = JSON.stringify({ title, body, url, notifId, tag,
                                     icon: '/icons/icon-192.png' });

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 86400 } // 24h
        )
      )
    );

    // ── Handle expired subscriptions ───────────────────────────
    const expiredEndpoints: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const statusCode = (r.reason as any)?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          // Subscription expired — clean up
          expiredEndpoints.push(subs[i].endpoint);
        }
      }
    });

    if (expiredEndpoints.length) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', expiredEndpoints);
    }

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    return new Response(JSON.stringify({ sent, total: subs.length }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-push]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
