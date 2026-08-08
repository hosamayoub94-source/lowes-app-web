// =============================================================
// WhatsAppAnalyticsPanel — لوحة تحليلات قناة واتساب. مكوّن مستقل
// (بيجيب بياناته بنفسه، متل ما كان بالأصل) — نُقل هون واتصمّم بنفس
// نمط بقية شاشة واتساب (Tabs/StatCard/Card من نظام التصميم الجاهز)،
// بلا أي تغيير بمنطق الجلب/الحساب. سبرنت ② من خطة النمو (5 أغسطس
// 2026): أول أرقام حقيقية لأداء قناة واتساب.
// =============================================================
import { useState, useEffect } from 'react';
import { Tabs, Card, CardTitle, StatCard, Badge } from '@components/ui';
import { getWhatsAppAnalytics } from '@services/whatsappAnalyticsService';

const PERIODS = [
  { key: 7,  label: '7 أيام' },
  { key: 30, label: '30 يوم' },
  { key: 90, label: '90 يوم' },
];

export function WhatsAppAnalyticsPanel() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true); setError(null);
    getWhatsAppAnalytics(days)
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
  const fmtMin = (m) => {
    if (m == null) return '—';
    if (m < 60) return `${Math.round(m)} د`;
    return `${(m / 60).toFixed(1)} س`;
  };

  return (
    <div className="space-y-3">
      <Tabs tabs={PERIODS.map(p => ({ key: p.key, label: p.label }))} value={days} onChange={setDays} size="sm" />

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
