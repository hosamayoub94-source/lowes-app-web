import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./supabase/functions/verify-pin/index.ts', import.meta.url), 'utf8');

const checks = [
  ['OPTIONS preflight remains supported', /req\.method === 'OPTIONS'/],
  ['Only POST requests reach PIN verification', /req\.method !== 'POST'.*method_not_allowed/s],
  ['Large request bodies are rejected', /contentLength > 8 \* 1024/],
  ['Malformed JSON gets a stable client error', /error: 'invalid_json'/],
  ['Non-object JSON bodies are rejected', /typeof body !== 'object' \|\| Array\.isArray\(body\)/],
  ['Employee name length is bounded', /employeeName\.trim\(\)\.length > 120/],
  ['PIN input length is bounded', /String\(pin\)\.length > 32/],
  ['Employee names are normalized before lookup', /\.eq\('employee_name', employeeName\.trim\(\)\)/],
  ['Server exceptions do not leak to the client', /return json\(\{ ok: false, error: 'server_error' \}, 500\)/],
  ['PIN is removed from the successful response', /const \{ pin: _omit, \.\.\.safeProfile \} = profile/],
];

for (const [label, pattern] of checks) {
  assert.match(source, pattern, label);
  console.log('PASS', label);
}

assert.doesNotMatch(source, /return json\(\{ ok: false, error: String\(err\) \}, 500\)/,
  'Raw server exceptions must never be returned to clients');

for (const errorCode of ['not_found', 'inactive', 'no_pin_set', 'wrong_pin']) {
  assert.ok(source.includes(`error: '${errorCode}'`), `Existing client error code preserved: ${errorCode}`);
}
console.log('PASS existing client error codes are preserved');
console.log(`Passed ${checks.length + 1} verify-pin hardening checks.`);
