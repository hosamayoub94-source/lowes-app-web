// =============================================================
// PerformanceScreen — نظام KPI والعمولات الحقيقي
// مبني على SALES_RULES.md الرسمي للشركة
//
// KPI 100 نقطة:
//   30% حجم المبيعات · 15% زيارات · 15% عملاء جدد
//   15% إعادة الطلب · 15% التحصيل · 10% الانضباط
//
// العمولات:
//   مبتدئ: 8% ثابتة · نشيط: 5%+3% · محترف: 10%+ · وكيل: 20%+
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth }  from '@hooks/useAuth';
import { supabase } from '@services/supabase';
import { ROLES }    from '@data/teams';

// ── Constants from SALES_RULES.md ──────────────────────────────
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

const LEVELS = {
  junior:       { label: 'مبتدئ',    icon: '🌱', base_commission: 8,  monthly_min: 25, color: 'text-gray-600' },
  active:       { label: 'نشيط',     icon: '⭐', base_commission: 5,  monthly_min: 60, color: 'text-blue-600' },
  professional: { label: 'محترف',    icon: '🔥', base_commission: 10, monthly_min: 0,  color: 'text-amber-600' },
  agent:        { label: 'وكيل منطقة', icon: '💎', base_commission: 20, monthly_min: 0, color: 'text-purple-600' },
};

const KPI_WEIGHTS = [
  { key: 'sales',      label: 'حجم المبيعات',       weight: 30, min_target: null,  unit: '$',  icon: '💵' },
  { key: 'visits',     label: 'الزيارات اليومية',   weight: 15, min_target: 15,    unit: 'زيارة/يوم', icon: '🚶' },
  { key: 'new_clients',label: 'عملاء جدد',           weight: 15, min_target: 4,     unit: 'عميل', icon: '🆕' },
  { key: 'retention',  label: 'إعادة الطلب',         weight: 15, min_target: 70,    unit: '%',  icon: '🔄' },
  { key: 'collection', label: 'نسبة التحصيل',        weight: 15, min_target: 95,    unit: '%',  icon: '💳' },
  { key: 'discipline', label: 'الانضباط',             weight: 10, min_target: 8,     unit: '/10', icon: '📋' },
];

// Volume bonus tiers from SALES_RULES.md
function calcVolumeBonus(level, achievementPct) {
  const tiers = [
    { min: 150, junior: 0, active: 7, professional: 10, agent: 12 },
    { min: 120, junior: 0, active: 5, professional: 7,  agent: 9  },
    { min: 100, junior: 0, active: 3, professional: 5,  agent: 6  },
    { min: 80,  junior: 0, active: 1, professional: 2,  agent: 3  },
  ];
  const tier = tiers.find(t => achievementPct >= t.min);
  return tier ? (tier[level] ?? 0) : 0;
}

function calcTotalScore(kpiData) {
  let total = 0;
  KPI_WEIGHTS.forEach(({ key, weight, min_target }) => {
    const val = Number(kpiData[key] ?? 0);
    let score = 0;
    if (key === 'sales') {
      const target = Number(kpiData.sales_target ?? 1);
      score = target > 0 ? Math.min(100, (val / target) * 100) : 0;
    } else if (key === 'visits')      score = min_target ? Math.min(100, (val / min_target) * 100) : val;
    else if (key === 'new_clients')   score = min_target ? Math.min(100, (val / min_target) * 100) * (val >= min_target ? 1 : 0.7) : val;
    else if (key === 'retention')     score = val >= 85 ? 100 : val >= 70 ? 75 : val >= 50 ? 40 : 0;
    else if (key === 'collection')    score = val >= 100 ? 100 : val >= 95 ? 85 : val >= 90 ? 60 : val >= 80 ? 30 : 0;
    else if (key === 'discipline')    score = Math.min(100, (val / 10) * 100);
    total += (score / 100) * weight;
  });
  return Math.round(total);
}

function scoreColor(s) {
  if (s >= 90) return 'text-green-fg';
  if (s >= 75) return 'text-teal';
  if (s >= 60) return 'text-amber-fg';
  return 'text-red-fg';
}
function scoreBg(s) {
  if (s >= 90) return 'bg-green';
  if (s >= 75) return 'bg-teal';
  if (s >= 60) return 'bg-amber';
  return 'bg-red';
}
function scoreLabel(s) {
  if (s >= 90) return '🌟 نجم';
  if (s >= 75) return '✨ متميز';
  if (s >= 60) return '👍 مقبول';
  return '⚠️ ضعيف';
}

// ── KPI Entry Modal (for managers to enter data) ────────────────
function KpiEntryModal({ employee, month, year, existing, onSave, onClose }) {
  const [form, setForm] = useState({
    sales:        existing?.sales_score ?? '',
    sales_target: existing?.sales_target ?? '',
    visits:       existing?.visits_score ?? '',
    new_clients:  existing?.new_clients ?? '',
    retention:    existing?.retention_score ?? '',
    collection:   existing?.collection_pct ?? '',
    discipline:   existing?.discipline_score ?? '',
    level:        existing?.level ?? 'junior',
    notes:        existing?.notes ?? '',
  });
  const [saving,        setSaving]        = useState(false);
  const [autoDisc,      setAutoDisc]      = useState(null);
  const [autoSales,     setAutoSales]     = useState(null);

  // Auto-fetch attendance-based discipline score + sales from DB
  useEffect(() => {
    if (!employee?.id || existing?.discipline_score) return;
    const from = `${year}-${String(month).padStart(2,'0')}-01`;
    const to   = new Date(year, month, 0).toISOString().slice(0,10);
    Promise.allSettled([
      // Attendance days
      supabase.from('attendance').select('date', { count: 'exact', head: true })
        .eq('employee_name', employee.employee_name)
        .gte('date', from).lte('date', to),
      // Sales from daily_reports
      supabase.from('daily_reports').select('total_sales_usd')
        .eq('employee_id', employee.id)
        .gte('report_date', from).lte('report_date', to),
    ]).then(([attRes, salesRes]) => {
      const workDays  = 22;
      const attended  = attRes.value?.count ?? 0;
      const discScore = Math.min(10, Math.round((attended / workDays) * 10));
      setAutoDisc(discScore);
      if (!existing?.discipline_score) {
        setForm(f => ({ ...f, discipline: String(discScore) }));
      }
      const totalSales = (salesRes.value?.data ?? [])
        .reduce((s, r) => s + (Number(r.total_sales_usd) || 0), 0);
      if (totalSales > 0) {
        setAutoSales(Math.round(totalSales));
        if (!existing?.sales_score) {
          setForm(f => ({ ...f, sales: String(Math.round(totalSales)) }));
        }
      }
    }).catch(() => {});
  }, [employee?.id]); // eslint-disable-line react-hooks/exhaustive-deps


  const totalScore = useMemo(() => calcTotalScore({
    sales: Number(form.sales), sales_target: Number(form.sales_target),
    visits: Number(form.visits), new_clients: Number(form.new_clients),
    retention: Number(form.retention), collection: Number(form.collection),
    discipline: Number(form.discipline),
  }), [form]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ ...form, total_score: totalScore });
    } finally { setSaving(false); }
  };

  const INP = 'w-full border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text focus:border-teal focus:outline-none transition';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between bg-gradient-to-r from-teal/10 to-transparent">
          <div>
            <h3 className="font-bold text-base text-text">إدخال بيانات KPI</h3>
            <p className="text-xs text-muted mt-0.5">{employee?.employee_name} — {MONTHS_AR[month-1]} {year}</p>
          </div>
          <div className={`text-2xl font-extrabold tabular-nums ${scoreColor(totalScore)}`}>{totalScore}</div>
        </div>

        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* Level */}
          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">المستوى الوظيفي</label>
            <select value={form.level} onChange={e => setForm(f => ({...f, level: e.target.value}))} className={INP}>
              {Object.entries(LEVELS).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
          </div>

          {/* Sales */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">
                💵 المبيعات الفعلية ($)
                {autoSales > 0 && <span className="ms-1 text-[10px] text-teal font-normal">⚡ تلقائي من التقارير</span>}
              </label>
              <input type="number" value={form.sales} onChange={e => setForm(f=>({...f,sales:e.target.value}))} className={INP} placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-bold text-muted block mb-1.5">🎯 هدف المبيعات ($)</label>
              <input type="number" value={form.sales_target} onChange={e => setForm(f=>({...f,sales_target:e.target.value}))} className={INP} placeholder="0" />
            </div>
          </div>

          {/* Other KPIs */}
          {[
            { key: 'visits',      label: '🚶 الزيارات اليومية (متوسط)', placeholder: '15', auto: null },
            { key: 'new_clients', label: '🆕 عملاء جدد هذا الشهر',     placeholder: '4',  auto: null },
            { key: 'retention',   label: '🔄 نسبة إعادة الطلب (%)',    placeholder: '70', auto: null },
            { key: 'collection',  label: '💳 نسبة التحصيل (%)',        placeholder: '95', auto: null },
            { key: 'discipline',  label: '📋 نقطة الانضباط (من 10)',   placeholder: '8',  auto: autoDisc },
          ].map(({ key, label, placeholder, auto }) => (
            <div key={key}>
              <label className="text-xs font-bold text-muted block mb-1.5">
                {label}
                {auto !== null && <span className="ms-1 text-[10px] text-teal font-normal">⚡ تلقائي من الحضور ({auto}/10)</span>}
              </label>
              <input type="number" value={form[key]} onChange={e => setForm(f=>({...f,[key]:e.target.value}))} className={INP} placeholder={placeholder} />
            </div>
          ))}

          <div>
            <label className="text-xs font-bold text-muted block mb-1.5">📝 ملاحظات</label>
            <input type="text" value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} className={INP} placeholder="اختياري" />
          </div>

          {/* Score preview */}
          <div className={`rounded-xl p-3 flex items-center justify-between ${scoreBg(totalScore)}/10 border border-current/20`}>
            <span className={`text-sm font-bold ${scoreColor(totalScore)}`}>النتيجة الإجمالية</span>
            <span className={`text-2xl font-extrabold tabular-nums ${scoreColor(totalScore)}`}>{totalScore}/100 {scoreLabel(totalScore)}</span>
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border/40">
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-teal text-navy text-sm font-bold hover:bg-teal/90 disabled:opacity-50 transition">
            {saving ? '…جاري الحفظ' : '✓ حفظ البيانات'}
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition">إلغاء</button>
        </div>
      </div>
    </div>
  );
}

// ── KPI Card per employee ───────────────────────────────────────
function EmployeeKpiCard({ emp, kpi, isAdmin, onEdit }) {
  const level = LEVELS[kpi?.level ?? 'junior'];
  const total = kpi?.total_score ?? 0;
  const salesPct = kpi?.sales_target > 0 ? Math.round((kpi.sales_score / kpi.sales_target) * 100) : 0;
  const volBonus = calcVolumeBonus(kpi?.level ?? 'junior', salesPct);
  const commissionPct = level.base_commission + volBonus;
  const commissionUsd = kpi?.sales_score ? ((kpi.sales_score * commissionPct) / 100).toFixed(2) : '—';

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between ${total >= 75 ? 'bg-green-bg/30' : total >= 60 ? 'bg-amber-bg/30' : total > 0 ? 'bg-red-bg/30' : 'bg-surface-alt'}`}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-teal/20 text-teal flex items-center justify-center font-extrabold text-sm">
            {emp.employee_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="text-sm font-bold text-text">{emp.employee_name}</p>
            <p className="text-[10px] text-muted">{level.icon} {level.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && (
            <div className={`text-xl font-extrabold tabular-nums ${scoreColor(total)}`}>{total}</div>
          )}
          {isAdmin && (
            <button onClick={() => onEdit(emp, kpi)} className="text-xs px-2.5 py-1.5 rounded-lg bg-teal/10 text-teal hover:bg-teal/20 transition font-bold">
              ✏️
            </button>
          )}
        </div>
      </div>

      {/* KPI bars */}
      {kpi ? (
        <div className="p-4 space-y-2.5">
          {KPI_WEIGHTS.map(({ key, label, weight, min_target, unit, icon }) => {
            let val = 0, display = '—';
            if (key === 'sales') {
              val = kpi.sales_target > 0 ? Math.min(100, (kpi.sales_score / kpi.sales_target) * 100) : 0;
              display = kpi.sales_score ? `$${Number(kpi.sales_score).toLocaleString('en-US')}` : '—';
            } else {
              const raw = kpi[key === 'visits' ? 'visits_score' : key === 'new_clients' ? 'new_clients' : key === 'retention' ? 'retention_score' : key === 'collection' ? 'collection_pct' : 'discipline_score'] ?? 0;
              display = raw ? `${raw}${unit}` : '—';
              val = min_target ? Math.min(100, (raw / min_target) * 100) : Math.min(100, raw * 10);
            }
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted">{icon} {label} <span className="text-muted/60">({weight}%)</span></span>
                  <span className="text-[11px] font-bold text-text tabular-nums">{display}</span>
                </div>
                <div className="h-1.5 bg-surface-alt rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${val >= 100 ? 'bg-green' : val >= 75 ? 'bg-teal' : val >= 50 ? 'bg-amber' : 'bg-red'}`}
                    style={{ width: `${Math.min(100,val)}%` }} />
                </div>
              </div>
            );
          })}

          {/* Commission */}
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
            <span className="text-xs font-bold text-muted">💰 العمولة المحتملة</span>
            <span className="text-sm font-extrabold text-teal tabular-nums">${commissionUsd} <span className="text-[10px] text-muted font-normal">({commissionPct}%)</span></span>
          </div>
        </div>
      ) : (
        <div className="px-4 py-6 text-center">
          <p className="text-2xl mb-2">📊</p>
          <p className="text-xs text-muted">لم تُدخَل بيانات هذا الشهر</p>
          {isAdmin && (
            <button onClick={() => onEdit(emp, null)} className="mt-2 text-xs text-teal hover:underline font-semibold">+ إدخال البيانات</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── My Own KPI Card (employee view) ────────────────────────────
function MyKpiView({ kpi, month, year, userId }) {
  const level = LEVELS[kpi?.level ?? 'junior'];
  const total = kpi?.total_score ?? 0;
  const salesPct = kpi?.sales_target > 0 ? Math.round((kpi.sales_score / kpi.sales_target) * 100) : 0;
  const volBonus = calcVolumeBonus(kpi?.level ?? 'junior', salesPct);
  const commissionPct = level.base_commission + volBonus;
  const commissionUsd = kpi?.sales_score ? ((kpi.sales_score * commissionPct) / 100).toFixed(2) : null;

  // Auto-commission estimate when no KPI record yet
  const [estSales,  setEstSales]  = useState(null);
  const [estLoading, setEstLoading] = useState(false);

  const calcEstimate = async () => {
    setEstLoading(true);
    try {
      const from = `${year}-${String(month).padStart(2,'0')}-01`;
      const to   = new Date(year, month, 0).toISOString().slice(0,10);
      const { data } = await supabase.from('daily_reports')
        .select('total_sales_usd').eq('employee_id', userId)
        .gte('report_date', from).lte('report_date', to);
      const total = (data ?? []).reduce((s,r) => s + (Number(r.total_sales_usd)||0), 0);
      setEstSales(Math.round(total));
    } catch {}
    finally { setEstLoading(false); }
  };

  if (!kpi) return (
    <div className="bg-surface border border-border rounded-2xl p-6 text-center space-y-3">
      <p className="text-4xl">📊</p>
      <p className="text-base font-bold text-text">لم تُحدَّد بياناتك لهذا الشهر</p>
      <p className="text-xs text-muted">سيقوم المدير بإدخال بيانات KPI الخاصة بك قريباً</p>
      {estSales === null ? (
        <button onClick={calcEstimate} disabled={estLoading}
          className="mx-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-teal/10 text-teal text-sm font-bold hover:bg-teal/20 transition disabled:opacity-50">
          {estLoading ? '…جاري الحساب' : '💰 احسب عمولتي التقديرية'}
        </button>
      ) : (
        <div className="bg-teal/10 rounded-2xl p-4 space-y-1">
          <p className="text-xs text-muted">مبيعاتك المسجلة هذا الشهر</p>
          <p className="text-2xl font-extrabold text-teal tabular-nums">${estSales.toLocaleString('en-US')}</p>
          <p className="text-xs text-muted mt-1">
            عمولة مبدئية (~{LEVELS.junior.base_commission}%):
            <span className="font-bold text-text ms-1">${((estSales * LEVELS.junior.base_commission) / 100).toFixed(2)}</span>
          </p>
          <p className="text-[10px] text-muted/70">* تقديرية — النهائية بعد تأكيد المدير</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Hero score */}
      <div className={`bg-navy rounded-3xl p-6 text-white shadow-xl relative overflow-hidden`}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-8 -end-8 w-40 h-40 rounded-full bg-white" />
        </div>
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white/70 text-xs font-medium">{MONTHS_AR[month-1]} {year}</p>
              <p className="text-white font-bold text-sm mt-0.5">{level.icon} {level.label}</p>
            </div>
            <div className="text-right">
              <div className={`text-5xl font-extrabold tabular-nums`}>{total}</div>
              <div className="text-white/70 text-xs mt-0.5">/ 100 نقطة — {scoreLabel(total)}</div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full h-3 rounded-full bg-white/20 overflow-hidden">
            <div className="h-full rounded-full bg-white transition-all duration-700" style={{width:`${total}%`}} />
          </div>
          {commissionUsd && (
            <div className="mt-4 px-4 py-2.5 bg-white/10 rounded-xl flex items-center justify-between">
              <span className="text-white/80 text-sm">💰 عمولتك المحتملة</span>
              <span className="text-white font-extrabold text-lg tabular-nums">${commissionUsd}</span>
            </div>
          )}
        </div>
      </div>

      {/* KPI breakdown */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40">
          <p className="text-sm font-bold text-text">تفصيل مؤشرات الأداء</p>
        </div>
        <div className="p-4 space-y-4">
          {KPI_WEIGHTS.map(({ key, label, weight, min_target, unit, icon }) => {
            let pct = 0, display = '—', rawVal = 0;
            if (key === 'sales') {
              rawVal = kpi.sales_score ?? 0;
              pct = kpi.sales_target > 0 ? Math.min(150, (rawVal / kpi.sales_target) * 100) : 0;
              display = rawVal ? `$${Number(rawVal).toLocaleString('en-US')} / $${Number(kpi.sales_target).toLocaleString('en-US')}` : '—';
            } else {
              const colMap = { visits:'visits_score', new_clients:'new_clients', retention:'retention_score', collection:'collection_pct', discipline:'discipline_score' };
              rawVal = kpi[colMap[key]] ?? 0;
              display = rawVal ? `${rawVal}${unit}` : '—';
              pct = min_target ? Math.min(100, (rawVal / min_target) * 100) : rawVal * 10;
            }
            const pts = Math.round((Math.min(100, pct) / 100) * weight);
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{icon}</span>
                    <div>
                      <p className="text-xs font-bold text-text">{label}</p>
                      <p className="text-[10px] text-muted">الوزن: {weight}% · {display}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-extrabold tabular-nums ${pts >= weight * 0.9 ? 'text-green-fg' : pts >= weight * 0.7 ? 'text-amber-fg' : 'text-red-fg'}`}>
                    {pts}/{weight}
                  </span>
                </div>
                <div className="h-2 bg-surface-alt rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${pct >= 100 ? 'bg-green' : pct >= 75 ? 'bg-teal' : pct >= 50 ? 'bg-amber' : 'bg-red'}`}
                    style={{width:`${Math.min(100,pct)}%`}} />
                </div>
                {min_target && <p className="text-[10px] text-muted/70 mt-0.5">الهدف الأدنى: {min_target}{unit}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Commission breakdown */}
      <div className="bg-surface border border-border rounded-2xl p-4">
        <p className="text-sm font-bold text-text mb-3">💰 تفصيل العمولة</p>
        <div className="space-y-2">
          {[
            { label: `عمولة أساسية (${level.label})`, value: `${level.base_commission}%` },
            { label: `بونص حجم المبيعات (${salesPct}% تحقيق)`, value: volBonus > 0 ? `+${volBonus}%` : '—' },
            { label: 'إجمالي نسبة العمولة', value: `${commissionPct}%`, bold: true },
            { label: 'المبيعات الكلية', value: kpi.sales_score ? `$${Number(kpi.sales_score).toLocaleString('en-US')}` : '—' },
            { label: 'العمولة المحتملة', value: commissionUsd ? `$${commissionUsd}` : '—', bold: true, highlight: true },
          ].map(({ label, value, bold, highlight }) => (
            <div key={label} className={`flex items-center justify-between py-1.5 ${bold ? 'border-t border-border/40 mt-1 pt-2.5' : ''}`}>
              <span className={`text-xs ${bold ? 'font-bold text-text' : 'text-muted'}`}>{label}</span>
              <span className={`text-sm tabular-nums ${highlight ? 'text-teal font-extrabold' : bold ? 'font-bold text-text' : 'text-text'}`}>{value}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 p-3 bg-surface-alt rounded-xl text-[11px] text-muted leading-relaxed">
          ⚠️ العمولة نهائية بعد الموافقة الإدارية وتأكيد نسبة التحصيل
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// Main PerformanceScreen
// ══════════════════════════════════════════════════════════════════
export default function PerformanceScreen() {
  const { id: userId, name, role } = useAuth();
  const isAdmin = [ROLES.ADMIN, ROLES.MANAGER, ROLES.SALES_MANAGER].includes(role);

  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [employees, setEmployees] = useState([]);
  const [kpiMap,    setKpiMap]    = useState({}); // { employee_id: kpiRow }
  const [myKpi,     setMyKpi]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [editModal, setEditModal] = useState(null); // { emp, kpi }

  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: `${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}` });
    }
    return opts;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const [{ data: emps }, { data: kpis }] = await Promise.all([
          supabase.from('profiles').select('id,employee_name,role,team').eq('is_active', true).order('employee_name'),
          supabase.from('employee_kpis').select('*').eq('year', year).eq('month', month),
        ]);
        setEmployees(emps ?? []);
        const map = {};
        (kpis ?? []).forEach(k => { map[k.employee_id] = k; });
        setKpiMap(map);
      } else {
        const { data: kpi } = await supabase.from('employee_kpis').select('*')
          .eq('employee_id', userId).eq('year', year).eq('month', month).maybeSingle();
        setMyKpi(kpi);
      }
    } catch {}
    finally { setLoading(false); }
  }, [isAdmin, userId, year, month]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (emp, formData) => {
    const payload = {
      employee_id:       emp.id,
      year, month,
      level:             formData.level,
      sales_score:       Number(formData.sales) || 0,
      sales_target:      Number(formData.sales_target) || 0,
      visits_score:      Number(formData.visits) || 0,
      new_clients:       Number(formData.new_clients) || 0,
      retention_score:   Number(formData.retention) || 0,
      collection_pct:    Number(formData.collection) || 0,
      discipline_score:  Number(formData.discipline) || 0,
      total_score:       formData.total_score,
      notes:             formData.notes || null,
      updated_at:        new Date().toISOString(),
    };

    const existing = kpiMap[emp.id];
    if (existing?.id) {
      await supabase.from('employee_kpis').update(payload).eq('id', existing.id);
    } else {
      const { data } = await supabase.from('employee_kpis').insert(payload).select().single();
      if (data) payload.id = data.id;
    }

    setKpiMap(m => ({ ...m, [emp.id]: { ...existing, ...payload } }));
    setEditModal(null);
  };

  // Summary stats for admin
  const summary = useMemo(() => {
    if (!isAdmin) return null;
    const kpis = Object.values(kpiMap);
    if (!kpis.length) return null;
    const avg = Math.round(kpis.reduce((s,k) => s + (k.total_score??0), 0) / kpis.length);
    const stars    = kpis.filter(k => (k.total_score??0) >= 90).length;
    const weak     = kpis.filter(k => (k.total_score??0) < 60 && k.total_score > 0).length;
    const totalComm = kpis.reduce((s,k) => {
      const lvl = LEVELS[k.level ?? 'junior'];
      const sp = k.sales_target > 0 ? Math.round((k.sales_score/k.sales_target)*100) : 0;
      const pct = lvl.base_commission + calcVolumeBonus(k.level ?? 'junior', sp);
      return s + ((k.sales_score ?? 0) * pct / 100);
    }, 0);
    return { avg, stars, weak, totalComm: totalComm.toFixed(0), entered: kpis.length };
  }, [kpiMap, isAdmin]);

  return (
    <div className="space-y-5 pb-24 sm:pb-8" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-text">نظام KPI والعمولات</h1>
          <p className="text-sm text-muted mt-0.5">مؤشرات الأداء الشهرية · SALES_RULES.md</p>
        </div>
        <select
          value={`${year}-${month}`}
          onChange={e => { const [y,m] = e.target.value.split('-'); setYear(+y); setMonth(+m); }}
          className="border border-border rounded-xl px-3 py-2 text-sm bg-surface text-text focus:border-teal focus:outline-none"
        >
          {monthOptions.map(o => (
            <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-48 bg-surface-alt animate-pulse rounded-2xl" />)}
        </div>
      ) : isAdmin ? (
        <>
          {/* Summary KPIs */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'متوسط النتيجة',   value: summary.avg + '/100', icon: '📊', color: scoreColor(summary.avg) },
                { label: '⭐ نجوم الشهر',   value: summary.stars,       icon: '🌟', color: 'text-amber-fg' },
                { label: '⚠️ يحتاج متابعة', value: summary.weak,        icon: '📢', color: 'text-red-fg' },
                { label: 'عمولات الشهر',    value: `$${Number(summary.totalComm).toLocaleString('en-US')}`, icon: '💰', color: 'text-teal' },
              ].map(s => (
                <div key={s.label} className="bg-surface border border-border rounded-2xl p-4">
                  <div className="text-2xl mb-2">{s.icon}</div>
                  <div className={`text-xl font-extrabold tabular-nums ${s.color}`}>{s.value}</div>
                  <div className="text-[11px] text-muted mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* KPI Weights reminder */}
          <div className="bg-surface-alt border border-border/50 rounded-2xl px-4 py-3">
            <p className="text-[11px] font-bold text-muted mb-2">أوزان KPI (100 نقطة)</p>
            <div className="flex flex-wrap gap-2">
              {KPI_WEIGHTS.map(k => (
                <span key={k.key} className="text-[10px] px-2 py-1 rounded-lg bg-surface border border-border text-muted">
                  {k.icon} {k.label} <strong className="text-text">{k.weight}%</strong>
                </span>
              ))}
            </div>
          </div>

          {/* Employee cards */}
          {employees.length === 0 ? (
            <div className="text-center py-12 text-muted">لا يوجد موظفون</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {employees.map(emp => (
                <EmployeeKpiCard
                  key={emp.id}
                  emp={emp}
                  kpi={kpiMap[emp.id] ?? null}
                  isAdmin={isAdmin}
                  onEdit={(e, k) => setEditModal({ emp: e, kpi: k })}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <MyKpiView kpi={myKpi} month={month} year={year} userId={userId} />
      )}

      {/* Edit Modal */}
      {editModal && (
        <KpiEntryModal
          employee={editModal.emp}
          month={month}
          year={year}
          existing={editModal.kpi}
          onSave={form => handleSave(editModal.emp, form)}
          onClose={() => setEditModal(null)}
        />
      )}
    </div>
  );
}
