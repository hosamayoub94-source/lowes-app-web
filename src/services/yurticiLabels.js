// ════════════════════════════════════════════════════════════════════
// yurticiLabels.js — محلّل بوليصة يورتيتشي (Self-Servis label PDF)
// ────────────────────────────────────────────────────────────────────
// يحوّل النص المستخرَج من بوليصة يورتيتشي (PDF) إلى أزواج (order_id ↔ GÖ).
// الـGÖ = رقم الإرسال (9 خانات، تحت «N/N GÖ») = مفتاح يورتيتشي للشحنات
// المرفوعة بـExcel. بضبط orders.yurtici_cargo_key = GÖ، يسحب track-yurtici
// رقم التتبّع العام (1160…) والحالة تلقائياً (المسار الموجود أصلاً).
//
// بنية كل بوليصة بالنص (بالترتيب): … İrsaliye NO: <id> … <GÖ> N/N GÖ … REF.NO:<id>
// نقرن كل علامة GÖ بمعرّفها داخل «كتلتها» فقط (محدودة بعلامتَي GÖ المجاورتين)
// كي لا تتسرّب بوليصة إلى أخرى. كعوب المستلم بالأسفل (ALICI/TAHSİLAT + GÖ
// مجرّد بلا «N/N GÖ») والرقم الثابت Dosya (7731066) لا تُطابِق فتُتجاهَل تلقائياً.
// ════════════════════════════════════════════════════════════════════

// علامة GÖ: رقم (≥6 خانات) يتبعه «عدد / عدد  GÖ» (بمسافات أو أسطر). يستبعد
// الكعوب المجرّدة (بلا «N/N GÖ») والـDosya (لا يتبعه GÖ).
const GO_RE  = /(\d{6,})\s+\d+\s*\/\s*\d+\s*G[ÖO]/gu;
// معرّف الطلب: حروف/أرقام مع شُرَط داخلية (TL-/TS-/SL-/SS-/ARC-T-…).
const ID     = '([A-Za-z0-9][A-Za-z0-9-]*)';
const REF_RE = new RegExp(`REF\\.?\\s*N[Oo]\\.?\\s*:?\\s*${ID}`, 'gu');
// İrsaliye (İ=U+0130, ı=U+0131) — نتسامح مع صور الحرف الأول كي لا يكسرنا تطبيع الحالة التركي.
const IRS_RE = new RegExp(`[İIıi]rsaliye\\s*N[Oo]\\.?\\s*:?\\s*${ID}`, 'gu');

const cleanId = (s) => String(s || '').trim().replace(/-+$/, '').toUpperCase();

// يجمع كل تطابقات regex مع مواقعها: [{ value, idx }].
function allMatches(re, text) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) out.push({ value: m[1], idx: m.index });
  return out;
}

/**
 * parseYurticiLabels(text) → { pairs: [{ orderId, go }], warnings: [string] }
 * نقيّ، بلا أعراض جانبية. آمن لأي مدخل (null/undefined/غير نصّي).
 */
export function parseYurticiLabels(text) {
  if (typeof text !== 'string' || !text.trim()) return { pairs: [], warnings: [] };

  const gos = allMatches(GO_RE, text);   // علامات GÖ مرتّبة حسب الموقع
  const refs = allMatches(REF_RE, text); // REF.NO تتبع GÖ كتلتها
  const irs = allMatches(IRS_RE, text);  // İrsaliye تسبق GÖ كتلتها

  const pairs = [];
  const warnings = [];

  for (let i = 0; i < gos.length; i++) {
    const go = gos[i].value;
    const start = gos[i].idx;
    const prev = i > 0 ? gos[i - 1].idx : -1;
    const next = i + 1 < gos.length ? gos[i + 1].idx : Infinity;

    // REF.NO الخاص بهذه الكتلة: أول REF.NO بعد هذه الـGÖ وقبل التالية.
    const refHit = refs.find((r) => r.idx > start && r.idx < next);
    // İrsaliye الخاص بهذه الكتلة: آخر İrsaliye قبل هذه الـGÖ وبعد السابقة.
    const irsHit = [...irs].reverse().find((r) => r.idx < start && r.idx > prev);

    const refId = refHit ? cleanId(refHit.value) : '';
    const irsId = irsHit ? cleanId(irsHit.value) : '';
    // İrsaliye أساسيّ: مُرتكَز موضعياً بين علامتَي GÖ المجاورتَين (يسبق GÖ كتلته
    // حصراً) فلا تخطفه بوليصة أخرى مهما تبعثرت REF.NO بالأسفل. REF.NO للتأكيد فقط.
    const orderId = irsId || refId;

    if (!orderId) {
      warnings.push(`GÖ ${go} بلا معرّف طلب (İrsaliye/REF.NO) — تُجوهِلت.`);
      continue;
    }
    // تعارض İrsaliye≠REF.NO → نعلّمها ambiguous فلا تُربَط تلقائياً (مراجعة يدوية).
    let ambiguous = false;
    if (irsId && refId && irsId !== refId) {
      ambiguous = true;
      warnings.push(`تعارض على GÖ ${go}: İrsaliye=${irsId} ≠ REF.NO=${refId} — تحتاج مراجعة يدوية (لم تُربَط تلقائياً).`);
    }
    pairs.push(ambiguous ? { orderId, go, ambiguous: true } : { orderId, go });
  }

  // إزالة التكرار التام (طرود متعدّدة لنفس الشحنة 1/3·2/3·3/3 بنفس الـGÖ والمعرّف).
  const seen = new Set();
  const unique = [];
  for (const p of pairs) {
    const k = `${p.orderId}|${p.go}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(p);
  }

  return { pairs: unique, warnings };
}
