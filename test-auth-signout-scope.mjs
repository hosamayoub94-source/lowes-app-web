// Regression guard: supabase-js signOut() defaults to scope 'global' (revokes the user's sessions on ALL devices).
// Every app sign-out must be local, otherwise logging out on one device kicks the same account out everywhere.
// Run: node test-auth-signout-scope.mjs
import fs from 'node:fs';
import path from 'node:path';

const bad = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
    if (!/\.(js|jsx|ts|tsx)$/.test(e.name)) continue;
    const t = fs.readFileSync(p, 'utf8');
    for (const m of t.matchAll(/auth\.signOut\(([^)]*)\)/g)) if (!/scope:\s*['"]local['"]/.test(m[1])) bad.push(`${p}: ${m[0]}`);
  }
})('src');
if (bad.length) { console.error('FAIL: global signOut found:\n' + bad.join('\n')); process.exit(1); }
console.log('auth signOut scope: all local ✓');
