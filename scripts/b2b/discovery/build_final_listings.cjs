// Final per-SKU listing files (content only; nothing uploaded). Content comes ONLY from pack-printed text (pack_data) or the
// verified Vitamin C record; catalog text is never mixed in. Status per SKU: CONTENT_READY / NEEDS_VISUAL_READ / ON_HOLD_REGULATORY / NO_PACK_FILE.
// usage: node build_final_listings.cjs <kitDir>
const fs = require('fs'); const path = require('path');
const dir = process.argv[2]; const J = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const kit = J('LOWES_UAE_Product_Sheet_DRAFT.json').products; const pack = J('listings/pack_data_2026-10-10.json'); const gaps = J('listings/product_data_gaps_2026-10-10.json');
const imgs = fs.readFileSync(path.join(dir, 'listings/original_image_inventory_2026-10-10.csv'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
const bestImg = (sku) => { let b = null; for (const l of imgs) { const m = l.match(/^"([^"]*)","([^"]*)","(\d+)","(\d+)","(\d+)","(.*)"$/); if (m && m[1] === sku && m[6].indexOf('تصميم قديم') < 0 && (!b || +m[5] > +b.px)) b = { kind: m[2], w: m[3], h: m[4], px: m[5], path: m[6] }; } return b; };
const HOLD = { 'LW-SR-107': ['C-18', 'اسم وادعاء حب الشباب خارج نطاق التجميل (دليل بلدية دبي 5.2) + عنوانا الغرض/الاستخدام مقلوبان (C-16)', 'قرار الإدارة بالاسم/الادعاء بعد معرفة ما سُجّل فعلاً، وتصحيح التصميم'],
  'LW-HR-801': ['C-19', 'ادعاءات نمو/تساقط الشعر خارج نطاق التجميل (5.2)', 'سحب الادعاءات بقرار الإدارة + إثبات التسجيل'], 'LW-HR-802': ['C-19/C-05', 'ادعاءات نمو الشعر + اختبار SKINLAB لا يُنسب بلا إقرار CEELLO', 'سحب الادعاءات + إقرار CEELLO'],
  'LW-SR-103': ['C-22/C-24', 'تعارض INCI (علبة مقابل جدول المصنّع) + لا دليل على غياب Hydroquinone', 'إقرار INCI من CEELLO + تقرير مختبر معتمد (Hydroquinone غير مكتشف)'],
  'LW-SR-105': ['C-23', 'تعارض INCI (علبة مقابل جدول المصنّع)', 'إقرار INCI من CEELLO'],
  'LW-HR-803': ['C-01..C-04, C-19', 'تعارض INCI (30 مقابل 26)، Biotin غير موجود بأي قائمة، Benzyl Nicotinate (مادة دورة دموية)', 'إقرار CEELLO المكتوب بـINCI النهائي والمكوّنات'] };
const NOPACK = ['LW-SP-401', 'LW-MN-901', 'LW-BD-703'];
const sentences = (s) => (s || '').split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 8);
const out = fs.mkdirSync(path.join(dir, 'listings/final'), { recursive: true }) || path.join(dir, 'listings/final');
const idx = [];
for (const p of kit) {
  const sku = p.internal_sku; if (sku === 'LW-SR-101') continue;
  const k = pack.find((x) => x.sku === sku) || {}; const g = gaps.find((x) => x.sku === sku) || {}; const im = bestImg(sku);
  let status, reason = '', unblock = '';
  if (HOLD[sku]) { status = /C-2[234]/.test(HOLD[sku][0]) ? 'ON_HOLD_INCI_CONFLICT' : 'ON_HOLD_REGULATORY'; [, reason, unblock] = HOLD[sku]; }
  else if (!k.pack_pdf && !k.files_found) { status = 'NO_PACK_FILE'; reason = 'لا ملف عبوة/تصميم بالمجلد'; unblock = 'تسليم ملف العبوة'; }
  else if (k.text_layer && k.inci && k.warnings_en && k.how_to_use_en && k.purpose_en) { status = 'CONTENT_READY'; }
  else { status = 'NEEDS_VISUAL_READ'; reason = 'نص العبوة محوّل لمنحنيات أو ناقص: ' + (g.needs_visual_read || ''); unblock = 'قراءة بصرية للعبوة/ملف نصي من CEELLO'; }
  const flags = (g.regulatory_flags || '').split(' || ').filter(Boolean);
  const medical = /(acne|hair loss|treat|cure|heal|disease|therap)/i.test([k.purpose_en, k.how_to_use_en].join(' '));
  let body = `# ${sku} · ${p.product_name_en} (${p.pack_size})\n\n**الحالة: ${status}** — **غير جاهز للنشر** (سعر، إثبات تسجيل، دور جهة الملصق، EAN/GS1 — راجع القائمة الواحدة).\n`;
  if (reason) body += `\n**سبب التعليق/النقص:** ${reason}\n**الخطوة لرفعه:** ${unblock}\n`;
  if (status === 'CONTENT_READY') {
    const bullets = sentences(k.purpose_en);
    body += `\n## المحتوى (من العبوة فقط)\n- **العنوان المقترح:** LOWE'S Profesyonel ${p.product_name_en} ${p.pack_size.split(' (')[0]}\n- **نقاط:**\n${bullets.map((b) => '  - ' + b).join('\n')}\n- **طريقة الاستخدام:** ${k.how_to_use_en}\n- **التحذيرات:** ${k.warnings_en}\n- **INCI:** ${k.inci}\n- **Batch / Exp (تصميم):** ${k.batch || '—'} / ${k.expiry || '—'}\n- **جهة الملصق:** ${k.label_company}\n- **المنشأ:** Made in Türkiye\n- **EAN:** [فجوة — يُقرأ من العبوة]\n`;
    if (sku === 'LW-CR-302') body += `\n> ⚠️ **اختلاف اسم:** العبوة تقول «SKIN WHITENING CREAM» بينما الكتالوج/الملف: «${p.product_name_en}». يُستعمل اسم العبوة المطبوع فقط بعد مطابقته لاسم التسجيل (C-21).\n`;
    if (medical) body += '\n> ⚠️ نص العبوة يحوي كلمات قد تُعدّ ادعاءً علاجياً — مراجعة قبل النسخ.\n';
  }
  if (flags.length) body += `\n## أعلام تنظيمية (دليل بلدية دبي)\n${flags.map((f) => '- ' + f).join('\n')}\n`;
  body += `\n## الصورة\n${im ? `${im.kind} ${im.w}×${im.h} px — ${im.path}` : '[فجوة — لا صورة أصلية]'}\n`;
  fs.writeFileSync(path.join(out, `${sku}_FINAL.md`), body);
  idx.push({ sku, product: p.product_name_en, status, reason, unblock_step: unblock, regulatory_flags: flags.length });
}
const cols = Object.keys(idx[0]); const esc = (x) => `"${String(x).replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(out, '_index.csv'), '﻿' + [cols.join(','), ...idx.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'));
const c = {}; idx.forEach((r) => (c[r.status] = (c[r.status] || 0) + 1)); console.log(idx.length, c);
console.log('READY:', idx.filter((r) => r.status === 'CONTENT_READY').map((r) => r.sku).join(','));
