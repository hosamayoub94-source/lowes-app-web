import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  checkPinRateLimit,
  getTrustedSourceAddress,
  hmacSha256Hex,
  readPinRateLimitConfig,
} from './supabase/functions/_shared/pinRateLimit.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const passed = [];
async function test(name, fn) {
  await fn();
  passed.push(name);
  console.log('PASS', name);
}

const validEnvValues = {
  PIN_RATE_LIMIT_ENABLED: 'true',
  PIN_RATE_LIMIT_PEPPER: 'a-long-test-only-pepper-that-is-never-a-production-secret',
  PIN_RATE_LIMIT_WINDOW_SECONDS: '300',
  PIN_RATE_LIMIT_ACCOUNT_MAX: '5',
  PIN_RATE_LIMIT_SOURCE_MAX: '30',
};
const envFrom = (values) => ({ get: (key) => values[key] ?? null });
const requestWith = (headers = {}) => new Request('https://unit.test/functions/v1/verify-pin', { headers });

await test('limiter remains a no-op when feature flag is absent', async () => {
  let calls = 0;
  const result = await checkPinRateLimit({
    request: requestWith(),
    employeeName: 'Test Employee',
    client: { rpc: async () => { calls += 1; return { data: true, error: null }; } },
    env: envFrom({}),
  });
  assert.deepEqual(result, { allowed: true, skipped: true });
  assert.equal(calls, 0);
});

await test('enabled config accepts explicit bounded parameters only', async () => {
  const config = readPinRateLimitConfig(envFrom(validEnvValues));
  assert.equal(config.enabled, true);
  assert.equal(config.unavailable, undefined);
  assert.equal(config.windowSeconds, 300);
  assert.equal(config.accountLimit, 5);
  assert.equal(config.sourceLimit, 30);
  assert.equal(readPinRateLimitConfig(envFrom({ ...validEnvValues, PIN_RATE_LIMIT_ACCOUNT_MAX: '0' })).unavailable, true);
  assert.equal(readPinRateLimitConfig(envFrom({ ...validEnvValues, PIN_RATE_LIMIT_WINDOW_SECONDS: '300x' })).unavailable, true);
  assert.equal(readPinRateLimitConfig(envFrom({ ...validEnvValues, PIN_RATE_LIMIT_PEPPER: 'short' })).unavailable, true);
});

await test('only cf-connecting-ip is considered a trusted source address', async () => {
  assert.equal(getTrustedSourceAddress(requestWith({ 'cf-connecting-ip': '203.0.113.8' })), '203.0.113.8');
  assert.equal(getTrustedSourceAddress(requestWith({ 'x-forwarded-for': '203.0.113.8' })), null);

  let calls = 0;
  const result = await checkPinRateLimit({
    request: requestWith({ 'x-forwarded-for': '203.0.113.8' }),
    employeeName: 'Test Employee',
    client: { rpc: async () => { calls += 1; return { data: true, error: null }; } },
    env: envFrom(validEnvValues),
  });
  assert.deepEqual(result, { allowed: false, reason: 'unavailable' });
  assert.equal(calls, 0);
});

await test('account and source identifiers are HMAC hashes, not raw values', async () => {
  const args = [];
  const client = {
    rpc: async (name, parameters) => {
      args.push({ name, parameters });
      return { data: true, error: null };
    },
  };
  const result = await checkPinRateLimit({
    request: requestWith({ 'cf-connecting-ip': '203.0.113.8' }),
    employeeName: '  TÉST Employee  ',
    client,
    env: envFrom(validEnvValues),
  });

  assert.deepEqual(result, { allowed: true, reason: 'allowed' });
  assert.equal(args.length, 1);
  assert.equal(args[0].name, 'consume_pin_attempt_rate_limit');
  const p = args[0].parameters;
  assert.match(p.p_account_hash, /^[0-9a-f]{64}$/);
  assert.match(p.p_source_hash, /^[0-9a-f]{64}$/);
  assert.equal(p.p_window_seconds, 300);
  assert.equal(p.p_account_limit, 5);
  assert.equal(p.p_source_limit, 30);
  assert.equal(JSON.stringify(p).includes('TÉST Employee'), false);
  assert.equal(JSON.stringify(p).includes('203.0.113.8'), false);
  assert.equal(p.p_account_hash, await hmacSha256Hex(validEnvValues.PIN_RATE_LIMIT_PEPPER, 'account', 'tést employee'));
});

await test('denial is distinct from limiter infrastructure failure', async () => {
  const request = requestWith({ 'cf-connecting-ip': '203.0.113.8' });
  const denied = await checkPinRateLimit({
    request,
    employeeName: 'Employee',
    client: { rpc: async () => ({ data: false, error: null }) },
    env: envFrom(validEnvValues),
  });
  assert.deepEqual(denied, { allowed: false, reason: 'limited' });

  const failed = await checkPinRateLimit({
    request,
    employeeName: 'Employee',
    client: { rpc: async () => ({ data: null, error: { message: 'test only' } }) },
    env: envFrom(validEnvValues),
  });
  assert.deepEqual(failed, { allowed: false, reason: 'unavailable' });
});

console.log(`PIN limiter helper: ${passed.length}/5 checks passed`);
