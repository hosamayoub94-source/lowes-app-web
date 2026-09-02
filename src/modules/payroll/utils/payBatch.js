// =============================================================
// Pay Batch helpers — "دفعة الرواتب" (أونلاين / مكتب + نصف الراتب)
// =============================================================
// ⚠️ طبقة عرض/تصنيف بحتة فوق الحسبة الموجودة. لا تلمس ولا تُعيد حساب
// الراتب المستحق بأي شكل — تقرأ فقط calcNetSalary() الجاهزة وتُطبّق
// عليها نسبة الدفع (100% أو 50%) للعرض والتجميع. لا تغيّر عمولات ولا
// تارجت ولا خصومات ولا مسميات ولا أقسام الموظفين.
import { calcNetSalary } from '../types/payroll.types.js';

const OFFICE_KEY = 'lowes_payroll_office_employee_ids';
const HALF_KEY_PREFIX = 'lowes_payroll_half_salary_run_';

// ── تصنيف "مكتب" — قائمة يدوية عامة (لا ترتبط بشهر معيّن، تُحدَّد مرة
//    وتبقى حتى تُعدَّل يدوياً). لا تغيّر القسم/المسمى الوظيفي الفعلي —
//    مجرد وسم لطريقة عرض دفعة الرواتب.
export function loadOfficeIds() {
  try {
    const raw = localStorage.getItem(OFFICE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function saveOfficeIds(idsSet) {
  try {
    localStorage.setItem(OFFICE_KEY, JSON.stringify([...idsSet]));
  } catch { /* ignore quota/private-mode errors */ }
}

// ── تحديد "نصف الراتب" — مستقل لكل شهر (مفتاح مربوط بمعرّف الدورة).
export function loadHalfSalaryIds(runId) {
  try {
    const raw = localStorage.getItem(HALF_KEY_PREFIX + runId);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function saveHalfSalaryIds(runId, idsSet) {
  try {
    localStorage.setItem(HALF_KEY_PREFIX + runId, JSON.stringify([...idsSet]));
  } catch { /* ignore quota/private-mode errors */ }
}

/**
 * المبلغ المدفوع لموظف واحد: كامل الراتب المستحق، أو نصفه فقط إن حُدِّد
 * ضمن "نصف الراتب". لا يُغيّر الراتب المستحق نفسه (due) بأي حال.
 */
export function calcPaidAmount(dueAmount, isHalf) {
  return isHalf ? dueAmount / 2 : dueAmount;
}

/**
 * يبني ملخص دفعة الرواتب مجمّعاً حسب المجموعة (أونلاين/مكتب) وحسب
 * العملة داخل كل مجموعة (بعض الموظفين بالتركي ₺ وبعضهم بالدولار $).
 * كل رقم "مستحق" هنا هو calcNetSalary() الأصلي كما هو — لا تعديل عليه.
 */
export function buildPayBatchSummary(entries, officeIds, halfIds) {
  const groups = {
    online: { key: 'online', label: 'الأونلاين', count: 0, byCurrency: {} },
    office: { key: 'office', label: 'المكتب',    count: 0, byCurrency: {} },
  };

  for (const e of entries) {
    const groupKey = officeIds.has(e.employee_id) ? 'office' : 'online';
    const currency = e.currency || 'USD';
    const due = calcNetSalary(e);
    const isHalf = halfIds.has(e.employee_id);
    const paid = calcPaidAmount(due, isHalf);
    const remaining = due - paid;

    const g = groups[groupKey];
    g.count += 1;
    if (!g.byCurrency[currency]) {
      g.byCurrency[currency] = { due: 0, paid: 0, remaining: 0 };
    }
    g.byCurrency[currency].due += due;
    g.byCurrency[currency].paid += paid;
    g.byCurrency[currency].remaining += remaining;
  }

  // إجمالي عام (كل المجموعات) لكل عملة
  const grandByCurrency = {};
  for (const g of Object.values(groups)) {
    for (const [cur, v] of Object.entries(g.byCurrency)) {
      if (!grandByCurrency[cur]) grandByCurrency[cur] = { due: 0, paid: 0, remaining: 0 };
      grandByCurrency[cur].due += v.due;
      grandByCurrency[cur].paid += v.paid;
      grandByCurrency[cur].remaining += v.remaining;
    }
  }

  return { groups, grandByCurrency, grandCount: entries.length };
}
