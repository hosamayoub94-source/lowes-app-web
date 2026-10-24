/* global process */
import { readFileSync } from 'node:fs';
import { buildAbsenceCandidates, workingDates, monthBounds, isDeductibleReview } from './src/modules/payroll/utils/absenceCandidates.js';

let pass = 0;
let fail = 0;
const ok = (condition, message) => {
  if (condition) pass += 1;
  else { fail += 1; console.error('FAIL', message); }
};
const days = (rows, name) => rows.filter((r) => r.employee_name === name).map((r) => r.absence_date);

// ── HR month ↔ AbsenceReviewPanel: the panel must receive the SAME state the month <select> controls.
{
  const src = readFileSync('./src/screens/HRDashboard.jsx', 'utf8');
  const stateName = src.match(/const \[(\w+),\s*set(\w+)\]\s*=\s*useState\(months\[0\]\.val\)/);
  ok(stateName, 'HRDashboard keeps the selected month in state');
  const m = stateName?.[1];
  ok(new RegExp(`<select value=\\{${m}\\} onChange=\\{e => set\\w+\\(e\\.target\\.value\\)\\}`).test(src), 'month <select> is bound to that state');
  ok(new RegExp(`<AbsenceReviewPanel month=\\{${m}\\} />`).test(src), 'AbsenceReviewPanel receives the selected month (not a hardcoded/previous month)');
  const panel = readFileSync('./src/components/payroll/AbsenceReviewPanel.jsx', 'utf8');
  ok(/\[month\]\)/.test(panel) && /monthBounds\(month\)/.test(panel), 'panel reloads from its month prop');
}

// ── Month bounds / Sundays
ok(monthBounds('2026-10').to === '2026-10-31', 'October ends on 31');
ok(monthBounds('2026-02').to === '2026-02-28', 'February 2026 ends on 28');
ok(monthBounds('2028-02').to === '2028-02-29', 'February 2028 ends on 29');
ok(!workingDates('2026-10').includes('2026-10-04'), 'Sunday 4 Oct 2026 excluded');
ok(workingDates('2026-10').length === 27, 'October 2026 has 27 non-Sunday days');

// ── Exclusions
const profiles = [
  { id: 'p1', employee_name: 'Present', role_type: 'employee' },
  { id: 'p2', employee_name: 'Leave', role_type: 'employee' },
  { id: 'p3', employee_name: 'Excluded', role_type: 'employee', payroll_excluded: true },
  { id: 'p4', employee_name: 'Admin', role_type: 'admin' },
  { id: 'p5', employee_name: 'Joiner', role_type: 'employee', join_date: '2026-10-20' },
  { id: 'p6', employee_name: 'Leaver', role_type: 'employee', resigned_at: '2026-10-05' },
  { id: 'p7', employee_name: 'OldLeaver', role_type: 'employee', resigned_at: '2026-09-15' },
  { id: 'p8', employee_name: 'Holiday', role_type: 'employee' },
];
const attendance = [];
for (const date of workingDates('2026-10')) {
  if (date !== '2026-10-07') attendance.push({ employee_name: 'Present', date: date.replaceAll('-', '/'), status: '✅ حاضر' });
  attendance.push({ employee_name: 'Holiday', date: date.replaceAll('-', '/'), status: '✅ حاضر' });
}
attendance.push({ employee_name: 'Holiday', date: '2026/10/08', status: '🌟 عطلة أسبوعية' });
const rows = buildAbsenceCandidates({
  month: '2026-10',
  today: '2026-10-23',
  profiles,
  attendance,
  approvedLeaves: [{ employee_name: 'Leave', start_date: '2026-10-01', end_date: '2026-10-31' }],
  holidays: ['2026-10-06'],
});
ok(JSON.stringify(days(rows, 'Present')) === '["2026-10-07"]', `present employee: only the one missing day (${days(rows, 'Present')})`);
ok(days(rows, 'Leave').length === 0, 'approved leave covering the month → no absence');
ok(days(rows, 'Excluded').length === 0, 'payroll_excluded employee never listed');
ok(days(rows, 'Admin').length === 0, 'admin never listed');
ok(days(rows, 'Joiner').every((d) => d >= '2026-10-20') && days(rows, 'Joiner').length > 0, 'no days before join date');
ok(JSON.stringify(days(rows, 'Leaver')) === '["2026-10-01","2026-10-02","2026-10-03","2026-10-05"]', `no days after resignation (${days(rows, 'Leaver')})`);
ok(days(rows, 'OldLeaver').length === 0, 'resigned before the month → not listed');
ok(rows.every((r) => r.absence_date <= '2026-10-23'), 'no future days');
ok(!rows.some((r) => r.absence_date === '2026-10-06'), 'official holiday excluded for everyone');
ok(days(rows, 'Holiday').length === 0, 'recorded weekly-off/holiday attendance excluded');

// Leave matched by id beats a name mismatch; single-day leave with no end_date
{
  const r = buildAbsenceCandidates({
    month: '2026-10', today: '2026-10-03',
    profiles: [{ id: 'x', employee_name: 'Renamed', role_type: 'employee' }],
    approvedLeaves: [{ employee_id: 'x', employee_name: 'Old name', start_date: '2026-10-01', end_date: null }],
  });
  ok(JSON.stringify(days(r, 'Renamed')) === '["2026-10-02","2026-10-03"]', `single-day leave by id (${days(r, 'Renamed')})`);
}

// ── Deduction only on approved
ok(isDeductibleReview({ status: 'approved' }), 'approved deducts');
ok(!isDeductibleReview({ status: 'rejected' }), 'rejected does not deduct');
ok(!isDeductibleReview({ status: 'pending' }), 'pending does not deduct');
ok(!isDeductibleReview(undefined), 'no decision does not deduct');
{
  // The engine reads only status=approved reviews.
  const svc = readFileSync('./src/modules/payroll/services/absenceReviewService.js', 'utf8');
  ok(/listApprovedAbsenceReviews[\s\S]*r\.status === 'approved'/.test(svc), 'engine fetch keeps only status=approved');
}

console.log(`payroll absence/HR: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
