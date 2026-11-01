/* eslint-env node */
// يحوّل أوراق «تأكيدات التسليم المالية» المعبّأة (CSV، ملف أو أكثر، أو مجلد) إلى حمولة JSON لـ confirm_order_deliveries. محلي فقط: لا شبكة ولا قاعدة.
// usage: node scripts/finance-delivery-import.mjs <ورقة.csv | مجلد> [<ورقة2.csv> ...] [--out <الحمولة.json>]
// بعدها: تُرسل الحمولة أولاً بوضع التجربة (p_apply=false) وتُراجَع النتيجة، ثم بالتطبيق (p_apply=true) بموافقة صريحة.
import fs from 'node:fs';
import path from 'node:path';
import { buildConfirmationPayloadMany } from '../src/utils/financeDeliveryImport.js';

const args = process.argv.slice(2);
const oi = args.indexOf('--out'); const outFile = oi >= 0 ? args.splice(oi, 2)[1] : null;
if (!args.length) { console.error('usage: node scripts/finance-delivery-import.mjs <sheet.csv | dir> [more.csv ...] [--out payload.json]'); process.exit(2); }
const paths = args.flatMap((a) => (fs.statSync(a).isDirectory() ? fs.readdirSync(a).filter((f) => /\.csv$/i.test(f)).sort().map((f) => path.join(a, f)) : [a]));
const r = buildConfirmationPayloadMany(paths.map((p) => ({ name: path.basename(p), text: fs.readFileSync(p, 'utf8') })));
for (const f of r.perFile) console.log(`  ${f.name}: صالح ${f.valid} · غير معبّأ ${f.skipped} · أخطاء ${f.errors}`);
console.log(`المجموع: صالح ${r.payload.length} · غير معبّأ (يُتجاوز) ${r.skipped} · أخطاء ${r.errors.length} · بوقت مفترض 12:00 ${r.assumedTime}`);
for (const e of r.errors) console.log(`  ${e.file} سطر ${e.line} ${e.code}: ${e.error}`);
if (r.errors.length) { console.error('صحّح الأخطاء ثم أعد التشغيل — لا حمولة كُتبت.'); process.exit(1); }
if (!r.payload.length) { console.error('لا صفوف معبّأة — لا حمولة كُتبت.'); process.exit(1); }
const out = outFile || 'finance-delivery-payload.json';
fs.writeFileSync(out, JSON.stringify(r.payload, null, 2));
console.log('حمولة مكتوبة:', out);
