// fxRatesService — يقرأ أسعار الصرف الشهرية (جدول fx_monthly_rates + fx_currency_units) لاستعمال fxResolve. قراءة فقط؛ لا كتابة من الواجهة
// (الكتابة الوحيدة عبر الدالة fx_set_monthly_rate للأدمن). لا يبتلع الخطأ: الفشل يُرجَع صراحةً ليُعلَن «تعذّر تحميل أسعار الصرف».
import { supabase } from './supabase';

const RATE_COLS = 'purpose, currency, units_per_usd, period_month, market, currency_unit, status, source, note, approved_at, created_at';
let cache = null; // { at, value } — الجدول صغير؛ عمر الذاكرة قصير

/** @returns {Promise<{rows: Array, units: Array, error: string|null}>} */
export async function loadFxRates({ client = supabase, force = false, ttlMs = 5 * 60 * 1000 } = {}) {
  if (!force && cache && Date.now() - cache.at < ttlMs) return cache.value;
  const [r, u] = await Promise.all([
    client.from('fx_monthly_rates').select(RATE_COLS).eq('status', 'confirmed').not('period_month', 'is', null),
    client.from('fx_currency_units').select('currency, unit, valid_from, valid_to, status'),
  ]);
  const err = r.error || u.error;
  if (err) return { rows: [], units: [], error: err.message || 'fx rates unavailable' }; // لا نخزّن الفشل
  const value = { rows: r.data || [], units: u.data || [], error: null };
  cache = { at: Date.now(), value };
  return value;
}
export function clearFxRatesCache() { cache = null; }
