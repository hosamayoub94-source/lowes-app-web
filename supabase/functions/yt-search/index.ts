// =============================================================
// Supabase Edge Function — yt-search
// Search YouTube by name (no API key) and return the first result.
// Lets the chat music bot play songs by NAME instead of a URL.
//
// Deploy: supabase functions deploy yt-search --no-verify-jwt
// =============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { q } = await req.json();
    if (!q || !String(q).trim()) {
      return new Response(JSON.stringify({ error: 'q required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const query = String(q).trim();
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=ar`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept-Language': 'ar,en;q=0.9',
      },
    });
    const html = await res.text();

    // First real video id in the search results payload
    const idMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    const videoId = idMatch?.[1] ?? null;

    // Title that appears right after that first videoId
    let title = query;
    const titleMatch = html.match(/"videoId":"[a-zA-Z0-9_-]{11}"[\s\S]{0,600}?"title":\{"runs":\[\{"text":"([^"]+)"/);
    if (titleMatch) {
      try { title = JSON.parse(`"${titleMatch[1]}"`); } catch { title = titleMatch[1]; }
    }

    return new Response(JSON.stringify({ videoId, title }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), videoId: null }), {
      status: 200, // soft-fail so the chat bot can show a friendly message
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
