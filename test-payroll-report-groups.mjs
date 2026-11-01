/* global process */
import { buildRunReportHtml } from './src/modules/payroll/utils/runReportHtml.js';
import { MANAGEMENT_EMPLOYEE_IDS } from './src/modules/payroll/utils/payrollGroups.js';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };
const brandPack = { BRAND: { heart: '💛' }, COMPANY: { legalName: 'TEST CO' } };
const [AM] = [...MANAGEMENT_EMPLOYEE_IDS];
const E = (name, team, net, extra = {}) => ({ id: name, employee_name: name, profile_team: team, base_salary_usd: net, net_salary_usd: net, allowances_usd: 0, commission_usd: 0, working_days: 27, absent_days: 0, currency: 'USD', ...extra });
const entries = [
  E('Zed <script>', 'سوريا', 100), E('Ann', 'سوريا', 50), E('Tur', 'تركيا', 200), E('Med', 'ميديا', 70),
  E('Boss', '', 300, { employee_id: AM }), E('Lone', 'عام', 10),
];
const run = { period_year: 2026, period_month: 10, currency: 'USD' };
const now = new Date(2026, 10, 2, 12);

const html = buildRunReportHtml({ entries, run, now, brandPack });
ok(html.includes('سوريا · 2 موظف'), 'قسم سوريا بعدد موظفيه');
ok(html.includes('الإدارة · 1 موظف') && html.includes('أخرى · 1 موظف'), 'قسما الإدارة وأخرى');
ok(!html.includes('<script>Zed') && html.includes('Zed &lt;script&gt;'), 'الأسماء مُهرَّبة (لا حقن HTML)');
ok(html.indexOf('Ann') < html.indexOf('Zed'), 'ترتيب الأسماء داخل القسم');
ok(html.includes('الإجمالي الكلي (لكل عملة)') && html.includes('$730.00'), 'الإجمالي الكامل = 730');
ok((html.match(/class="sub-row"/g) || []).length === 5, 'مجموع جزئي لكل قسم معبّأ (5)');
ok(html.includes('مجموع «سوريا»') && html.includes('$150.00'), 'مجموع سوريا = 150');
ok(!html.includes('(مؤقت)') && !html.includes('تقرير جزئي'), 'شهر مغلق وغير جزئي');

const part = buildRunReportHtml({ entries, run, now, onlyGroup: 'syria', brandPack });
ok(part.includes('تقرير جزئي') && part.includes('قسم «سوريا»'), 'تقرير القسم يُعلَن جزئياً');
ok(!part.includes('Tur') && !part.includes('Med'), 'لا موظفين من أقسام أخرى');
ok(part.includes('إجمالي «سوريا»') && part.includes('الإجمالي الكامل للدورة $730.00'), 'يذكر إجمالي القسم والإجمالي الكامل');

const prov = buildRunReportHtml({ entries, run, now: new Date(2026, 9, 20), brandPack });
ok(prov.includes('(مؤقت)'), 'شهر مفتوح ← مؤقت');

// عملات متعددة
const mixed = buildRunReportHtml({ entries: [E('A', 'تركيا', 10, { currency: 'TRY' }), E('B', 'تركيا', 20)], run, now, brandPack });
ok(mixed.includes('₺') || mixed.includes('TRY'), 'عملة الليرة تظهر');

// مجموع كل الأقسام = الإجمالي
const sumSections = [...html.matchAll(/class="sub-row"><td colspan="6">[^<]*<\/td><td class="right">\$([\d.,]+)/g)].reduce((s, m) => s + Number(m[1].replace(/,/g, '')), 0);
ok(Math.abs(sumSections - 730) < 0.01, 'مجموع المجاميع الجزئية = 730 (' + sumSections + ')');

console.log(`payroll grouped report: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
