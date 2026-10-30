// fxRatesService — يقرأ أسعار الصرف الشهرية (جدول fx_monthly_rates + fx_currency_units) لاستعمال fxResolve. قراءة فقط؛ لا كتابة من الواجهة
// (الكتابة الوحيدة عبر الدالة fx_set_monthly_rate للأدمن). لا يبتلع الخطأ: الفشل يُرجَع صراحةً ليُعلَن «تعذّر تحميل أسعار الصرف».
import { supabase } from './supabase';

const RATE_COLS = 'purpose, currency, units_per_usd, period_month, market, currency_unit, status, rate_quality, source, note, approved_at, created_at';
let cache = null; // { at, value } — الجدول صغير؛ عمر الذاكرة قصير

/** @returns {Promise<{rows: Array, units: Array, error: string|null}>} */
export async function loadFxRates({ client = supabase, force = false, ttlMs = 5 * 60 * 1000 } = {}) {
  if (!force && cache && Date.now() - cache.at < ttlMs) return cache.value;
  const [r, u] = await Promise.all([
    client.from('fx_monthly_rates').select(RATE_COLS).eq('status', 'confirmed').not('period_month', 'is', null),
    client.from('fx_currency_units').select('currency, unit, valid_from, valid_to, min_amount, status'),
  ]);
  const err = r.error || u.error;
  if (err) return { rows: [], units: [], error: err.message || 'fx rates unavailable' }; // لا نخزّن الفشل
  const value = { rows: r.data || [], units: u.data || [], error: null };
  cache = { at: Date.now(), value };
  return value;
}
export function clearFxRatesCache() { cache = null; }

// ── S3a: شاشة الأدمن (الكتابة الوحيدة عبر الدالة fx_set_monthly_rate؛ أدمن فقط، سجل تدقيق، حفظ المستبدَل، مرآة الشهر الحالي) ──
const rpcErr = (e) => {
  const m = String(e?.message || e || '');
  if (/admin only|42501|permission denied/i.test(m + (e?.code || ''))) return 'لا صلاحية: إدخال الأسعار للأدمن فقط.';
  return m || 'تعذّر الحفظ';
};

/** يحفظ سعراً شهرياً. يرمي Error برسالة عربية عند الفشل (لا نجاح كاذب). */
export async function saveMonthlyRate({ purpose, currency, month, rate, market = null, note = null, quality = 'exact' }, { client = supabase } = {}) {
  const { data, error } = await client.rpc('fx_set_monthly_rate', {
    p_purpose: purpose, p_currency: currency, p_month: `${String(month).slice(0, 7)}-01`, p_rate: Number(rate),
    p_market: market, p_note: note?.trim() || null, p_source: 'admin_screen', p_quality: quality,
  });
  if (error) throw new Error(rpcErr(error));
  if (!data) throw new Error('لم يُرجع الخادم معرّف السعر — تحقّق قبل الاعتماد.');
  clearFxRatesCache();
  return data;
}

/** كل الصفوف (بما فيها المستبدَلة) + آخر أسعار الجدول القديم لفحص الاتساق. */
export async function loadFxAdminData({ client = supabase } = {}) {
  const [r, l] = await Promise.all([
    client.from('fx_monthly_rates').select(`${RATE_COLS}, id, entered_by, superseded_at`).not('period_month', 'is', null).order('period_month', { ascending: false }).order('created_at', { ascending: false }),
    client.from('exchange_rates').select('from_cur, to_cur, rate, created_at').order('created_at', { ascending: false }),
  ]);
  if (r.error) return { rows: [], legacyLatest: [], error: r.error.message };
  const seen = new Set(); const legacyLatest = [];
  for (const x of (l.data || [])) { const k = `${x.from_cur}>${x.to_cur}`; if (!seen.has(k)) { seen.add(k); legacyLatest.push(x); } }
  return { rows: r.data || [], legacyLatest, error: l.error ? `الجدول القديم: ${l.error.message}` : null };
}
