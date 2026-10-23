// Pure salary-source resolution (no Supabase) so it can be regression-tested in Node.

// One settings row per employee: ignore inactive rows (they carry old
// allowances that must not come back when the run is re-computed) and, when
// several active rows exist, take the latest effective_from deterministically.
export function pickSalarySettings(rows = []) {
  const byEmployee = new Map();
  for (const row of rows || []) {
    if (!row || row.is_active === false) continue;
    const current = byEmployee.get(row.employee_id);
    if (!current || String(row.effective_from || '') > String(current.effective_from || '')) {
      byEmployee.set(row.employee_id, row);
    }
  }
  return byEmployee;
}

// employee_salary_settings (preferred, native currency) → profiles.*_usd fallback → no source.
export function resolveSalary(emp, settings) {
  if (settings && (Number(settings.base_salary) || 0) > 0) {
    return {
      source: 'employee_salary_settings',
      currency: settings.currency || 'USD',
      rawBase: Number(settings.base_salary) || 0,
      rawAllowances: (Number(settings.internet_allowance) || 0) + (Number(settings.food_allowance) || 0),
      commissionPctFallback: Number(settings.sales_commission_pct) || 0,
    };
  }
  const rawBase = Number(emp?.base_salary_usd) || 0;
  if (rawBase > 0) {
    return {
      source: 'profiles',
      currency: 'USD',
      rawBase,
      rawAllowances: (Number(emp.housing_allowance_usd) || 0) + (Number(emp.transport_allowance_usd) || 0),
      commissionPctFallback: Number(emp.commission_pct) || 0,
    };
  }
  return { source: null, currency: 'USD', rawBase: 0, rawAllowances: 0, commissionPctFallback: 0 };
}

// Human-readable origin of base salary and allowances, stored in the entry notes.
export function describeSalarySource(salary, allowancesUsd) {
  if (salary.source === null) return '⚠️ لا مصدر راتب (لا إعدادات رواتب ولا راتب في ملف الموظف)';
  const origin = salary.source === 'employee_salary_settings' ? 'إعدادات الرواتب' : 'ملف الموظف';
  const allowanceText = allowancesUsd > 0 ? `بدلات $${Number(allowancesUsd).toFixed(2)}` : 'بلا بدلات';
  return `🧾 مصدر الراتب: ${origin} · ${allowanceText}`;
}
