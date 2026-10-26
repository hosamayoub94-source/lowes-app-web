// Lozy guards — run: node test-lozy.mjs
// Pure-logic tests for the customer search + team-knowledge guard, plus
// source-contract tests that protect existing Lozy knowledge from being
// removed or weakened by future edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  sanitizeSearchTerm, classifySearch, buildOrFilter, phoneTail, looksLikeCustomerLookup, NOT_FOUND_HINT,
} from './supabase/functions/_shared/customerSearch.ts';
import { decideLearn, sensitiveReason, conflictCategory } from './supabase/functions/_shared/lozyKnowledge.ts';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
};

const fn = fs.readFileSync('supabase/functions/ai-assistant/index.ts', 'utf8');
const widget = fs.readFileSync('src/components/ai/AIAssistantWidget.jsx', 'utf8');

console.log('customer search');
t('order id with dash is kept and classified as order', () => {
  assert.equal(sanitizeSearchTerm('ARC-1691'), 'ARC-1691');
  assert.equal(classifySearch('ARC-1691'), 'order');
  assert.equal(buildOrFilter('ARC-1691').filter, 'order_id.ilike.%ARC-1691%');
});
t('order id containing " / " is kept', () => {
  assert.ok(sanitizeSearchTerm('ARC-12 / 3').includes('/'));
});
t('plain order number is an order lookup', () => {
  assert.equal(buildOrFilter('1691').kind, 'order');
});
t('phone (any prefix style) matches on trailing 9 digits across both phone columns', () => {
  for (const p of ['+90 555 123 45 67', '00905551234567', '0555 123 45 67', '٠٥٥٥١٢٣٤٥٦٧']) {
    const b = buildOrFilter(p);
    assert.equal(b.kind, 'phone', p);
    assert.equal(b.filter, `wa_number.ilike.%${phoneTail(p)}%,phone_1.ilike.%${phoneTail(p)}%`, p);
    assert.equal(phoneTail(p).length, 9);
  }
});
t('Arabic name searches customer_name only', () => {
  const b = buildOrFilter('رنا الأحمد');
  assert.equal(b.kind, 'name');
  assert.equal(b.filter, 'customer_name.ilike.%رنا الأحمد%');
});
t('PostgREST-breaking characters are stripped', () => {
  const evil = 'x),status.eq.delivered,(customer_name.ilike.%a_b*%.';
  const s = sanitizeSearchTerm(evil);
  assert.ok(!/[,()%*_.]/.test(s), s);
  const f = buildOrFilter(evil).filter;
  assert.equal((f.match(/,/g) || []).length, 0, f);
  assert.ok(!/[()]/.test(f));
});
t('empty / punctuation-only / too-short input returns null', () => {
  for (const x of ['', '   ', ',,,()', null, undefined, 'ر', '123456']) assert.equal(buildOrFilter(x)?.kind === 'phone' ? 'bad' : (buildOrFilter(x) === null || buildOrFilter(x).kind === 'order' ? 'ok' : 'bad'), 'ok', String(x));
  assert.equal(buildOrFilter(',,,()'), null);
  assert.equal(buildOrFilter('ر'), null);
});
t('not-found hint offers alternative search methods', () => {
  assert.match(NOT_FOUND_HINT, /رقم الطلب/);
  assert.match(NOT_FOUND_HINT, /رقم الهاتف/);
  assert.match(NOT_FOUND_HINT, /الاسم/);
});
t('lookup gate: context word + phone/order id', () => {
  assert.ok(looksLikeCustomerLookup('شو آخر طلب لعميلة رقمها 0555 123 45 67؟'));
  assert.ok(looksLikeCustomerLookup('تابعي طلب ARC-1691'));
  assert.ok(!looksLikeCustomerLookup('كيف أستخدم سيروم الريتينول؟'));
  assert.ok(!looksLikeCustomerLookup('ما مكونات واقي الشمس 50 مل؟'));
});

console.log('team knowledge guard');
const existing = [
  { id: 'k1', fact: 'واتساب خدمة العملاء هو 00905551112233' },
  { id: 'k2', fact: 'الشحن لدمشق يستغرق 5 أيام' },
  { id: 'k3', fact: 'سيروم الفيتامين سي يستخدم صباحاً مع واقي الشمس' },
];
t('brand-new fact is added', () => {
  assert.equal(decideLearn('الضمان على المنتجات المعيبة يشمل الاستبدال خلال سبعة أيام', existing).action, 'add');
});
t('exact duplicate (different diacritics/spacing) is skipped', () => {
  assert.equal(decideLearn('الشحن   لدمشق يستغرق 5 أيّام', existing).action, 'skip_duplicate');
});
t('same subject with a different number is a pending conflict, never a silent replace', () => {
  const d = decideLearn('الشحن لدمشق يستغرق 9 أيام', existing);
  assert.equal(d.action, 'pending_conflict');
  assert.equal(d.with.id, 'k2');
  assert.equal(conflictCategory(d.with), 'pending_conflict:k2');
});
t('negation flip on same subject is a conflict', () => {
  const d = decideLearn('سيروم الفيتامين سي لا يستخدم صباحاً مع واقي الشمس', existing);
  assert.equal(d.action, 'pending_conflict');
});
t('secrets, card numbers, temporary and personal facts are not saved as shared knowledge', () => {
  for (const f of ['كلمة سر الحساب هي abc12345', 'رقم البطاقة 4111111111111111 للدفع', 'اليوم فقط يوجد خصم على الطلبات', 'أنا بحب أرد على العميلات بالإيموجي'])
    assert.equal(decideLearn(f, existing).action, 'skip_sensitive', f);
  assert.equal(sensitiveReason('واتساب خدمة العملاء هو 00905551112233'), null);
});

console.log('existing Lozy knowledge is preserved (source contracts)');
const fallback = fn.match(/const CATALOG_FALLBACK = `([\s\S]*?)`;/)[1];
t('CATALOG_FALLBACK still holds all 29 products in 3 lines', () => {
  assert.equal((fallback.match(/^- \*\*/gm) || []).length, 29);
  for (const h of ['### خط البشرة:', '### خط الشعر:', '### خط الجسم:']) assert.ok(fallback.includes(h), h);
});
t('product warnings survive (pregnancy, men-only, 7-9 min, rosemary water)', () => {
  assert.match(fallback, /سيروم الريتينول[^\n]*ممنوع للحوامل/);
  assert.match(fallback, /الريتينال[^\n]*ممنوع للحوامل/);
  assert.match(fallback, /سيروم الدقن[^\n]*للرجال فقط/);
  assert.match(fallback, /كريم إزالة الشعر[^\n]*7-9 دقائق/);
  assert.match(fallback, /Rosmarinus Officinalis فقط/);
});
t('brand voice, consultation style, commissions, KPI, accounting, roleplay sections remain', () => {
  for (const h of ['## 🌸 هوية البراند ونبرته', '## 🩺 أسلوب الاستشارة', '## نظام العمولات', '## KPI (100 نقطة شهرياً)', '## 📒 دفتر الحسابات', '## 🎭 تدريب الاعتراضات', '## ✍️ مراجعة رسائل قبل الإرسال'])
    assert.ok(fn.includes(h), h);
});
t('live catalog, app_guides and lozy_knowledge are still injected into the prompt', () => {
  assert.match(fn, /fetchLiveCatalog\(\)/);
  assert.match(fn, /from\('app_guides'\)/);
  assert.match(fn, /from\('lozy_knowledge'\)\.select\('id,fact,taught_by'\)/);
  assert.match(fn, /ctx\.catalogText \?\? CATALOG_FALLBACK/);
});
t('no price rule is intact', () => {
  assert.match(fn, /لا تذكري أي سعر منتج إطلاقاً/);
});
t('never ends with a bare "no information"; always a next step', () => {
  assert.match(fn, /لا تردّي "ما بعرف" أو "ما عندي معلومات" كجواب نهائي/);
  assert.match(fn, /كل رد عملي يجب أن ينتهي بخطوة تالية/);
});
t('conflict + medical-caution rules are in the prompt', () => {
  assert.match(fn, /لا تعتمديها بصمت ولا تعدّلي القديمة/);
  assert.match(fn, /لا تقدّمي نصيحة طبية قطعية/);
});
t('get_customer_history requires manage_orders and employees have no permissions', () => {
  assert.match(fn, /perm: PERMS\.MANAGE_ORDERS, name:'get_customer_history'/);
  assert.match(fn, /employee: \[\],/);
  assert.match(fn, /if \(tool\.perm && !ctx\.perms\.has\(tool\.perm\)\)/);
});
t('customer search uses the sanitizer, not the raw query', () => {
  const body = fn.slice(fn.indexOf("case 'get_customer_history'"), fn.indexOf("case 'get_tasks'"));
  assert.match(body, /buildOrFilter\(input\.query\)/);
  assert.ok(!/\.or\(`/.test(body), 'raw template .or() must not return');
});
t('learn handler never deletes/updates lozy_knowledge', () => {
  const learn = fn.slice(fn.indexOf('learnMatches.length > 0'));
  assert.ok(!/lozy_knowledge'\)\s*\.(delete|update|upsert)/.test(learn));
});
t('clearChat touches only the caller\'s lozy_chats row', () => {
  const block = widget.slice(widget.indexOf('const clearChat'), widget.indexOf('const suggestions'));
  assert.match(block, /from\('lozy_chats'\)/);
  assert.match(block, /user_id: userId/);
  for (const forbidden of ['lozy_knowledge', 'app_guides', 'CATALOG', '.delete(']) assert.ok(!block.includes(forbidden), forbidden);
});
t('widget has the four quick modes', () => {
  for (const l of ['خدمة عميلة', 'مبيعات ومتابعة', 'مهام وتنظيم', 'استخدام التطبيق']) assert.ok(widget.includes(`label: '${l}'`), l);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
