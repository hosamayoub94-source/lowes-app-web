import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@services/supabase';
import { useAuth } from '@hooks/useAuth';
import { listAbsenceReviews, saveAbsenceReview } from '@modules/payroll/services/absenceReviewService.js';

const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const workingDates = (ym) => {
  const [year, month] = ym.split('-').map(Number);
  const last = new Date(year, month, 0).getDate();
  return Array.from({ length: last }, (_, i) => {
    const d = i + 1;
    const date = new Date(year, month - 1, d);
    return date.getDay() === 0 ? null : `${ym}-${String(d).padStart(2, '0')}`;
  }).filter(Boolean);
};

export default function AbsenceReviewPanel({ month }) {
  const { name: reviewer } = useAuth();
  const [rows, setRows] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reason, setReason] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');
  const dates = useMemo(() => workingDates(month), [month]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const from = `${month}-01`;
      const to = `${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()).padStart(2, '0')}`;
      const loadProfiles = async () => {
        // payroll_excluded من migration 20261022 — إن لم تُطبَّق نعيد المحاولة بدونه.
        const r = await supabase.from('profiles').select('id,employee_name,team,role_type,payroll_excluded').eq('is_active', true).order('employee_name');
        if (r.error && /payroll_excluded/.test(r.error.message || '')) {
          return supabase.from('profiles').select('id,employee_name,team,role_type').eq('is_active', true).order('employee_name');
        }
        return r;
      };
      const [profilesResult, attendanceResult, reviewRows] = await Promise.all([
        loadProfiles(),
        supabase.from('attendance').select('employee_name,date,status').gte('date', `${month.replace('-', '/')}/01`).lte('date', `${month.replace('-', '/')}/${to.slice(-2)}`),
        listAbsenceReviews({ from, to }),
      ]);
      if (profilesResult.error) throw profilesResult.error;
      if (attendanceResult.error) throw attendanceResult.error;
      const present = new Set();
      const excused = new Set();
      for (const row of attendanceResult.data || []) {
        const key = `${row.employee_name}::${String(row.date).replaceAll('/', '-')}`;
        const status = String(row.status || '');
        if (status.match(/حاضر|خروج|متأخر|present|late/i)) present.add(key);
        if (status.match(/إجازة|اجازة|عطلة|leave|off/i)) excused.add(key);
      }
      const candidates = [];
      for (const employee of (profilesResult.data || []).filter(p => !p.payroll_excluded && p.role_type !== 'admin')) { // الأدمن غير ملزَم بتسجيل الحضور (قرار حسام 22/10/2026)
        for (const date of dates) {
          const key = `${employee.employee_name}::${date}`;
          if (!present.has(key) && !excused.has(key)) candidates.push({ ...employee, absence_date: date });
        }
      }
      setRows(candidates);
      setReviews(reviewRows);
    } catch (e) {
      console.error('[AbsenceReview]', e);
      setError('تعذر تحميل بيانات الغياب. تحقق من الاتصال أو صلاحيات قاعدة البيانات.');
    } finally { setLoading(false); }
  }, [month, dates]);

  useEffect(() => { load(); }, [load]);

  const reviewMap = useMemo(() => new Map(reviews.map(r => [`${r.employee_id}::${r.absence_date}`, r])), [reviews]);
  const pending = rows.filter(r => !reviewMap.has(`${r.id}::${r.absence_date}`) || reviewMap.get(`${r.id}::${r.absence_date}`).status === 'pending');
  async function decide(row, status) {
    const key = `${row.id}::${row.absence_date}`;
    setSaving(key);
    try {
      const saved = await saveAbsenceReview({ employeeId: row.id, employeeName: row.employee_name, absenceDate: row.absence_date, reason: reason[key], status, reviewer });
      setReviews(prev => [...prev.filter(x => `${x.employee_id}::${x.absence_date}` !== key), saved]);
    } catch (e) {
      console.error('[AbsenceReviewSave]', e);
      setError('تعذر حفظ القرار. حاول مجددًا.');
    } finally { setSaving(null); }
  }

  return <section className="mt-6 bg-surface border border-border rounded-2xl p-4" dir="rtl">
    <div className="flex items-center justify-between gap-3 mb-3">
      <div><h2 className="font-extrabold text-text">🧾 مراجعة غياب {AR_MONTHS[Number(month.slice(5)) - 1]}</h2><p className="text-xs text-muted mt-1">لا يُخصم أي يوم قبل اعتماد الإدارة. اليوم المرفوض/الممنوح يبقى ظاهرًا بلا خصم.</p></div>
      <span className="text-xs font-bold text-amber-600">{pending.length} بانتظار القرار</span>
    </div>
    {error ? <p className="text-sm text-red-600 py-6 text-center">{error}</p> : loading ? <p className="text-sm text-muted py-6 text-center">جارٍ تحميل أيام الغياب…</p> : rows.length === 0 ? <p className="text-sm text-muted py-6 text-center">لا توجد أيام غياب مكتشفة.</p> : <div className="space-y-2 max-h-[520px] overflow-y-auto">
      {rows.map(row => {
        const key = `${row.id}::${row.absence_date}`;
        const review = reviewMap.get(key);
        return <div key={key} className="border border-border/60 rounded-xl p-3 flex flex-wrap items-center gap-2">
          <div className="min-w-[180px] flex-1"><b className="text-sm text-text">{row.employee_name}</b><span className="text-xs text-muted mr-2">{row.absence_date}</span><div className="text-[11px] text-muted">{review ? (review.status === 'approved' ? '✅ معتمد للخصم' : review.status === 'rejected' ? '🟢 مرفوض/ممنوح — بلا خصم' : '⏳ قيد المراجعة') : '⏳ بلا تبرير أو قرار'}</div></div>
          <input value={reason[key] ?? review?.reason ?? ''} onChange={e => setReason(p => ({ ...p, [key]: e.target.value }))} placeholder="التبرير / ملاحظة الإدارة" className="flex-1 min-w-[190px] border border-border rounded-lg px-2 py-1.5 text-xs bg-surface-alt" />
          <button disabled={saving === key} onClick={() => decide(row, 'approved')} className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-bold disabled:opacity-50">اعتماد الخصم</button>
          <button disabled={saving === key} onClick={() => decide(row, 'rejected')} className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-bold disabled:opacity-50">مقبول/بلا خصم</button>
        </div>;
      })}
    </div>}
  </section>;
}
