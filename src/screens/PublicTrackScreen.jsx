// =============================================================
// PublicTrackScreen — صفحة تتبّع علنية للعميل (بلا تسجيل دخول).
// بديل احترافي لإرسال رابط شركة الشحن الخام بالرسائل — نفس أسلوب
// الشركات العالمية (DHL/Aramex/إلخ): رابط بدومين الشركة نفسها، يعرض
// حالة الطلب بهوية بصرية موحّدة، وبزر يوصل لتتبّع شركة الشحن الفعلي.
// طلب مالك 5 أغسطس 2026: "لا تقلل من شأننا — يجب نظهر بخدمة عالية المستوى".
//
// ⚠️ خصوصية: كود الطلب تسلسلي وقابل للتخمين — نعرض هون بس معلومات غير
// حسّاسة (اسم أول + حالة + شركة شحن + رقم تتبّع)، بلا هاتف/عنوان/مبلغ.
// =============================================================
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@services/supabase';
import { STATUSES } from '@data/orderStatus';
import { COMPANY, BRAND_ASSETS } from '@data/brand';
import { trackingLink } from '@utils/shippingTracking';

export default function PublicTrackScreen() {
  const { orderCode } = useParams();
  const [order, setOrder] = useState(undefined); // undefined = جارٍ التحميل، null = غير موجود
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setOrder(undefined);
    supabase
      .from('orders')
      .select('order_id, status, shipping_company, tracking_number, customer_name, market, updated_at')
      .eq('order_id', orderCode)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) { setError('صار خطأ بتحميل بيانات الطلب — حاولي كمان شوي.'); setOrder(null); return; }
        setOrder(data || null);
      });
    return () => { cancelled = true; };
  }, [orderCode]);

  const st = order ? STATUSES[order.status] : null;
  const link = order ? trackingLink(order.shipping_company, order.tracking_number) : null;
  const firstName = order?.customer_name ? String(order.customer_name).trim().split(/\s+/)[0] : '';

  return (
    <div dir="rtl" className="min-h-screen bg-cream flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-2 mb-8">
          <img src={BRAND_ASSETS.logoUrl} alt={COMPANY.website} className="w-16 h-16 rounded-full shadow" />
          <h1 className="text-lg font-extrabold text-navy">LOWE&apos;S Professional</h1>
          <p className="text-xs text-muted">تتبّع طلبك</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
          {order === undefined && (
            <div className="text-center py-10 text-muted text-sm">⏳ جارٍ التحميل…</div>
          )}

          {order === null && (
            <div className="text-center py-10 space-y-2">
              <p className="text-4xl">📦</p>
              <p className="font-bold text-text">{error || 'ما لقينا طلب بهالرقم'}</p>
              <p className="text-xs text-muted" dir="ltr">{orderCode}</p>
              <p className="text-xs text-muted mt-2">تأكدي من رقم الطلب، أو تواصلي معنا مباشرة.</p>
            </div>
          )}

          {order && (
            <>
              <div className="text-center space-y-1">
                <p className="text-xs text-muted">رقم الطلب</p>
                <p className="font-extrabold text-navy text-lg" dir="ltr">{order.order_id}</p>
              </div>

              <div className={`rounded-xl p-4 text-center border ${st?.border || 'border-border'} ${st?.bg || 'bg-surface-alt'}`}>
                <p className="text-3xl mb-1">{st?.icon || '📦'}</p>
                <p className={`font-bold ${st?.text || 'text-text'}`}>{st?.label || order.status}</p>
                {firstName && <p className="text-xs text-muted mt-1">أهلاً {firstName} 🌿</p>}
              </div>

              {order.tracking_number && (
                <div className="border-t border-border/40 pt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">شركة الشحن</span>
                    <span className="font-bold text-text">{order.shipping_company || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">رقم التتبّع</span>
                    <span className="font-mono font-bold text-text" dir="ltr">{order.tracking_number}</span>
                  </div>
                  {link && (
                    <a href={link} target="_blank" rel="noreferrer"
                      className="block w-full text-center py-3 rounded-xl bg-navy text-white text-sm font-bold hover:opacity-90 transition mt-2">
                      تتبّع الشحنة مباشرة 🔗
                    </a>
                  )}
                </div>
              )}

              {!order.tracking_number && (
                <p className="text-center text-xs text-muted border-t border-border/40 pt-4">
                  رقم التتبّع لسا ما انسجّل — رح نبعتلك ياه أول ما يجهز.
                </p>
              )}
            </>
          )}
        </div>

        <div className="text-center mt-8 space-y-1">
          <p className="text-xs text-muted">{COMPANY.website}</p>
          <p className="text-xs text-muted" dir="ltr">{COMPANY.instagramSkincare}</p>
        </div>
      </div>
    </div>
  );
}
