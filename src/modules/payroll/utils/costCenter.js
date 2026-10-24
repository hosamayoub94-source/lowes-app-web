// Cost-center resolution — the extensible seam for "payroll sponsor / cost center"
// (design: docs/payroll/proposed/DESIGN_payroll_cost_centers.md). PURE: nothing is stored, nothing in
// the calculation depends on it, and the UAE/Reem center is NOT active:
//   • today a center comes only from the employee's TEAM (Syria / Turkey / Media), no team = Management;
//   • UAE_REEM / OWNER are KNOWN codes so the day an explicit `payroll_cost_center` column exists
//     (future migration) they can be assigned — no team, name or reason text ever maps to them.
// Reem and Arwa are simply excluded from the cycle (payroll_excluded + a written reason).

export const COST_CENTERS = Object.freeze({
  SYRIA: 'SYRIA',
  TURKEY: 'TURKEY',
  MEDIA: 'MEDIA',
  MGMT: 'MGMT',
  OWNER: 'OWNER',       // reserved — only via the future explicit column
  UAE_REEM: 'UAE_REEM', // reserved — NOT active; only via the future explicit column
});

const TEAM_TO_CENTER = Object.freeze({
  'سوريا': COST_CENTERS.SYRIA, syria: COST_CENTERS.SYRIA,
  'تركيا': COST_CENTERS.TURKEY, turkey: COST_CENTERS.TURKEY,
  'ميديا': COST_CENTERS.MEDIA, media: COST_CENTERS.MEDIA,
});

export function resolveCostCenter(profile) {
  const explicit = String(profile?.payroll_cost_center ?? '').trim().toUpperCase();
  if (explicit && Object.prototype.hasOwnProperty.call(COST_CENTERS, explicit)) return COST_CENTERS[explicit];
  const team = String(profile?.team ?? '').trim().toLowerCase();
  return TEAM_TO_CENTER[team] || COST_CENTERS.MGMT;
}

// rows: [{ cost_center, net }] → { CODE: { count, netUsd } } in whole cents
export function summarizeByCostCenter(rows = []) {
  const out = {};
  for (const row of rows) {
    const code = row?.cost_center || COST_CENTERS.MGMT;
    const cur = out[code] || { count: 0, cents: 0 };
    cur.count += 1;
    cur.cents += Math.round((Number(row?.net) || 0) * 100);
    out[code] = cur;
  }
  return Object.fromEntries(Object.entries(out).map(([code, v]) => [code, { count: v.count, netUsd: v.cents / 100 }]));
}
