// =============================================================
// WhatsAppAnalyticsPanel — لوحة تحليلات قناة واتساب. مكوّن مستقل
// (بيجيب بياناته بنفسه، متل ما كان بالأصل) — نُقل هون واتصمّم بنفس
// نمط بقية شاشة واتساب (Tabs/StatCard/Card من نظام التصميم الجاهز)،
// بلا أي تغيير بمنطق الجلب/الحساب. سبرنت ② من خطة النمو (5 أغسطس
// 2026): أول أرقام حقيقية لأداء قناة واتساب.
// =============================================================
import { useState, useEffect, useMemo } from 'react';
import { Card, CardTitle, StatCard, Badge } from '@components/ui';
import { getWhatsAppAnalytics } from '@services/whatsappAnalyticsService';
import { getAllCampaignConversions } from '@services/whatsappService';
import { todayISO, daysAgoISO } from '@services/campaignAnalyticsService';

// 15 أغسطس 2026: استُبدلت فترات "آخر N يوم من الآن" (7/30/90) بفترات
// تقويمية حقيقية (اليوم/أمس/يوم محدَّد) — نفس نمط "📡 لوحة الميديا باير"
// (`MediaBuyerBoardScreen.jsx`) بطلب مالك مباشر، عشان تصير كل لوحات
// التحليلات متّسقة بنفس أسلوب اختيار الفترة.
const PERIODS = [
  ['today', 'اليوم'], ['yesterday', 'أمس'], ['7d', '7 أيام'], ['30d', '30 يوم'], ['custom', 'تحديد يوم'],
];

export function WhatsAppAnalyticsPanel() {
  const [period, setPeriod] = useState('30d');
  const [customDate, setCustomDate] = useState(todayISO());
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  // مبيعات مصنَّفة يدوياً من الموظفين (زر "🛍️ سجّل شراء" بالمحادثة) — مقياس
  // مختلف عن `stats.converted` فوق (مطابقة تلقائية لأي طلب حقيقي، بلا ربط
  // بحملة محدَّدة). 15 أغسطس 2026، طلب مالك: "نعرف بشكل عام شو بعنا من
  // هالحملات" — هاي البطاقة تجاوب عليه تحديداً (مبلغ حقيقي بالليرة، لا عدّاد بس).
  const [campaignSales, setCampaignSales] = useState(null);

  const range = useMemo(() => {
    if (period === 'today')     return { from: todayISO(), to: todayISO() };
    if (period === 'yesterday') return { from: daysAgoISO(1), to: daysAgoISO(1) };
    if (period === '7d')        return { from: daysAgoISO(6), to: todayISO() };
    if (period === '30d')       return { from: daysAgoISO(29), to: todayISO() };
    return { from: customDate, to: customDate }; // 'custom'
  }, [period, customDate]);

  useEffect(() => {
    setLoading(true); setError(null);
    getWhatsAppAnalytics(range)
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    getAllCampaignConversions(range).then(setCampaignSales).catch(() => setCampaignSales(null));
  }, [range]);

  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
  const fmtMin = (m) => {
    if (m == null) return '—';
    if (m < 60) return `${Math.round(m)} د`;
    return `${(m / 60).toFixed(1)} س`;
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap items-center">
        {PERIODS.map(([k, l]) => (
          <button key={k} onClick={() => setPeriod(k)}
            className={'px-3 py-1.5 rounded-xl text-xs font-bold transition border ' + (period === k ? 'bg-teal text-navy border-teal' : 'bg-surface-alt text-muted hover:text-text border-border')}>
            {l}
          </button>
        ))}
        {period === 'custom' && (
          <input type="date" value={customDate} max={todayISO()} onChange={e => setCustomDate(e.target.value)}
            className="border border-border rounded-xl px-2 py-1.5 text-xs bg-surface text-text" />
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-surface-alt animate-pulse rounded-2xl" />)}
        </div>
      ) : error ? (
        <Card variant="flat" className="bg-red-bg border-red/20 text-red-fg text-sm">{error}</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="محادثة" value={fmt(stats.totalConvos)} tone="teal" />
            <StatCard label="وارد / صادر" value={`${fmt(stats.totalIn)} / ${fmt(stats.totalOut)}`} />
            <StatCard label="معدل رد العميل" value={`${stats.replyRate}%`} tone="amber" />
            <StatCard label="متوسط سرعة رد الفريق" value={fmtMin(stats.avgResponseMin)} tone="navy" />
          </div>

          <Card variant="flat" className="bg-teal/10 border-teal/30 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-teal-700">💰 تحويل لطلب فعلي (خلال 7 أيام من أول رسالة)</p>
              <p className="text-[11px] text-muted mt-0.5">مطابقة أرقام محادثات واتساب مع طلبات تركيا الفعلية — تركيا فقط (واتساب سوريا محظور).</p>
            </div>
            <div className="text-center shrink-0">
              <p className="text-2xl font-extrabold text-teal">{stats.converted}</p>
              <p className="text-[11px] text-muted">{stats.conversionRate}% من المحادثات</p>
            </div>
          </Card>
          <p className="text-[10px] text-muted text-center">
            {stats.customerInitiated} محادثة بلّشها العميل من أصل {stats.totalConvos} — الباقي إشعارات آلية (تتبّع شحن) ما تلاها رد.
          </p>

          {/* مبيعات مصنَّفة يدوياً من حملات واتساب — زر "🛍️ سجّل شراء" داخل
              أي محادثة حملة (15 أغسطس 2026). مختلف عن بطاقة "تحويل لطلب
              فعلي" فوق (تلقائية، أي طلب — مو مربوطة بحملة تحديداً). */}
          {campaignSales != null && campaignSales.count > 0 && (
            <Card variant="flat" className="bg-amber-500/10 border-amber-500/30 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-amber-700">🛍️ مبيعات مصنَّفة يدوياً من الحملات</p>
                <p className="text-[11px] text-muted mt-0.5">سجّلها الموظفون بأنفسهم من داخل محادثات الحملات — مبلغ حقيقي بالليرة، لا تخمين.</p>
              </div>
              <div className="text-center shrink-0">
                <p className="text-2xl font-extrabold text-amber-700">{fmt(campaignSales.revenue)}₺</p>
                <p className="text-[11px] text-muted">{campaignSales.count} عملية شراء</p>
              </div>
            </Card>
          )}

          {/* أداء كل موظف على واتساب — طلب مالك 6 أغسطس 2026: "بدي قيّم مين
              عم يشتغل". عدد الرسائل الصادرة + متوسط سرعة الرد لكل موظف،
              مستخرَجة من عمود by_user (نفس معرّف الموظف بجدول profiles). */}
          {stats.agentStats?.length > 0 && (
            <Card variant="flat">
              <CardTitle className="text-xs mb-2">👤 أداء الموظفين</CardTitle>
              <div className="space-y-1.5">
                {stats.agentStats.map(a => (
                  <div key={a.byUser} className="flex items-center justify-between text-xs border-b border-border/30 pb-1.5 last:border-0 last:pb-0">
                    <span className="font-bold text-text">{a.name}</span>
                    <span className="flex items-center gap-2">
                      <Badge tone="neutral">{a.sent} رسالة</Badge>
                      <Badge tone="neutral">{a.avgResponseMin != null ? fmtMin(a.avgResponseMin) : '—'} متوسط الرد</Badge>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default WhatsAppAnalyticsPanel;
