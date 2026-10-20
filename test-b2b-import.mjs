/* eslint-env node */
// D-119 — زر استيراد ليدز الإمارات: المنطق النقي (قراءة الملفات، بوابة الأدمن، المعاينة، شرط الحفظ). لا شبكة، لا DB.
// الربط الكامل بالدالة الحقيقية (معاينة ← تحديد ← حفظ) موجود بـtest-b2b-leads-fn.mjs.
// Run: node test-b2b-import.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('FAIL:', m); } };
const root = process.cwd();
const out = path.join(root, '.tmp-b2b-import-unit.mjs');
await build({ entryPoints: [path.join(root, 'src/services/b2bImport.js')], bundle: true, format: 'esm', platform: 'node', outfile: out, external: ['xlsx'], logLevel: 'silent' });
let m;
try { m = await import(pathToFileURL(out).href + `?t=${Date.now()}`); } finally { fs.unlinkSync(out); }
const { canImportLeads, rowsFromJsonText, rowsFromSheetBuffer, buildPreview, rowsToSave, canSave, isWeakSource, MAX_IMPORT_ROWS, mapColumns, applyFileDefaults, normalizeLeadType, arabicRowError } = m;
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const rejects = async (p) => { try { await p; return null; } catch (e) { return e.message; } };

// ── بوابة الاستيراد: أدمن، أو من يملك صلاحية ليدز الدولة (سوريا والإمارات) ──
const canOf = (...perms) => (p) => perms.includes(p);
ok(canImportLeads('admin', 'AE') === true && canImportLeads('admin', 'SY') === true, 'admin -> AE and SY');
ok(canImportLeads('admin', 'TR') === false, 'admin + TR (disabled) -> no');
ok(canImportLeads('admin', 'XX') === false && canImportLeads(null, 'AE') === false && canImportLeads(undefined, 'AE') === false, 'unknown country / no role -> no');
ok(canImportLeads('employee', 'AE', canOf('view_uae_leads')) === true, 'employee + view_uae_leads -> AE');
ok(canImportLeads('employee', 'SY', canOf('view_syria_leads')) === true, 'employee + view_syria_leads -> SY');
ok(canImportLeads('employee', 'AE', canOf('view_syria_leads')) === false && canImportLeads('employee', 'SY', canOf('view_uae_leads')) === false, 'permission of the OTHER country is not enough');
ok(canImportLeads('employee', 'AE', canOf()) === false && canImportLeads('employee', 'AE') === false, 'no permission / no can() -> no');
ok(canImportLeads('employee', 'AE', () => 'yes') === false, 'can() must return exactly true');

// ── JSON ──
const batch = JSON.parse(fs.readFileSync(path.join(root, 'data/b2b/uae/uae_batch1_2026-10-08.json'), 'utf8'));
let rows = rowsFromJsonText(JSON.stringify(batch));
ok(rows.length === batch.rows.length && rows[0].name === batch.rows[0].name, 'batch file ({country, rows}) parses');
ok(rowsFromJsonText(JSON.stringify(batch.rows)).length === batch.rows.length, 'plain array parses');
ok(rowsFromJsonText('﻿' + JSON.stringify(batch.rows)).length === batch.rows.length, 'BOM tolerated');
ok(/ليس JSON/.test(throws(() => rowsFromJsonText('{oops'))), 'bad JSON -> clear message');
ok(/الشكل المتوقع/.test(throws(() => rowsFromJsonText('{"a":1}'))), 'wrong shape -> clear message');
ok(/بلا صفوف/.test(throws(() => rowsFromJsonText('[]'))), 'empty -> clear message');
ok(new RegExp(String(MAX_IMPORT_ROWS)).test(throws(() => rowsFromJsonText(JSON.stringify(Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => ({ name: `r${i}` })))))), 'over the server cap -> refused before any request');
const cleaned = rowsFromJsonText(JSON.stringify([{ name: 'A', website: '', email: null, province: 'Dubai' }]))[0];
ok(!('website' in cleaned) && !('email' in cleaned) && cleaned.province === 'Dubai', 'empty values are dropped (unknown stays unknown, never "")');

// ── CSV ──
const csv = 'name,province,lead_type,source_urls,last_verified_at,website,accepts_sellers\nFake Csv Shop (وهمي),Dubai,online,https://a.example | https://b.example,2026-10-08,,نعم\n';
const csvRows = await rowsFromSheetBuffer(csv, 'string');
ok(csvRows.length === 1 && csvRows[0].name === 'Fake Csv Shop (وهمي)' && csvRows[0].source_urls === 'https://a.example | https://b.example' && !('website' in csvRows[0]) && csvRows[0].accepts_sellers === 'نعم', `CSV parses with Arabic text, pipes and empty cells (${JSON.stringify(csvRows[0])})`);
ok(/بلا صفوف/.test(await rejects(rowsFromSheetBuffer('name,province\n', 'string'))), 'CSV with header only -> clear message');

// ── مطابقة الأعمدة (عربي/إنجليزي) ──
const mp = mapColumns([
  { 'الاسم': 'متجر وهمي', 'الإمارة': 'دبي', 'النوع (محل / أونلاين)': 'أونلاين', 'الموقع': 'https://x.example', 'ملاحظات': 'ملاحظة', 'عمود غريب': 'zzz', 'الهاتف': '' },
  { Name: 'Fake Two', Emirate: 'Dubai', IG: 'fake_two', 'Source URLs': 'x', source_urls: 'https://a.example' },
]);
ok(mp.rows[0].name === 'متجر وهمي' && mp.rows[0].province === 'دبي' && mp.rows[0].lead_type === 'أونلاين' && mp.rows[0].website === 'https://x.example' && mp.rows[0].reason === 'ملاحظة', `Arabic headers map to the server's fields (${JSON.stringify(mp.rows[0])})`);
ok(!('phone' in mp.rows[0]), 'an empty cell stays absent (never "")');
ok(mp.ignored.length === 1 && mp.ignored[0] === 'عمود غريب', 'unknown columns are reported and dropped, not guessed');
ok(mp.rows[1].name === 'Fake Two' && mp.rows[1].province === 'Dubai' && mp.rows[1].instagram === 'fake_two', 'English headers in any case map too');
ok(mp.rows[1].source_urls === 'x', 'first non-empty value wins when two columns map to one field');
ok(mapColumns([{ name: 'A', province: 'Dubai', lead_type: 'online', source_urls: 'https://a.example', last_verified_at: '2026-10-08', accepts_sellers: 'نعم' }]).ignored.length === 0, 'canonical JSON keys pass through untouched');
ok(normalizeLeadType('أونلاين') === 'online' && normalizeLeadType('Online') === 'online' && normalizeLeadType('متجر إلكتروني') === 'online', 'online words');
ok(normalizeLeadType('محل') === 'physical' && normalizeLeadType('صيدلية') === 'physical' && normalizeLeadType('physical') === 'physical', 'physical words');
ok(normalizeLeadType('غير معروف') === 'غير معروف', 'unknown type left as is (server refuses with a clear reason)');
const dflt = applyFileDefaults([{ name: 'A' }, { name: 'B', lead_type: 'محل', province: 'Dubai' }, { name: 'C', lead_type: 'physical' }], { leadType: 'online' });
ok(dflt[0].lead_type === 'online' && dflt[0].province === 'Nationwide', 'missing type -> the chosen type; online without region -> nationwide');
ok(dflt[1].lead_type === 'physical' && dflt[1].province === 'Dubai', 'type from the file wins over the chosen default');
ok(dflt[2].lead_type === 'physical' && !dflt[2].province, 'physical without region is NOT given a region (server refuses it)');
ok(!('lead_type' in applyFileDefaults([{ name: 'A' }], { leadType: 'auto' })[0]), 'auto + no column -> no type invented');
ok(/نوع الجهة/.test(arabicRowError('lead_type must be physical|online')) && /الاسم/.test(arabicRowError('name required')) && arabicRowError('something else') === 'something else', 'row errors translated, unknown ones kept');

// ── معاينة: ربط الصف الجديد بصفّه الأصلي من id الذي يبنيه الخادم ──
const fileRows = [{ name: 'Row One' }, { name: 'Row Two' }, { name: 'Row Three' }, { name: 'Row Four' }];
const report = {
  summary: { total: 4, new: 2, duplicate_existing: 1, duplicate_in_file: 0, invalid: 1 },
  new: [{ id: 'UAE-ONL-K3J9-001', name: 'Row One', province: 'Dubai' }, { id: 'UAE-PHY-K3J9-003', name: 'Row Three', province: 'Sharjah' }],
  duplicate_existing: [{ line: 2, name: 'Row Two', existing: { id: 'X', name: 'Row Two', country: 'AE' } }],
  duplicate_in_file: [],
  invalid: [{ line: 4, name: 'Row Four', error: 'source_urls required' }],
};
const pv = buildPreview(fileRows, report);
ok(pv.newItems.length === 2 && pv.newItems[0].row.name === 'Row One' && pv.newItems[1].row.name === 'Row Three' && pv.newItems[1].line === 3, 'new rows map back to their original rows (by line)');
ok(pv.duplicateExisting[0].row.name === 'Row Two' && pv.invalid[0].row.name === 'Row Four' && pv.invalid[0].error === 'source_urls required', 'duplicates/invalid keep their rows and reasons');
ok(rowsToSave(pv, [3]).length === 1 && rowsToSave(pv, [3])[0].name === 'Row Three', 'only the selected line is sent for saving');
ok(rowsToSave(pv, []).length === 0, 'nothing selected -> nothing to save (default)');
ok(rowsToSave(pv, [2, 4, 99]).length === 0, 'lines that are not "new" can never be saved');
ok(buildPreview(fileRows, {}).newItems.length === 0, 'empty/odd report -> empty preview, no crash');

// ── شرط الحفظ ──
ok(canSave(0, true) === false, 'no selection -> save disabled');
ok(canSave(2, false) === false, 'selection without the acknowledgement -> save disabled');
ok(canSave(2, undefined) === false && canSave(2, 'yes') === false, 'acknowledgement must be exactly true');
ok(canSave(2, true) === true, 'selection + acknowledgement -> save enabled');

// ── ضعف المصدر ──
ok(isWeakSource({ verified: 'verified_single_source' }) && isWeakSource({ verified: 'discovered_unconfirmed' }) && !isWeakSource({ verified: 'verified_multi_source' }), 'weak-source flag');
ok(batch.rows.every((r) => isWeakSource(r)), 'every row of the UAE batch is flagged weak (single/secondary source)');

console.log(`b2b-import unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
