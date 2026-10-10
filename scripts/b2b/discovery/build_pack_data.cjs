// Extracts pack-printed data (warnings, INCI, batch/expiry, how-to-use, purpose, label company) from the original Box/Print files:
// PDFs (pdftotext raw order) and the editable DOCX sources (word/document.xml). ASCII temp copies; read-only on sources.
// Fields not found stay empty (never filled from the catalog). Every file of a SKU is scanned; first non-empty value (longest file first) wins.
// usage: node build_pack_data.cjs <productFolderRoot> <kitDir>
const fs = require('fs'); const os = require('os'); const path = require('path');
const { execFileSync } = require('child_process');
const [root, kitDir] = process.argv.slice(2);
const FOLD = JSON.parse(fs.readFileSync(path.join(__dirname, 'folders_map.json'), 'utf8'));
const kit = JSON.parse(fs.readFileSync(path.join(kitDir, 'LOWES_UAE_Product_Sheet_DRAFT.json'), 'utf8')).products;
let n = 0;
const tmp = (ext) => path.join(os.tmpdir(), `lw_pk_${process.pid}_${n++}.${ext}`);
const txt = (f) => { const t = tmp('pdf'); try { fs.copyFileSync(f, t); return execFileSync('pdftotext', [t, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }); } catch { return ''; } finally { try { fs.unlinkSync(t); } catch { /* */ } } };
const docx = (f) => {
  const t = tmp('docx');
  try {
    fs.copyFileSync(f, t);
    const x = execFileSync('unzip', ['-p', t, 'word/document.xml'], { encoding: 'utf8', maxBuffer: 1 << 26 });
    return x.split('</w:p>').map((p) => [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')).filter((l) => l.trim()).join('\n').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  } catch { return ''; } finally { try { fs.unlinkSync(t); } catch { /* */ } }
};
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
const clean = (s) => (s || '').replace(/\s+/g, ' ').replace(/�/g, '').trim();
const cut = (t, a, stops) => { const m = t.match(a); if (!m) return ''; const rest = t.slice(m.index + m[0].length); let end = rest.length; for (const s of stops) { const k = rest.search(s); if (k > 0 && k < end) end = k; } return clean(rest.slice(0, end)); };
const out = [];
for (const p of kit) {
  const dir = path.join(root, FOLD[p.internal_sku] || '');
  const files = walk(dir).filter((f) => !/\(\d\)/.test(path.basename(f)) && !/تصميم قديم/.test(f) && ((/\.pdf$/i.test(f) && /(box|print)/i.test(path.basename(f))) || /\.docx$/i.test(f)));
  const texts = files.map((f) => ({ f, t: /\.docx$/i.test(f) ? docx(f) : txt(f) })).filter((x) => x.t.length > 50).sort((a, b) => b.t.length - a.t.length);
  const first = (fn) => { for (const x of texts) { const v = fn(x.t); if (v) return v; } return ''; };
  const best = texts[0] || { f: '', t: '' };
  const warnings = first((t) => cut(t, /WARNINGS\s*(?:\/\s*UYARILAR)?\s*(?:EN\s*-)?/i, [/UYARILAR/, /TR\s*-/, /INGREDIENTS/i, /HOW TO USE/i]));
  const inci = first((t) => {
    const v = cut(t, /INGREDIENTS\s*\/[^\n]*\n/i, [/THE CEEL/, /L B /, /LB\s?İÇ/, /CEELLO KOZ/, /MADE IN/i, /HOW TO USE/i, /BATCH/i]);
    const w = v.replace(/[؀-ۿ]+/g, '').replace(/\s+/g, ' ').trim();
    return (w.match(/,/g) || []).length >= 4 ? w : '';
  });
  const batch = first((t) => (t.match(/BATCH NO\s*:?\s*([A-Z0-9]{2,4}\s?\d{3})/i) || [])[1] || '');
  const expiry = first((t) => (t.match(/(\d{2}\.\d{2}\.\d{4})/) || [])[1] || '');
  const howto = first((t) => cut(t, /HOW TO USE(?:\s*\/\s*KULLANIM[^\n]*)?\s*(?:EN\s*-)?/i, [/KULLANIM\s*\S?EK/i, /TR\s*-/, /PURPOSE/i]));
  const purpose = first((t) => cut(t, /PURPOSE OF USAGE(?:\s*\/\s*KULLANIM[^\n]*)?\s*(?:EN\s*-)?/i, [/KULLANIM\s*AMACI/i, /TR\s*-/, /HOW TO USE/i]));
  const all = texts.map((x) => x.t).join('\n');
  const company = /CEELLO KOZM/i.test(all) ? 'CEELLO KOZMETİK VE KİMYA SANAYİ TİCARET A.Ş. (Afyonkarahisar)' : /THE CEEL KOZM/i.test(all) ? 'THE CEEL KOZMETİK İÇ VE DIŞ TİCARET A.Ş. (İstanbul, Ataşehir)' : (/L B /.test(all) || /LB\s?İÇ/.test(all)) ? 'L B İÇ VE DIŞ TİCARET KOZMETİK A.Ş. (İstanbul, Kadıköy)' : '';
  out.push({ sku: p.internal_sku, pack_pdf: best.f ? path.relative(root, best.f).split(path.sep).join('/') : '', text_layer: best.t.length > 200, files_found: files.length, source_kinds: [...new Set(texts.map((x) => path.extname(x.f).toLowerCase()))].join('+'), warnings_en: warnings, inci, batch, expiry, how_to_use_en: howto, purpose_en: purpose, label_company: company });
}
fs.writeFileSync(path.join(kitDir, 'listings/pack_data_2026-10-10.json'), JSON.stringify(out, null, 1));
const c = (k) => out.filter((r) => r[k]).length;
console.log('SKUs', out.length, '| text layer', c('text_layer'), '| inci', c('inci'), '| warnings', c('warnings_en'), '| howto', c('how_to_use_en'), '| purpose', c('purpose_en'), '| batch', c('batch'), '| company', c('label_company'));
const co = {}; out.forEach((r) => { if (r.label_company) co[r.label_company] = (co[r.label_company] || 0) + 1; }); console.log(co);
