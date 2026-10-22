// Pure absence-candidate logic for the HR absence review panel. Kept free of
// Supabase/React so the exclusion rules can be regression-tested in Node.
//
// A day is a candidate absence only when ALL of these hold:
//   • it is inside the selected month, not a Sunday (weekly rule), not in the future
//   • the employee had started (join_date) and had not left (resigned_at)
//   • no attendance row marks presence, leave, or a holiday/weekly off
//   • it is not inside an APPROVED leave request
//   • it is not an official holiday
//   • the employee is not payroll_excluded and not an admin (admins are not
//     required to check in — owner decision 22/10/2026)

export function monthBounds(month) {
  const [year, mon] = String(month).split('-').map(Number);
  const last = new Date(year, mon, 0).getDate();
  return { year, mon, last, from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function workingDates(month) {
  const { year, mon, last } = monthBounds(month);
  const out = [];
  for (let d = 1; d <= last; d += 1) {
    if (new Date(year, mon - 1, d).getDay() === 0) continue; // الأحد عطلة أسبوعية
    out.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  return out;
}

const normDate = (value) => String(value || '').slice(0, 10).replaceAll('/', '-');

const PRESENT_RE = /حاضر|خروج|متأخر|present|late/i;
const EXCUSED_RE = /إجازة|اجازة|عطلة|leave|off|holiday/i;

export function buildAbsenceCandidates({
  month,
  today,
  profiles = [],
  attendance = [],
  approvedLeaves = [],
  holidays = [],
}) {
  const { from, to } = monthBounds(month);
  const todayStr = normDate(today);
  const holidaySet = new Set(holidays.map(normDate));

  const present = new Set();
  const excused = new Set();
  for (const row of attendance) {
    const key = `${row.employee_name}::${normDate(row.date)}`;
    const status = String(row.status || '');
    if (PRESENT_RE.test(status)) present.add(key);
    if (EXCUSED_RE.test(status)) excused.add(key);
  }

  // Approved leave ranges, matched by id when present, else by name.
  const leavesFor = (employee) => approvedLeaves.filter((leave) => (
    (leave.employee_id && leave.employee_id === employee.id)
    || (!leave.employee_id && leave.employee_name === employee.employee_name)
  ));

  const candidates = [];
  for (const employee of profiles) {
    if (employee.payroll_excluded) continue;
    if (employee.role_type === 'admin') continue;
    const joinDate = normDate(employee.join_date);
    const resignedAt = normDate(employee.resigned_at);
    if (resignedAt && resignedAt < from) continue;
    if (joinDate && joinDate > to) continue;
    const leaves = leavesFor(employee).map((leave) => ({
      start: normDate(leave.start_date),
      end: normDate(leave.end_date || leave.start_date),
    }));

    for (const date of workingDates(month)) {
      if (todayStr && date > todayStr) continue;          // يوم مستقبلي
      if (joinDate && date < joinDate) continue;           // قبل المباشرة
      if (resignedAt && date > resignedAt) continue;       // بعد الاستقالة
      if (holidaySet.has(date)) continue;                  // عطلة رسمية
      const key = `${employee.employee_name}::${date}`;
      if (present.has(key) || excused.has(key)) continue;  // حضور/إجازة/عطلة مسجّلة
      if (leaves.some((leave) => date >= leave.start && date <= leave.end)) continue; // إجازة معتمدة
      candidates.push({ ...employee, absence_date: date });
    }
  }
  return candidates;
}

// Only an explicit approval deducts. pending / rejected / no decision never do.
export function isDeductibleReview(review) {
  return review?.status === 'approved';
}
