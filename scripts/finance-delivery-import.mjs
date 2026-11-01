/* eslint-env node */
// يحوّل ورقة «تأكيدات التسليم المالية» المعبّأة (CSV) إلى حمولة JSON لـ confirm_order_deliveries. محلي فقط: لا شبكة ولا قاعدة.
// usage: node scripts/finance-delivery-import.mjs <الورقة.csv> [<الحمولة.json>]
// بعدها: تُرسل الحمولة أولاً بوضع التجربة (p_apply=false) وتُراجَع النتيجة، ثم بالتطبيق (p_apply=true) بموافقة صريحة.
import fs from 'node:fs';
import { buildConfirmationPayload } from '../src/utils/financeDeliveryImport.js';

const [, , inFile, outFile] = process.argv;
if (!inFile) { console.error('usage: node scripts/finance-delivery-import.mjs <sheet.csv> [payload.json]'); process.exit(2); }
const r = buildConfirmationPayload(fs.readFileSync(inFile, 'utf8'));
console.log(`صالح: ${r.payload.length} · غير معبّأ (يُتجاوز): ${r.skipped} · أخطاء: ${r.errors.length} · بوقت مفترض 12:00: ${r.assumedTime}`);
for (const e of r.errors) console.log(`  سطر ${e.line} ${e.code}: ${e.error}`);
if (r.errors.length) { console.error('صحّح الأخطاء ثم أعد التشغيل — لا حمولة كُتبت.'); process.exit(1); }
const out = outFile || inFile.replace(/\.csv$/i, '') + '.payload.json';
fs.writeFileSync(out, JSON.stringify(r.payload, null, 2));
console.log('حمولة مكتوبة:', out);
