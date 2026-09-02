// =============================================================
// shippingService — admin-managed carrier list for the order form.
//
// Source of truth = `accounting_channels` (kind='shipping'). A carrier
// added once in «قنوات المحاسبة» (/admin/channels) therefore shows up in
// BOTH the order form's «ارسال مع» picker AND the expenses/accounting
// channel list — one add, two places (the owner's request).
//
// Safety net: if the DB is empty/unreachable, the order form falls back to
// the hardcoded SYRIA/TURKEY carrier lists in `@data/cities`, so creating
// an order never breaks even offline or before any channel is seeded.
//
// Market tagging: `accounting_channels.market` ('syria' | 'turkey' | 'both')
// is optional. While that column does not exist yet, channels are treated
// as Syria-side (that's where carriers actually churn); Turkey keeps its
// hardcoded list. Once the column is added (migration 0009) the per-market
// tag is honored automatically — no code change needed.
// =============================================================
import { create } from 'zustand';
import { shippingForMarket as fallbackShipping } from '@data/cities';

// Fetch active shipping carriers. Uses the authenticated app session, so the
// `accounting_channels` SELECT RLS (auth.uid() IS NOT NULL) is satisfied.
export async function fetchShippingChannels() {
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('accounting_channels')
    .select('id, name_ar, kind, is_active, sort_order, market')
    .eq('kind', 'shipping')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return data || [];
}

// Merge the hardcoded defaults with the admin-managed carriers for a market
// (union, deduped, order preserved). DB-added carriers (e.g. «بابل») appear;
// the hardcoded defaults remain as a familiar, always-present safety net.
export function mergeShipping(channels, market) {
  const base = fallbackShipping(market) || [];
  const db = (channels || [])
    .filter((c) => c && c.is_active !== false && String(c.kind) === 'shipping')
    // honor the market tag when present; otherwise treat channels as Syria-side
    .filter((c) => (c.market ? c.market === market || c.market === 'both' : market === 'syria'))
    .map((c) => String(c.name_ar || '').trim())
    .filter(Boolean);
  return [...new Set([...base, ...db])];
}

// =============================================================
// سوريا — القائمة الرسمية المقفلة + الترتيب المعتمد للطباعة
// (تدقيق 24 آب 2026، D-0xx). راجع Weekly_Reviews/القائمة السابقة كانت مفتوحة
// (ComboBox حر) وسمحت بأي نص، وخلطت أيضاً بين قنوات محاسبية داخلية (مصروف
// مواصلات، معرض بيع، حساب توزيع) وشركات شحن حقيقية لأن الكل كان مصنَّفاً
// kind='shipping' بجدول accounting_channels. الفحص الفعلي (بلا افتراض أسماء):
// لا واحدة من الثلاثة التالية ظهرت كـshipping_company بأي طلب عميل إطلاقاً —
// قيودها المحاسبية كلها داخلية (تكسي/بنزين، مصروف معرض، استلام بضاعة توزيع).
// =============================================================
export const SYRIA_NON_SHIPPING_CHANNEL_NAMES = ['مواصلات', 'معرض دمشق', 'كاندي'];

// ترتيب الطباعة المعتمد — الأولوية الست، ثم «الباقي» (شركات معتمدة أخرى، غير
// مذكورة هنا)، ثم «أخرى» دائماً أخيراً.
export const SYRIA_SHIPPING_PRIORITY = ['قدموس', 'الكرم', 'بابل', 'الموتور', 'ايزلا', 'توصيل جرمانا'];

// مطابقة مرنة لالتقاط الصيغ القديمة المخزَّنة بطلبات سابقة (كرم/شركة الكرم،
// بابل اكسبرس، توصيل ميتور، مسافات زائدة...) تحت شركتها الصحيحة — تُستخدم فقط
// وقت الطباعة/الفرز، ولا تُعدِّل القيمة المحفوظة بالطلب نفسه أبداً.
const SYRIA_ALIAS_PATTERNS = {
  'قدموس':        /قدموس/i,
  'الكرم':        /كرم/i,
  'بابل':         /بابل/i,
  'الموتور':      /موتور|ميتور/i,
  'ايزلا':        /ايزلا|إيزلا/i,
  'توصيل جرمانا': /جرمانا/i,
};

// القائمة الرسمية المعروضة بقائمة اختيار الطلب (سوريا فقط): الأولوية الست،
// ثم أي شركة شحن سورية أخرى معتمدة بقنوات المحاسبة (بعد استبعاد الجهات غير
// الشحنية أعلاه)، ثم «أخرى» دائماً أخيراً — الخيار الوحيد الذي يسمح بالكتابة.
export function syriaShippingOptions(channels) {
  const merged = mergeShipping(channels, 'syria')
    .filter((n) => !SYRIA_NON_SHIPPING_CHANNEL_NAMES.includes(n) && n !== 'أخرى');
  const rest = merged.filter((n) => !SYRIA_SHIPPING_PRIORITY.includes(n));
  return [...SYRIA_SHIPPING_PRIORITY, ...rest, 'أخرى'];
}

// يحدّد مجموعة الطباعة لطلب سوريا واحد: إحدى الأولوية الست، أو اسم شركة معتمدة
// أخرى («الباقي»)، أو 'أخرى' (نص غير معروف — يشمل ما كتبه الموظف فعلياً عند
// اختياره «أخرى» بالنموذج). `restNames` = خرج syriaShippingOptions بدون الأولوية
// وبدون 'أخرى'.
export function syriaCarrierGroupKey(shippingCompany, restNames = []) {
  const raw = String(shippingCompany || '').trim();
  if (!raw) return 'أخرى';
  for (const canon of SYRIA_SHIPPING_PRIORITY) {
    if (SYRIA_ALIAS_PATTERNS[canon].test(raw)) return canon;
  }
  const hit = restNames.find((n) => n.toLowerCase() === raw.toLowerCase());
  return hit || 'أخرى';
}

// Tiny shared store so the order modal reads carriers once per session and
// admin edits can nudge a refresh without a full page reload.
export const useShippingStore = create((set, get) => ({
  channels: [],
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      const channels = await fetchShippingChannels();
      set({ channels, loaded: true });
    } catch {
      set({ channels: [], loaded: true }); // fallback list still applies via mergeShipping
    } finally {
      set({ loading: false });
    }
  },
  reload: async () => {
    set({ loading: true });
    try {
      const channels = await fetchShippingChannels();
      set({ channels, loaded: true });
    } catch {
      /* keep whatever we had */
    } finally {
      set({ loading: false });
    }
  },
}));
