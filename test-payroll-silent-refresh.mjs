/* global process */
// الدوران الدوري بصفحة الرواتب (كل 30 ثانية) لا يجوز أن يظهر «جار التحميل» ولا يستبدل البيانات إن لم تتغيّر (يرفّ الشاشة).
import { createServer } from 'vite';
import path from 'node:path';

let pass = 0; let fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.error('FAIL', m); } };

globalThis.__rows = { runs: [{ id: 'r1', status: 'draft' }], entries: [{ id: 'e1', net_salary_usd: 10 }] };
const server = await createServer({
  configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
  resolve: { alias: { '@utils': path.resolve('src/utils'), '@': path.resolve('src') } },
  plugins: [{
    name: 'fake-payroll-service', enforce: 'pre',
    resolveId(s) { return /payrollService\.js$/.test(s) ? '\0fake-ps' : null; },
    load(id) {
      return id === '\0fake-ps'
        ? 'export const fetchPayrollRuns = async () => structuredClone(globalThis.__rows.runs); export const fetchPayrollEntries = async () => structuredClone(globalThis.__rows.entries);'
        : null;
    },
  }],
});

try {
  const { default: store } = await server.ssrLoadModule('/src/modules/payroll/store/usePayrollStore.js');
  store.setState({ selectedRunId: 'r1' });
  let sawLoading = false;
  const unsub = store.subscribe((s) => s.loading, (l) => { if (l.entries || l.runs) sawLoading = true; });

  await store.getState().loadEntries('r1');
  ok(sawLoading, 'تحميل أول (غير صامت) يُظهر مؤشر التحميل');
  const first = store.getState().entries;
  ok(first.length === 1, 'القيود حُمّلت');

  sawLoading = false;
  await store.getState().loadEntries('r1', { silent: true });
  await store.getState().loadRuns({}, { silent: true });
  ok(!sawLoading, 'التحديث الصامت لا يُظهر مؤشر التحميل');
  ok(store.getState().entries === first, 'بيانات لم تتغيّر ⇒ نفس المرجع (لا إعادة رسم ولا إعادة فحص)');

  globalThis.__rows.entries = [{ id: 'e1', net_salary_usd: 11 }];
  await store.getState().loadEntries('r1', { silent: true });
  ok(store.getState().entries[0].net_salary_usd === 11, 'تغيّر بالقاعدة ⇒ يظهر بالتحديث الصامت');
  ok(!sawLoading, 'وما زال بلا مؤشر تحميل');

  // دورة أخرى اختيرت أثناء الجلب الصامت: لا نكتب قيودها فوق الدورة الحالية
  store.setState({ selectedRunId: 'r2' });
  globalThis.__rows.entries = [{ id: 'x', net_salary_usd: 99 }];
  await store.getState().loadEntries('r1', { silent: true });
  ok(store.getState().entries[0].id === 'e1', 'جلب صامت لدورة لم تعد مختارة لا يُكتب');
  unsub();
} finally {
  await server.close();
}
console.log(`payroll silent refresh: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
