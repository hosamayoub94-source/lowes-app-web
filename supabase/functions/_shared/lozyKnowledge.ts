// =============================================================
// lozyKnowledge — pure guards for facts the team teaches Lozy via
// [[LEARN: ...]]. Additive only: nothing here deletes or rewrites an
// existing lozy_knowledge row. A new fact is either added, skipped
// (duplicate / personal / sensitive) or stored INACTIVE as a pending
// conflict for admin review (AdminLozyScreen).
// =============================================================

export type KnowledgeRow = { id?: string; fact: string; category?: string | null };

export type LearnDecision =
  | { action: 'add' }
  | { action: 'skip_duplicate'; of?: KnowledgeRow }
  | { action: 'skip_sensitive'; reason: string }
  | { action: 'pending_conflict'; with: KnowledgeRow };

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeFact(s: string): string {
  return String(s ?? '')
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^0-9a-z؀-ۿ\s%.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(['في', 'من', 'على', 'الى', 'عن', 'مع', 'هو', 'هي', 'هاي', 'هذا', 'هذه', 'ان', 'او', 'و', 'يا', 'كل', 'ما', 'تم', 'لوزي']);

function words(s: string): string[] {
  return normalizeFact(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w));
}
const isNum = (w: string) => /^\d+(\.\d+)?%?$/.test(w);

export function similarity(a: string, b: string): number {
  const A = new Set(words(a).filter((w) => !isNum(w)));
  const B = new Set(words(b).filter((w) => !isNum(w)));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((w) => { if (B.has(w)) inter++; });
  return inter / (A.size + B.size - inter);
}

function numbers(s: string): string[] {
  return normalizeFact(s).split(' ').filter(isNum).sort();
}

const NEGATION = /(^|\s)(لا|ممنوع|ليس|ليست|مو|غير|بدون|يمنع)(\s|$)/;

function luhn(d: string): boolean {
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

// 13-19 digit runs that pass Luhn and don't look like an international
// phone (00… prefix) are treated as payment-card numbers.
function hasCardNumber(n: string): boolean {
  const runs = n.match(/\d(?:[ -]?\d){12,18}/g) ?? [];
  return runs.some((r) => { const d = r.replace(/\D/g, ''); return !d.startsWith('00') && luhn(d); });
}

// Personal / temporary / secret content must never become shared knowledge.
export function sensitiveReason(fact: string): string | null {
  const n = normalizeFact(fact);
  if (/(كلمه سر|كلمه المرور|باسورد|password|رمز الدخول|\bpin\b|\bcvv\b|otp)/.test(n)) return 'secret';
  if (hasCardNumber(n)) return 'card_or_id_number';
  if (/\biban\b|\bsk-[a-z0-9]/i.test(fact)) return 'financial_or_key';
  if (/(اليوم فقط|هلق فقط|بكرا|هالاسبوع|مؤقت|الان فقط)/.test(n)) return 'temporary';
  if (/(^| )(انا|تفضيلي|بحب|ما بحب|مزاجي)( |$)/.test(n)) return 'personal_preference';
  return null;
}

export function decideLearn(newFact: string, existing: KnowledgeRow[]): LearnDecision {
  const fact = String(newFact ?? '').trim();
  if (fact.length < 8) return { action: 'skip_sensitive', reason: 'too_short' };
  const why = sensitiveReason(fact);
  if (why) return { action: 'skip_sensitive', reason: why };

  const nf = normalizeFact(fact);
  for (const row of existing) {
    const sameNumbers = numbers(row.fact).join() === numbers(fact).join();
    const sameNegation = NEGATION.test(normalizeFact(row.fact)) === NEGATION.test(nf);
    if (normalizeFact(row.fact) === nf || (similarity(row.fact, fact) >= 0.85 && sameNumbers && sameNegation)) {
      return { action: 'skip_duplicate', of: row };
    }
  }
  for (const row of existing) {
    const sim = similarity(row.fact, fact);
    const nOld = numbers(row.fact);
    const nNew = numbers(fact);
    const numberClash = nOld.length > 0 && nNew.length > 0 && nOld.join() !== nNew.join() && sim >= 0.35;
    const negationFlip = NEGATION.test(normalizeFact(row.fact)) !== NEGATION.test(nf) && sim >= 0.6;
    if (numberClash || negationFlip) return { action: 'pending_conflict', with: row };
  }
  return { action: 'add' };
}

export const CONFLICT_CATEGORY_PREFIX = 'pending_conflict';
export function conflictCategory(withRow: KnowledgeRow): string {
  return withRow.id ? `${CONFLICT_CATEGORY_PREFIX}:${withRow.id}` : CONFLICT_CATEGORY_PREFIX;
}
