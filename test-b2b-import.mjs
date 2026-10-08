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
const { canImportLeads, rowsFromJsonText, rowsFromSheetBuffer, buildPreview, rowsToSave, canSave, isWeakSource, MAX_IMPORT_ROWS } = m;
const throws = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const rejects = async (p) => { try { await p; return null; } catch (e) { return e.message; } };

// ── بوابة الأدمن (الحالات الأربع + سوريا) ──
const roles = [['admin', 'admin'], ['granted (employee + view_uae_leads)', 'employee'], ['denied (employee)', 'employee'], ['none (employee)', 'employee'], ['syria-only (employee)', 'employee'], ['manager', 'manager']];
const table = roles.map(([k, r]) => ({ persona: k, AE: canImportLeads(r, 'AE'), SY: canImportLeads(r, 'SY'), TR: canImportLeads(r, 'TR') }));
console.table(table);
ok(canImportLeads('admin', 'AE') === true, 'admin + AE -> can import');
ok(canImportLeads('admin', 'SY') === false, 'admin + SY -> no (Syria stays on the direct path, no import UI)');
ok(canImportLeads('admin', 'TR') === false, 'admin + TR (disabled) -> no');
ok(canImportLeads('admin', 'XX') === false && canImportLeads(null, 'AE') === false && canImportLeads(undefined, 'AE') === false, 'unknown country / no role -> no');
ok(['employee', 'manager', 'sales_manager', 'media_buyer', 'social_manager'].every((r) => canImportLeads(r, 'AE') === false), 'every non-admin role -> no (even with view_uae_leads: permission is not enough for import)');

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
