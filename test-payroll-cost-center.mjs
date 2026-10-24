/* global process */
import { resolveCostCenter, summarizeByCostCenter, COST_CENTERS } from './src/modules/payroll/utils/costCenter.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };

// today: team decides, no team = management
ok(resolveCostCenter({ team: 'سوريا' }) === 'SYRIA', 'Syria team -> SYRIA');
ok(resolveCostCenter({ team: 'تركيا' }) === 'TURKEY', 'Turkey team -> TURKEY');
ok(resolveCostCenter({ team: 'ميديا' }) === 'MEDIA', 'Media team -> MEDIA');
ok(resolveCostCenter({ team: 'Syria ' }) === 'SYRIA' && resolveCostCenter({ team: 'TURKEY' }) === 'TURKEY', 'latin names and spacing are tolerated');
ok(resolveCostCenter({ team: null }) === 'MGMT' && resolveCostCenter({}) === 'MGMT' && resolveCostCenter(null) === 'MGMT', 'no team / no profile -> MGMT');
ok(resolveCostCenter({ team: 'الإمارات' }) === 'MGMT', 'an unknown team is NOT silently turned into a real center');

// the UAE / Reem center is NOT active: nothing maps to it implicitly
for (const p of [
  { employee_name: 'Reem alkshki', team: null },
  { employee_name: 'Arwa Mohammed', team: 'تركيا', payroll_excluded: true, payroll_excluded_reason: 'paid by Reem (UAE) — outside the Syria cycle' },
  { employee_name: 'Someone', team: 'UAE' },
  { team: 'سوريا', payroll_excluded_reason: 'UAE sponsor — no salary from the Syria cycle' },
]) ok(resolveCostCenter(p) !== COST_CENTERS.UAE_REEM && resolveCostCenter(p) !== COST_CENTERS.OWNER, `no implicit UAE/OWNER mapping for ${JSON.stringify(p).slice(0, 60)}`);

// future-ready: an explicit column wins (this is how UAE_REEM would be switched on later)
ok(resolveCostCenter({ team: 'تركيا', payroll_cost_center: 'uae_reem' }) === 'UAE_REEM', 'an explicit payroll_cost_center wins when the column exists');
ok(resolveCostCenter({ team: 'سوريا', payroll_cost_center: 'NOPE' }) === 'SYRIA', 'an invalid explicit value falls back to the team');

// summary in whole cents
const s = summarizeByCostCenter([
  { cost_center: 'SYRIA', net: 10.05 }, { cost_center: 'SYRIA', net: 20.05 }, { cost_center: 'MEDIA', net: 57.25 }, { net: 5 },
]);
ok(s.SYRIA.count === 2 && s.SYRIA.netUsd === 30.1, 'SYRIA: 2 entries, 30.10 (no float noise)');
ok(s.MEDIA.count === 1 && s.MEDIA.netUsd === 57.25 && s.MGMT.count === 1 && s.MGMT.netUsd === 5, 'MEDIA and the default MGMT bucket');
ok(Object.keys(summarizeByCostCenter([])).length === 0, 'empty -> empty');

console.log(`payroll cost center: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
