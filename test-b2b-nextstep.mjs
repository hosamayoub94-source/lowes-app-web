/* eslint-env node */
// «الخطوة التالية» + متابعة + المسؤول + رسالة التواصل لليدز B2B (منطق نقي). Run: node test-b2b-nextstep.mjs
import { build } from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const root = process.cwd();
const out = path.join(process.env.TEMP || '.', 'b2b_nextstep_bundle.mjs');
await build({ entryPoints: [path.join(root, 'src/services/b2bNextStep.js')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent', define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'stub', setup(b) {
    // syriaLeadsService imports the Supabase client; the logic under test is pure, so stub every non-relative import.
    b.onResolve({ filter: /.*/ }, (x) => (x.kind === 'import-statement' && /^[@a-z]/i.test(x.path) && !/^[a-z]:/i.test(x.path) ? { path: x.path, namespace: 'stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const supabase = {}; export const createClient = () => ({}); export default {};', loader: 'js' }));
  } }] });
const m = await import(pathToFileURL(out).href);
const NOW = Date.parse('2026-10-12T12:00:00Z');
const day = (n) => new Date(NOW - n * 86400000).toISOString();

// not contacted
ok(m.nextStep({ status: 'not_contacted' }, NOW).key === 'find_contact', 'no contact method -> find_contact');
ok(m.nextStep({ status: 'not_contacted', instagram: '@x' }, NOW).key === 'contact_social', 'social only -> contact_social');
ok(m.nextStep({ whatsapp: '0911', priority: 'A' }, NOW).key === 'contact_now', 'A priority + whatsapp -> contact_now');
ok(m.nextStep({ phone: '1', priority: 'B' }, NOW).key === 'contact_now', 'B priority -> contact_now');
ok(m.nextStep({ phone: '1', priority: 'D' }, NOW).key === 'contact_later', 'D priority -> contact_later');
ok(m.nextStep({ email: 'a@b.c', priority: 'A' }, NOW).key === 'contact_now', 'email counts as direct enough');
// contacted
ok(m.nextStep({ status: 'contacted', status_updated_at: day(1) }, NOW).key === 'wait_reply', '1 day -> wait_reply');
ok(m.nextStep({ status: 'contacted', status_updated_at: day(2) }, NOW).key === 'wait_reply', '2 days -> still waiting');
ok(m.nextStep({ status: 'contacted', status_updated_at: day(3) }, NOW).key === 'follow_up', '3 days -> follow_up (boundary)');
ok(m.nextStep({ status: 'contacted', status_updated_at: day(10) }, NOW).ar.includes('10'), 'follow_up mentions days');
ok(m.needsFollowUp({ status: 'contacted', status_updated_at: day(9) }, NOW) === true, 'needsFollowUp true');
ok(m.needsFollowUp({ status: 'contacted' }, NOW) === false, 'contacted with no timestamp -> not flagged (unknown)');
ok(m.needsFollowUp({ status: 'interested', status_updated_at: day(30) }, NOW) === false, 'only contacted nags');
// other statuses
ok(m.nextStep({ status: 'interested' }, NOW).key === 'convert', 'interested -> convert');
ok(m.nextStep({ status: 'customer' }, NOW).key === 'customer', 'customer');
ok(m.nextStep({ status: 'not_interested' }, NOW).key === 'closed', 'not_interested closed');
// rank: follow-up before contact_now before waiting before closed
const r = (l) => m.stepRank(l, NOW);
ok(r({ status: 'contacted', status_updated_at: day(5) }) < r({ phone: '1', priority: 'A' }), 'follow-up ranks before contact_now');
ok(r({ phone: '1', priority: 'A' }) < r({ status: 'contacted', status_updated_at: day(0) }), 'contact_now before waiting');
ok(r({ status: 'contacted', status_updated_at: day(0) }) < r({ status: 'not_interested' }), 'waiting before closed');
// owner rule
ok(m.ownerForSave({ assigned_to: 'Diana' }, 'contacted', 'Alice') === 'Diana', 'existing assignee kept');
ok(m.ownerForSave({}, 'contacted', 'Alice') === 'Alice', 'saver becomes owner when contact recorded');
ok(m.ownerForSave({}, 'not_contacted', 'Alice') === null, 'no owner while not contacted');
ok(m.ownerForSave({}, 'contacted', '') === null, 'no name -> null, never a fake name');
ok(m.ownerOf({ status_updated_by: 'Diana' }) === 'Diana' && m.ownerOf({ assigned_to: 'X', status_updated_by: 'Y' }) === 'X', 'ownerOf precedence');
// message
const sy = m.outreachMessage({ name: 'صيدلية النور', category: 'صيدلية' }, 'SY');
ok(sy.includes('صيدلية النور') && sy.includes('كتالوج'), 'SY pharmacy message');
ok(!/\d+\s*%|\$|سعر|خصم|معتمد|شهادة/.test(sy), 'SY message makes no price/discount/certification claims');
const ae = m.outreachMessage({ name: 'Noon Store', lead_type: 'online' }, 'AE');
ok(/Hello Noon Store team/.test(ae) && /Lowe's Professional/.test(ae), 'AE online message in English');
ok(!/\d+\s*%|\$|price|discount|certified/i.test(ae), 'AE message makes no price/certification claims');
ok(m.outreachMessage({}, 'SY').startsWith('أهلاً،'), 'nameless lead -> no "undefined"');
ok(!m.outreachMessage({ name: undefined }, 'AE').includes('undefined'), 'no undefined in AE');

console.log(`b2b-nextstep: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
