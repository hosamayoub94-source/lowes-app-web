// =============================================================
// SalesDashboard — Daily Sales Report Wizard main page
// =============================================================
import { useState } from 'react';
import { useAuth } from '@hooks/useAuth';
import {
  useSalesBootstrap,
  useSalesDashboard,
  useSalesActions,
  useSelectedReportId,
  useReportDetail,
  useSalesLoading,
} from '../hooks/useSales.js';
import {
  REPORT_STATUS,
  REPORT_STATUS_LABELS,
  AD_PLATFORM_LABELS,
  formatROAS,
  roasColor,
} from '../types/sales.types.js';
import { ROLES } from '@data/teams';

const STATUS_COLORS = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-yellow-100 text-yellow-700',
  approved:  'bg-green-100 text-green-700',
};

export function SalesDashboard() {
  const { id, role } = useAuth();
  useSalesBootstrap(id);

  const { reports, kpis, isLoading } = useSalesDashboard();
  const { report, channelResults, adResults, isLoading: loadingDetail } = useReportDetail();
  const selectedReportId = useSelectedReportId();
  const { createReport, selectReport, submitReport, approveReport, deleteReport } = useSalesActions();
  const loading = useSalesLoading();

  const isAdmin = role === ROLES.ADMIN || role === ROLES.MANAGER || role === ROLES.SALES_MANAGER;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    report_date: new Date().toISOString().slice(0, 10),
    total_orders: '',
    total_sales_usd: '',
    total_ad_spend_usd: '',
    notes: '',
  });

  const handleCreate = async () => {
    const roas = form.total_ad_spend_usd > 0
      ? Number(form.total_sales_usd) / Number(form.total_ad_spend_usd)
      : 0;
    await createReport({
      ...form,
      total_orders: Number(form.total_orders) || 0,
      total_sales_usd: Number(form.total_sales_usd) || 0,
      total_ad_spend_usd: Number(form.total_ad_spend_usd) || 0,
      roas: Number(roas.toFixed(2)),
    });
    setShowForm(false);
    setForm({ report_date: new Date().toISOString().slice(0, 10), total_orders: '', total_sales_usd: '', total_ad_spend_usd: '', notes: '' });
  };

  return (
    <div className="min-h-screen bg-cream p-4 md:p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">📈 المبيعات اليومية</h1>
          <p className="text-sm text-muted mt-0.5">تقارير المبيعات ونتائج الإعلانات</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition"
        >
          + تقرير جديد
        </button>
      </div>

      {/* KPIs — last 7 days */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'طلبات آخر 7 أيام', value: kpis.last7Orders, icon: '🛒', color: 'text-text' },
          { label: 'مبيعات آخر 7 أيام', value: `$${Number(kpis.last7Sales).toFixed(0)}`, icon: '💵', color: 'text-green-600' },
          { label: 'إنفاق إعلاني',      value: `$${Number(kpis.last7Spend).toFixed(0)}`, icon: '📣', color: 'text-orange-500' },
          { label: 'ROAS متوسط',         value: formatROAS(kpis.avgRoas), icon: '📊', color: roasColor(kpis.avgRoas) },
        ].map(k => (
          <div key={k.label} className="bg-surface border border-border rounded-xl p-4">
            <div className="text-2xl mb-1">{k.icon}</div>
            <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-muted mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Reports list */}
        <div className="md:col-span-1 space-y-2">
          <h2 className="text-sm font-semibold text-muted mb-2">التقارير</h2>
          {isLoading ? (
            <div className="text-center py-8 text-muted text-sm">جار التحميل…</div>
          ) : reports.length === 0 ? (
            <div className="text-center py-8 text-muted text-sm">لا توجد تقارير</div>
          ) : (
            reports.map(r => (
              <button
                key={r.id}
                onClick={() => selectReport(r.id)}
                className={[
                  'w-full text-right p-4 rounded-xl border transition-all',
                  selectedReportId === r.id
                    ? 'border-teal bg-teal/5 shadow-sm'
                    : 'border-border bg-surface hover:border-teal/40',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] ?? ''}`}>
                    {REPORT_STATUS_LABELS[r.status] ?? r.status}
                  </span>
                  <span className="text-sm font-semibold text-text">{r.report_date}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <span className="text-xs text-muted">{r.total_orders} طلب</span>
                  <span className="text-sm font-bold text-teal">${Number(r.total_sales_usd).toFixed(0)}</span>
                </div>
                {r.roas > 0 && (
                  <div className="mt-1">
                    <span className={`text-xs font-bold ${roasColor(r.roas)}`}>ROAS: {formatROAS(r.roas)}</span>
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        {/* Report detail */}
        <div className="md:col-span-2">
          {!report ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted text-sm bg-surface border border-border rounded-xl">
              <span className="text-4xl mb-2">📈</span>
              <p>اختر تقريراً لعرض التفاصيل</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Report header */}
              <div className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-text text-lg">تقرير {report.report_date}</h2>
                  <div className="flex gap-2">
                    {isAdmin && report.status === REPORT_STATUS.SUBMITTED && (
                      <button
                        onClick={() => approveReport(report.id)}
                        disabled={loading.action}
                        className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition"
                      >
                        اعتماد
                      </button>
                    )}
                    {report.status === REPORT_STATUS.DRAFT && (
                      <button
                        onClick={() => submitReport(report.id)}
                        disabled={loading.action}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
                      >
                        إرسال للمراجعة
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-cream rounded-xl">
                    <div className="text-lg font-bold text-text">{report.total_orders}</div>
                    <div className="text-xs text-muted">طلبات</div>
                  </div>
                  <div className="text-center p-3 bg-cream rounded-xl">
                    <div className="text-lg font-bold text-green-600">${Number(report.total_sales_usd).toFixed(0)}</div>
                    <div className="text-xs text-muted">مبيعات</div>
                  </div>
                  <div className="text-center p-3 bg-cream rounded-xl">
                    <div className={`text-lg font-bold ${roasColor(report.roas)}`}>{formatROAS(report.roas)}</div>
                    <div className="text-xs text-muted">ROAS</div>
                  </div>
                </div>
                {report.notes && (
                  <p className="mt-3 text-xs text-muted">{report.notes}</p>
                )}
              </div>

              {/* Channel breakdown */}
              {channelResults.length > 0 && (
                <div className="bg-surface border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-text mb-3">حسب القناة</h3>
                  <div className="space-y-2">
                    {channelResults.map(c => (
                      <div key={c.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-border last:border-0">
                        <span className="text-sm text-text">{c.channel_name}</span>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-text">${Number(c.sales_usd).toFixed(0)}</span>
                          <span className="text-xs text-muted mr-2">{c.orders} طلب</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ad results */}
              {adResults.length > 0 && (
                <div className="bg-surface border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-text mb-3">نتائج الإعلانات</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted border-b border-border">
                          <th className="py-2 px-2 text-right">الحملة</th>
                          <th className="py-2 px-2 text-center">المنصة</th>
                          <th className="py-2 px-2 text-center">الإنفاق</th>
                          <th className="py-2 px-2 text-center">الطلبات</th>
                          <th className="py-2 px-2 text-center">الإيراد</th>
                          <th className="py-2 px-2 text-center">ROAS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adResults.map(a => (
                          <tr key={a.id} className="border-b border-border last:border-0">
                            <td className="py-2 px-2 text-right text-text font-medium">{a.campaign_name}</td>
                            <td className="py-2 px-2 text-center text-muted">{AD_PLATFORM_LABELS[a.platform] ?? a.platform}</td>
                            <td className="py-2 px-2 text-center text-orange-500">${Number(a.ad_spend_usd).toFixed(0)}</td>
                            <td className="py-2 px-2 text-center">{a.orders}</td>
                            <td className="py-2 px-2 text-center text-green-600">${Number(a.revenue_usd).toFixed(0)}</td>
                            <td className={`py-2 px-2 text-center font-bold ${roasColor(a.roas)}`}>{formatROAS(a.roas)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New Report Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-text mb-4">تقرير مبيعات جديد</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted mb-1 block">التاريخ</label>
                <input type="date" value={form.report_date} onChange={e => setForm(f => ({ ...f, report_date: e.target.value }))} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted mb-1 block">عدد الطلبات</label>
                  <input type="number" value={form.total_orders} onChange={e => setForm(f => ({ ...f, total_orders: e.target.value }))} placeholder="0" className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text" />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">إجمالي المبيعات ($)</label>
                  <input type="number" value={form.total_sales_usd} onChange={e => setForm(f => ({ ...f, total_sales_usd: e.target.value }))} placeholder="0" className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">إنفاق إعلاني ($)</label>
                <input type="number" value={form.total_ad_spend_usd} onChange={e => setForm(f => ({ ...f, total_ad_spend_usd: e.target.value }))} placeholder="0" className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text" />
              </div>
              {/* ROAS preview */}
              {form.total_sales_usd && form.total_ad_spend_usd && Number(form.total_ad_spend_usd) > 0 && (
                <div className="bg-cream rounded-lg p-3 text-center">
                  <span className="text-xs text-muted">ROAS المتوقع: </span>
                  <span className={`text-sm font-bold ${roasColor(Number(form.total_sales_usd) / Number(form.total_ad_spend_usd))}`}>
                    {formatROAS(Number(form.total_sales_usd) / Number(form.total_ad_spend_usd))}
                  </span>
                </div>
              )}
              <div>
                <label className="text-xs text-muted mb-1 block">ملاحظات</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-cream text-text resize-none" placeholder="اختياري…" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleCreate}
                disabled={loading.action}
                className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 disabled:opacity-50 transition"
              >
                حفظ كمسودة
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-text hover:bg-cream transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SalesDashboard;
