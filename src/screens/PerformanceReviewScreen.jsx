// =============================================================
// PerformanceReviewScreen — تقييم الأداء الشهري
// المدير يقيّم الموظفين، الموظف يشوف تقييماته
// Table: performance_reviews
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@services/supabase';
import { useAuth }  from '@hooks/useAuth';
import { ROLES }    from '@data/teams';

const CATEGORIES = [
  { key: 'rating_overall',    label: 'التقييم العام',       icon: '⭐' },
  { key: 'rating_attendance', label: 'الحضور والانتزام',    icon: '🕐' },
  { key: 'rating_tasks',      label: 'إنجاز المهام',        icon: '✅' },
  { key: 'rating_attitude',   label: 'التعاون والسلوك',     icon: '🤝' },
  { key: 'rating_knowledge',  label: 'معرفة المنتجات',      icon: '🧴' },
];

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function ratingLabel(n) {
  if (!n) return '—';
  const labels = ['','ضعيف','مقبول','جيد','جيد جداً','ممتاز'];
  return labels[n] || String(n);
}
function ratingColor(n) {
  if (!n) return 'text-muted';
  if (n <= 2) return 'text-red-500';
  if (n === 3) return 'text-amber-500';
  if (n === 4) return 'text-teal';
  return 'text-green-600';
}

// ── Star rating selector ──────────────────────────────────────
function StarSelector({ value, onChange }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1 items-center">
      {[1,2,3,4,5].map(s => (
        <button
          key={s}
          onClick={() => onChange(s)}
          onMouseEnter={() => setHovered(s)}
          onMouseLeave={() => setHovered(0)}
          className={`text-2xl transition-transform hover:scale-110 ${
            s <= (hovered || value) ? 'text-amber-400' : 'text-border'
          }`}
        >★</button>
      ))}
      {value > 0 && (
        <span className={`text-xs font-bold ms-1 ${ratingColor(value)}`}>{ratingLabel(value)}</span>
      )}
    </div>
  );
}

// ── Stars display (read-only) ─────────────────────────────────
function StarDisplay({ value }) {
  return (
    <div className="flex gap-0.5 items-center">
      {[1,2,3,4,5].map(s => (
        <span key={s} className={s <= (value||0) ? 'text-amber-400' : 'text-border'}>★</span>
      ))}
      <span className={`text-xs font-bold ms-1 ${ratingColor(value)}`}>{ratingLabel(value)}</span>
    </div>
  );
}

// ── Review card (read) ────────────────────────────────────────
function ReviewCard({ rev, forManager }) {
  const [open, setOpen] = useState(false);
  const avg = Math.round(
    CATEGORIES.reduce((sum, c) => sum + (rev[c.key] || 0), 0) / CATEGORIES.length
  );

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-right hover:bg-surface-alt/50 transition"
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0
          ${avg >= 4 ? 'bg-green-50 text-green-600' : avg >= 3 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-500'}`}>
          {avg}/5
        </div>
        <div className="flex-1 min-w-0 text-right">
          <p className="text-sm font-bold text-text">
            {MONTHS_AR[rev.period_month - 1]} {rev.period_year}
            {forManager && ` — ${rev.employee_name}`}
          </p>
          <p className="text-xs text-muted mt-0.5">بقلم: {rev.reviewer_name}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {[1,2,3,4,5].map(s => (
            <span key={s} className={`text-sm ${s <= avg ? 'text-amber-400' : 'text-border'}`}>★</span>
          ))}
          <span className={`text-xs ms-1 transition-transform ${open ? 'rotate-90' : ''}`}>‹</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-4 space-y-3 bg-surface-alt/30" dir="rtl">
          {CATEGORIES.map(cat => (
            <div key={cat.key} className="flex items-center justify-between">
              <span className="text-xs text-muted">{cat.icon} {cat.label}</span>
              <StarDisplay value={rev[cat.key]} />
            </div>
          ))}
          {rev.strengths && (
            <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-2">
              <p className="text-[10px] font-bold text-green-600 mb-1">💪 نقاط القوة</p>
              <p className="text-xs text-text">{rev.strengths}</p>
            </div>
          )}
          {rev.improvements && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              <p className="text-[10px] font-bold text-amber-600 mb-1">🎯 نقاط التطوير</p>
              <p className="text-xs text-text">{rev.improvements}</p>
            </div>
          )}
          {rev.notes && (
            <div className="bg-surface rounded-xl px-3 py-2">
              <p className="text-[10px] font-bold text-muted mb-1">📝 ملاحظات</p>
              <p className="text-xs text-text">{rev.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── New review form (manager only) ────────────────────────────
function ReviewFormModal({ employees, reviewer, onClose, onSaved }) {
  const now = new Date();
  const [employee, setEmployee] = useState('');
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [ratings, setRatings] = useState({ rating_overall:0, rating_attendance:0, rating_tasks:0, rating_attitude:0, rating_knowledge:0 });
  const [strengths,    setStrengths]    = useState('');
  const [improvements, setImprovements] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState(null);

  const setRating = (key, val) => setRatings(r => ({ ...r, [key]: val }));

  const save = async () => {
    if (!employee) { setError('اختر موظفاً'); return; }
    const allFilled = CATEGORIES.every(c => ratings[c.key] > 0);
    if (!allFilled) { setError('يرجى تقييم جميع المحاور'); return; }
    setSaving(true); setError(null);
    const { error: e } = await supabase.from('performance_reviews').upsert({
      employee_name: employee,
      reviewer_name: reviewer,
      period_year:   Number(year),
      period_month:  Number(month),
      ...ratings,
      strengths:    strengths.trim() || null,
      improvements: improvements.trim() || null,
      notes:        notes.trim() || null,
    }, { onConflict: 'employee_name,period_year,period_month' });
    setSaving(false);
    if (e) { setError(e.message); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" dir="rtl">
      <div className="bg-surface rounded-3xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h3 className="text-base font-extrabold text-text">تقييم أداء جديد</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-surface-alt text-muted hover:text-text flex items-center justify-center text-lg transition">✕</button>
        </div>

        <div className="overflow-y-auto px-5 pb-6 space-y-4">
          {/* Employee */}
          <div>
            <p className="text-xs font-bold text-muted mb-1.5">الموظف</p>
            <select
              value={employee}
              onChange={e => setEmployee(e.target.value)}
              className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text focus:outline-none focus:border-teal"
            >
              <option value="">اختر موظفاً...</option>
              {employees.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Period */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs font-bold text-muted mb-1.5">الشهر</p>
              <select
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text focus:outline-none focus:border-teal"
              >
                {MONTHS_AR.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs font-bold text-muted mb-1.5">السنة</p>
              <select
                value={year}
                onChange={e => setYear(e.target.value)}
                className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text focus:outline-none focus:border-teal"
              >
                {[now.getFullYear()-1, now.getFullYear()].map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Ratings */}
          <div className="bg-surface-alt rounded-2xl p-4 space-y-4">
            <p className="text-xs font-extrabold text-muted uppercase tracking-wide">التقييمات</p>
            {CATEGORIES.map(cat => (
              <div key={cat.key} className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-text whitespace-nowrap">{cat.icon} {cat.label}</span>
                <StarSelector value={ratings[cat.key]} onChange={v => setRating(cat.key, v)} />
              </div>
            ))}
          </div>

          {/* Text fields */}
          {[
            { label: '💪 نقاط القوة', val: strengths, set: setStrengths, placeholder: 'ما يتميز به الموظف...' },
            { label: '🎯 نقاط التطوير', val: improvements, set: setImprovements, placeholder: 'ما يحتاج تحسين...' },
            { label: '📝 ملاحظات إضافية', val: notes, set: setNotes, placeholder: 'أي ملاحظات أخرى...' },
          ].map(f => (
            <div key={f.label}>
              <p className="text-xs font-bold text-muted mb-1.5">{f.label}</p>
              <textarea
                value={f.val}
                onChange={e => f.set(e.target.value)}
                rows={2}
                placeholder={f.placeholder}
                className="w-full bg-surface-alt border border-border rounded-xl px-3 py-2.5 text-sm text-text focus:outline-none focus:border-teal resize-none"
              />
            </div>
          ))}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="w-full py-3 rounded-2xl bg-teal text-navy font-extrabold text-sm hover:bg-teal/90 active:scale-95 transition disabled:opacity-50"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ التقييم'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function PerformanceReviewScreen() {
  const { name, role } = useAuth();
  const isManager = [ROLES.ADMIN, ROLES.MANAGER].includes(role);

  const [reviews,   setReviews]   = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [formOpen,  setFormOpen]  = useState(false);
  const [filterEmp, setFilterEmp] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const query = supabase.from('performance_reviews').select('*').order('period_year', { ascending: false }).order('period_month', { ascending: false });
    if (!isManager) query.eq('employee_name', name);
    const { data } = await query;
    setReviews(data ?? []);

    if (isManager) {
      const { data: profs } = await supabase.from('profiles').select('employee_name').eq('is_active', true).order('employee_name');
      setEmployees((profs ?? []).map(p => p.employee_name).filter(Boolean));
    }
    setLoading(false);
  }, [name, isManager]);

  useEffect(() => { load(); }, [load]);

  const displayed = filterEmp ? reviews.filter(r => r.employee_name === filterEmp) : reviews;

  return (
    <div className="space-y-5 pb-6" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl font-extrabold text-text">تقييم الأداء</h1>
          <p className="text-xs text-muted mt-0.5">
            {isManager ? 'تقييم الفريق شهرياً' : 'متابعة تقييماتك الشهرية'}
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 active:scale-95 transition shadow-sm"
          >
            + تقييم
          </button>
        )}
      </div>

      {/* Manager filter */}
      {isManager && employees.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setFilterEmp('')}
            className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-bold transition ${
              !filterEmp ? 'bg-teal text-navy border-teal' : 'border-border text-muted hover:border-teal/30 hover:text-teal'
            }`}
          >الكل</button>
          {employees.map(emp => (
            <button
              key={emp}
              onClick={() => setFilterEmp(emp === filterEmp ? '' : emp)}
              className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-bold transition ${
                filterEmp === emp ? 'bg-teal text-navy border-teal' : 'border-border text-muted hover:border-teal/30 hover:text-teal'
              }`}
            >{emp}</button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-surface-alt animate-pulse rounded-2xl" />)}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-sm font-semibold">
            {isManager ? 'لا توجد تقييمات بعد — اضغط "+ تقييم" لبدء التقييم' : 'لا توجد تقييمات بعد'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(r => (
            <ReviewCard key={r.id} rev={r} forManager={isManager} />
          ))}
        </div>
      )}

      {formOpen && (
        <ReviewFormModal
          employees={employees}
          reviewer={name}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); load(); }}
        />
      )}
    </div>
  );
}
