import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@services/supabase';
import { useAuth } from '@hooks/useAuth';
import { listAbsenceReviews, saveAbsenceReview } from '@modules/payroll/services/absenceReviewService.js';
import { buildAbsenceCandidates, monthBounds } from '@modules/payroll/utils/absenceCandidates.js';

const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function AbsenceReviewPanel({ month }) {
  const { name: reviewer } = useAuth();
  const [rows, setRows] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reason, setReason] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');
  const [canDecide, setCanDecide] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { from, to } = monthBounds(month);
      const loadProfiles = async () => {
        // join_date/resigned_at لاستثناء ما قبل المباشرة وما بعد الاستقالة؛ ويشمل من استقال داخل الشهر.
        const r = await supabase.from('profiles')
          .select('id,employee_name,team,role_type,payroll_excluded,join_date,resigned_at,is_active')
          .or(`is_active.eq.true,and(is_active.eq.false,resigned_at.gte.${from})`)
          .order('employee_name');
        if (r.error && /payroll_excluded|join_date|resigned_at/.test(r.error.message || '')) {
          return supabase.from('profiles').select('id,employee_name,team,role_type').eq('is_active', true).order('employee_name');
        }
        return r;
      };
      const [profilesResult, attendanceResult, leaveResult, legacyLeaveResult, reviewRows, accessResult] = await Promise.all([
        loadProfiles(),
        supabase.from('attendance').select('employee_name,date,status').gte('date', from.replaceAll('-', '/')).lte('date', to.replaceAll('-', '/')),
        supabase.from('requests').select('employee_name,start_date,end_date').eq('request_type', 'leave').eq('status', 'approved').lte('start_date', to).or(`end_date.gte.${from},end_date.is.null`),
        supabase.from('leave_requests').select('employee_id,employee_name,start_date,end_date').eq('status', 'approved').lte('start_date', to).or(`end_date.gte.${from},end_date.is.null`),
        listAbsenceReviews({ from, to }),
        supabase.rpc('payroll_has_access'),
      ]);
      for (const r of [profilesResult, attendanceResult, leaveResult, legacyLeaveResult]) if (r.error) throw r.error;
      setRows(buildAbsenceCandidates({
        month,
        today: localToday(),
        profiles: profilesResult.data || [],
        attendance: attendanceResult.data || [],
        approvedLeaves: [...(leaveResult.data || []), ...(legacyLeaveResult.data || [])],
        // لا يوجد جدول عطل رسمية في القاعدة بعد؛ العطلة المسجّلة بالحضور («عطلة») تُستثنى أعلاه.
        holidays: [],
      }));
      setReviews(reviewRows);
      setCanDecide(accessResult.data === true);
    } catch (e) {
      console.error('[AbsenceReview]', e);
      setError('تعذر تحميل بيانات الغياب. تحقق من الاتصال أو صلاحيات قاعدة البيانات.');
    } finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const reviewMap = useMemo(() => new Map(reviews.map(r => [`${r.employee_id}::${r.absence_date}`, r])), [reviews]);
  const pending = rows.filter(r => !reviewMap.has(`${r.id}::${r.absence_date}`) || reviewMap.get(`${r.id}::${r.absence_date}`).status === 'pending');
  async function decide(row, status) {
    const key = `${row.id}::${row.absence_date}`;
    const text = (reason[key] ?? reviewMap.get(key)?.reason ?? '').trim();
    if (status === 'pending' && !text) { setError('اكتب التبرير أولاً ثم احفظه.'); return; }
    setSaving(key);
    setError('');
    try {
      const saved = await saveAbsenceReview({ employeeId: row.id, employeeName: row.employee_name, absenceDate: row.absence_date, reason: text, status, reviewer });
      setReviews(prev => [...prev.filter(x => `${x.employee_id}::${x.absence_date}` !== key), saved]);
    } catch (e) {
      console.error('[AbsenceReviewSave]', e);
      setError('تعذر حفظ القرار. حاول مجددًا.');
    } finally { setSaving(null); }
  }

  return <section className="mt-6 bg-surface border border-border rounded-2xl p-4" dir="rtl">
    <div className="flex items-center justify-between gap-3 mb-3">
      <div><h2 className="font-extrabold text-text">🧾 مراجعة غياب {AR_MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}</h2><p className="text-xs text-muted mt-1">لا يُخصم أي يوم إلا بعد «اعتماد الخصم». المعلّق والمرفوض بلا خصم. الإجازات المعتمدة والعطل والأحد وما قبل المباشرة وبعد الاستقالة والأيام القادمة غير معروضة.</p></div>
      <span className="text-xs font-bold text-amber-600">{pending.length} بانتظار القرار</span>
    </div>
    {!loading && !error && !canDecide && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2 mb-2">🔒 لا تملك صلاحية الرواتب — العرض للاطلاع فقط، والقرارات المحفوظة لا تظهر لك.</p>}
    {error && <p className="text-sm text-red-600 py-2 text-center">{error}</p>}
    {loading ? <p className="text-sm text-muted py-6 text-center">جارٍ تحميل أيام الغياب…</p> : rows.length === 0 ? <p className="text-sm text-muted py-6 text-center">لا توجد أيام غياب مكتشفة.</p> : <div className="space-y-2 max-h-[520px] overflow-y-auto">
      {rows.map(row => {
        const key = `${row.id}::${row.absence_date}`;
        const review = reviewMap.get(key);
        return <div key={key} className="border border-border/60 rounded-xl p-3 flex flex-wrap items-center gap-2">
          <div className="min-w-[180px] flex-1"><b className="text-sm text-text">{row.employee_name}</b><span className="text-xs text-muted mr-2">{row.absence_date}</span><div className="text-[11px] text-muted">{review ? (review.status === 'approved' ? '✅ معتمد للخصم' : review.status === 'rejected' ? '🟢 مرفوض/ممنوح — بلا خصم' : '⏳ تبرير محفوظ — بانتظار القرار (بلا خصم)') : '⏳ بلا تبرير أو قرار'}</div></div>
          <input disabled={!canDecide} value={reason[key] ?? review?.reason ?? ''} onChange={e => setReason(p => ({ ...p, [key]: e.target.value }))} placeholder="التبرير / ملاحظة الإدارة" className="flex-1 min-w-[190px] border border-border rounded-lg px-2 py-1.5 text-xs bg-surface-alt disabled:opacity-60" />
          {canDecide && <>
            <button disabled={saving === key} onClick={() => decide(row, 'pending')} className="px-3 py-1.5 rounded-lg bg-surface-alt text-text text-xs font-bold disabled:opacity-50">حفظ التبرير</button>
            <button disabled={saving === key} onClick={() => decide(row, 'approved')} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-bold disabled:opacity-50">اعتماد الخصم</button>
            <button disabled={saving === key} onClick={() => decide(row, 'rejected')} className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-bold disabled:opacity-50">مقبول/بلا خصم</button>
          </>}
        </div>;
      })}
    </div>}
  </section>;
}
