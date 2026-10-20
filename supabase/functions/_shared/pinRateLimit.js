// Shared opt-in PIN attempt limiter. Uses only Web Crypto so the helper can
// be tested with Node.js and run in the Supabase Deno Edge Runtime.
const LIMITER_RPC = 'consume_pin_attempt_rate_limit';

function boundedInteger(env, name, min, max) {
  const raw = env.get(name);
  if (raw == null || !/^\d+$/.test(String(raw).trim())) return null;
  const parsed = Number(String(raw).trim());
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function readPinRateLimitConfig(env) {
  if (env.get('PIN_RATE_LIMIT_ENABLED') !== 'true') {
    return { enabled: false };
  }

  const pepper = env.get('PIN_RATE_LIMIT_PEPPER');
  const windowSeconds = boundedInteger(env, 'PIN_RATE_LIMIT_WINDOW_SECONDS', 1, 86400);
  const accountLimit = boundedInteger(env, 'PIN_RATE_LIMIT_ACCOUNT_MAX', 1, 10000);
  const sourceLimit = boundedInteger(env, 'PIN_RATE_LIMIT_SOURCE_MAX', 1, 100000);

  // A short/missing pepper or missing threshold is a configuration error.
  // Once the feature is enabled, configuration failure must not bypass limiting.
  if (typeof pepper !== 'string' || pepper.length < 32 ||
      windowSeconds == null || accountLimit == null || sourceLimit == null) {
    return { enabled: true, unavailable: true };
  }

  return { enabled: true, pepper, windowSeconds, accountLimit, sourceLimit };
}

/**
 * Trust only the Cloudflare gateway header. Do not fall back to X-Forwarded-For,
 * whose left-most values can be client supplied. The gate must verify this header
 * in the deployed Supabase path before enabling the limiter.
 */
export function getTrustedSourceAddress(request) {
  const address = request.headers.get('cf-connecting-ip');
  return typeof address === 'string' && address.trim() ? address.trim() : null;
}

export async function hmacSha256Hex(pepper, scope, value) {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto unavailable');

  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`lowes-pin-rate-limit:v1:${scope}:${value}`),
  );

  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns { allowed: true } when disabled or the database accepts the attempt.
 * When enabled, configuration/IP/RPC failure returns { allowed: false, reason:
 * 'unavailable' } so callers fail closed. It never returns/logs the input values.
 */
export async function checkPinRateLimit({ request, employeeName, client, env }) {
  const config = readPinRateLimitConfig(env);
  if (!config.enabled) return { allowed: true, skipped: true };
  if (config.unavailable) return { allowed: false, reason: 'unavailable' };

  const sourceAddress = getTrustedSourceAddress(request);
  if (!sourceAddress) return { allowed: false, reason: 'unavailable' };

  try {
    const normalizedAccount = String(employeeName ?? '')
      .normalize('NFKC')
      .trim()
      .toLocaleLowerCase('en-US');
    const [accountHash, sourceHash] = await Promise.all([
      hmacSha256Hex(config.pepper, 'account', normalizedAccount),
      hmacSha256Hex(config.pepper, 'source', sourceAddress),
    ]);

    const { data, error } = await client.rpc(LIMITER_RPC, {
      p_account_hash: accountHash,
      p_source_hash: sourceHash,
      p_window_seconds: config.windowSeconds,
      p_account_limit: config.accountLimit,
      p_source_limit: config.sourceLimit,
    });

    if (error || typeof data !== 'boolean') return { allowed: false, reason: 'unavailable' };
    return { allowed: data, reason: data ? 'allowed' : 'limited' };
  } catch {
    // Do not return implementation details or log names, addresses, hashes, or secrets.
    return { allowed: false, reason: 'unavailable' };
  }
}
