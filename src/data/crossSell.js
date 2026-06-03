// =============================================================
// Cross-sell rules + reorder cycle for retention marketing.
// Skincare logic: what naturally pairs with / follows a product.
// Names match the Arabic catalog (substring, case-insensitive).
// =============================================================

export const REORDER_DAYS = 35; // typical skincare product cycle (re-order nudge)

const RULES = [
  { match: ['غسول', 'cleanser'],            suggest: ['تونر تنقية البشرة و تضييق المسام', 'كريم الترطيب المكثف'] },
  { match: ['تونر'],                         suggest: ['سيروم فيتامين سي', 'كريم الترطيب المكثف'] },
  { match: ['فيتامين سي', 'vitamin'],        suggest: ['واقي الشمس الوردي بالكالامين', 'كريم الترطيب المكثف'] },
  { match: ['ريتينول', 'retinol', 'ريتينال'], suggest: ['كريم الترطيب المكثف', 'واقي الشمس المضاد للبقع'] },
  { match: ['ترطيب', 'مرطب'],                suggest: ['واقي الشمس الوردي بالكالامين', 'سيروم الترطيب المكثف'] },
  { match: ['واقي الشمس', 'sunscreen'],      suggest: ['غسول البشرة العادية و الجافة', 'كريم تفتيح البشرة'] },
  { match: ['ماسك', 'كولاجين', 'mask'],      suggest: ['سيروم الكولاجين', 'كريم الترطيب المكثف'] },
  { match: ['شامبو', 'روزماري', 'rosemary'], suggest: ['ماء الروزماري للشعر و البشرة', 'سيروم اللحية'] },
  { match: ['تفتيح', 'whitening'],           suggest: ['واقي الشمس المضاد للبقع', 'سيروم مصحح البقع الداكنة'] },
  { match: ['هالات', 'under eye', 'العين'],  suggest: ['سيروم الكولاجين', 'كريم الترطيب المكثف'] },
  { match: ['حب الشباب', 'acne', 'مضاد لحب'], suggest: ['غسول البشرة الدهنية والحساسة', 'تونر تنقية البشرة و تضييق المسام'] },
];

// Suggest complementary products the customer has NOT bought yet.
export function suggestComplements(boughtNames) {
  const bought = (boughtNames || []).map((n) => String(n || '').toLowerCase());
  const alreadyHas = (name) => {
    const key = String(name).toLowerCase();
    return bought.some((b) => b.includes(key.slice(0, 10)) || key.includes(b.slice(0, 10)));
  };
  const out = new Set();
  for (const b of bought) {
    for (const rule of RULES) {
      if (rule.match.some((m) => b.includes(m.toLowerCase()))) {
        rule.suggest.forEach((s) => { if (!alreadyHas(s)) out.add(s); });
      }
    }
  }
  return [...out].slice(0, 4);
}
