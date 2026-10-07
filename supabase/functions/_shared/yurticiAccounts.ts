// _shared/yurticiAccounts.ts — سجلّ حسابات يورتيتشي (عقدان)
// ════════════════════════════════════════════════════════════
// العقد 1 (1200681314، القديم): حسابا GÖ فقط — YURTICI_COD_* / YURTICI_NORMAL_*.
//   بعد 6 تشرين الأول 2026 لا تُنشأ عليه شحنات جديدة؛ يبقى لتتبّع شحناته الموجودة.
// العقد 2 (1279282180، LOWES PROFESYONEL، فرع Yenikapı 1150): 4 حسابات —
//   GÖ/AÖ (من يدفع الشحن) × NORMAL/TAHSİLATLI (تحصيل عند الباب). أسرار YK2_*.
// orders.yurtici_account يحفظ id الحساب الذي أُنشئت به الشحنة؛ null = العقد 1
// (كل الشحنات السابقة لهذا التاريخ). track-yurtici يستعلم كل شحنة بحسابها.
// ════════════════════════════════════════════════════════════

export interface YkAccount { id: string; user: string; pass: string; cod: boolean; contract: 1 | 2 }

const env = (k: string) => Deno.env.get(k) || '';

const DEFS: Record<string, { prefix: string; cod: boolean; contract: 1 | 2 }> = {
  YK1_COD:       { prefix: 'YURTICI_COD',    cod: true,  contract: 1 },
  YK1_NORMAL:    { prefix: 'YURTICI_NORMAL', cod: false, contract: 1 },
  YK2_GO_NORMAL: { prefix: 'YK2_GO_NORMAL',  cod: false, contract: 2 },
  YK2_GO_COD:    { prefix: 'YK2_GO_COD',     cod: true,  contract: 2 },
  YK2_AO_NORMAL: { prefix: 'YK2_AO_NORMAL',  cod: false, contract: 2 },
  YK2_AO_COD:    { prefix: 'YK2_AO_COD',     cod: true,  contract: 2 },
};
export const ACCOUNT_IDS = Object.keys(DEFS);

export function getAccount(id: string | null | undefined): YkAccount | null {
  // null = شحنات العقد 1 السابقة: حساب التحصيل يرى كل شحنات 1200681314، NORMAL احتياطي.
  if (!id) return getAccount('YK1_COD') ?? getAccount('YK1_NORMAL');
  const d = DEFS[id];
  if (!d) return null;
  const user = env(`${d.prefix}_USER`), pass = env(`${d.prefix}_PASS`);
  return user && pass ? { id, user, pass, cod: d.cod, contract: d.contract } : null;
}

// العقد 2 مُفعَّل متى ضُبطت أسراره الأربعة — وإلا يبقى الإنشاء على العقد 1 (نشر آمن).
export const contract2Ready = () =>
  ['YK2_GO_NORMAL', 'YK2_GO_COD', 'YK2_AO_NORMAL', 'YK2_AO_COD'].every(id => !!getAccount(id));

// أي حساب لطلب جديد: المُستلِم يدفع الشحن (shipping_payer=customer) ← AÖ، وإلا GÖ.
// تحصيل ← TAHSİLATLI. العقد 1 لا يملك AÖ (هناك يبقى GÖ كما كان).
export function pickAccountId(receiverPays: boolean, cod: boolean): string {
  if (contract2Ready()) return `YK2_${receiverPays ? 'AO' : 'GO'}_${cod ? 'COD' : 'NORMAL'}`;
  return cod ? 'YK1_COD' : 'YK1_NORMAL';
}

export function presence(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [id, d] of Object.entries(DEFS)) {
    out[`${d.prefix}_USER`] = !!env(`${d.prefix}_USER`);
    out[`${d.prefix}_PASS`] = !!env(`${d.prefix}_PASS`);
  }
  out.YURTICI_COD_DOCID = !!env('YURTICI_COD_DOCID');
  out.YURTICI_NORMAL_DOCID = !!env('YURTICI_NORMAL_DOCID');
  return out;
}
