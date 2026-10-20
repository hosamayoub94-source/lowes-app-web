import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const path = 'supabase/functions/track-karam/index.ts';
const source = readFileSync(path, 'utf8');

// track-karam is deployed with verify_jwt=false so the provider-side phone-debug
// paths must not be reintroduced as request-body switches. They returned tracking
// numbers/statuses for arbitrary supplied phone numbers without a session check.
assert.doesNotMatch(source, /body\?\.debugPhone\b/, 'public single-phone debug route must remain removed');
assert.doesNotMatch(source, /body\?\.debugPhones\b/, 'public batch phone-debug route must remain removed');
assert.doesNotMatch(source, /debugPhone/, 'do not reintroduce the public phone lookup debug API');

console.log('PASS: track-karam has no unauthenticated phone-debug request modes.');
