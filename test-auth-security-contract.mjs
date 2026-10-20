// Static regression checks for the public PIN-verification boundary.
// These checks are intentionally source-level guards, not end-to-end Auth tests.
// Run with: node test-auth-security-contract.mjs
import fs from 'node:fs';

const authService = fs.readFileSync('src/services/authService.js', 'utf8');
const verifyPin = fs.readFileSync('supabase/functions/verify-pin/index.ts', 'utf8');
const limiter = fs.readFileSync('supabase/functions/_shared/pinRateLimit.js', 'utf8');

const checks = [
  [
    'PIN endpoint preserves OPTIONS preflight',
    verifyPin.includes("if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });"),
  ],
  [
    'PIN endpoint rejects non-POST methods before processing credentials',
    verifyPin.indexOf("if (req.method !== 'POST')") > verifyPin.indexOf("if (req.method === 'OPTIONS')") &&
      verifyPin.indexOf("if (req.method !== 'POST')") < verifyPin.indexOf('const { employeeName, pin } = await req.json();'),
  ],
  [
    'Non-POST response uses stable method_not_allowed code and HTTP 405',
    verifyPin.includes("error: 'method_not_allowed'") && verifyPin.includes('status: 405'),
  ],
  [
    'Unexpected PIN endpoint errors use a stable server_error response',
    verifyPin.includes("return json({ ok: false, error: 'server_error' }, 500);"),
  ],
  [
    'PIN endpoint does not return raw exception text to callers',
    !/return\s+json\(\{\s*ok:\s*false,\s*error:\s*String\((?:err|e)\)/.test(verifyPin) &&
      !/return\s+json\(\{\s*ok:\s*false,\s*error:\s*err\.message/.test(verifyPin),
  ],
  [
    'Successful PIN response strips the stored PIN before returning profile data',
    verifyPin.includes('const { pin: _omit, ...safeProfile } = profile;') &&
      verifyPin.includes('return json({ ok: true, profile: safeProfile, authIdentity }, 200);'),
  ],
  [
    'PIN limiter is opt-in unless explicitly enabled',
    limiter.includes("env.get('PIN_RATE_LIMIT_ENABLED') !== 'true'"),
  ],
  [
    'Enabled limiter runs before the profile lookup',
    verifyPin.indexOf('checkPinRateLimit({') >= 0 &&
      verifyPin.indexOf('checkPinRateLimit({') < verifyPin.indexOf(".from('profiles')"),
  ],
  [
    'Limiter infrastructure failure fails closed without exposing details',
    verifyPin.includes("rateLimitDecision.reason === 'unavailable'") &&
      verifyPin.includes("return json({ ok: false, error: 'server_error' }, 503);"),
  ],
  [
    'Source limiter trusts only cf-connecting-ip, not X-Forwarded-For',
    limiter.includes("request.headers.get('cf-connecting-ip')") &&
      !limiter.includes("request.headers.get('x-forwarded-for')"),
  ],
  [
    'Successful-login audit payload does not write an access-token fragment',
    !/sessionId\s*:\s*data\.session\?\.access_token/.test(authService) &&
      !/access_token\s*\?\.slice\(0,\s*20\)/.test(authService),
  ],
];

let failures = 0;
for (const [label, passed] of checks) {
  if (passed) console.log(`PASS  ${label}`);
  else {
    failures += 1;
    console.error(`FAIL  ${label}`);
  }
}

if (failures) {
  console.error(`Auth security source guards: ${checks.length - failures}/${checks.length} passed`);
  process.exit(1);
}

console.log(`Auth security source guards: ${checks.length}/${checks.length} passed`);
console.log('Note: source guards do not replace staging integration tests or prove rate limiting.');
