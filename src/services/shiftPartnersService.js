// =============================================================
// shiftPartnersService — شركاء الدوام + الورديات + العطلة الأسبوعية
//
// يعتمد كلياً على البنية الحالية:
//   • profiles.rest_day        → يوم العطلة الأسبوعية المثبّت (نص عربي)
//   • profiles.employee_name   → مُعرِّف الموظف بجدول attendance
//   • attendance.delay_minutes / was_late → نظام التأخير الحالي
//   • shift_groups (جديد)      → مجموعة الشركاء + تاريخ سريانها
//
// المجموعة تحدّد نظام الورديات حسب عدد أعضائها:
//   عضوان  → صباحي 10:00–16:00 · استراحة 16:00–17:00 · مسائي 17:00–23:00
//   ثلاثة  → صباحي 10:00–15:00 · ظهر 15:00–20:00 · مسائي 20:00–01:00 (بلا استراحة)
//   غير ذلك → لا نظام ورديات (يبقى سلوك النظام الحالي كما هو)
// =============================================================
import { supabase } from '@services/supabase';

// ── العطلة الأسبوعية ──────────────────────────────────────────
/** اسم اليوم العربي (كما يخزَّن بـprofiles.rest_day) → رقم اليوم (0=الأحد) */
export const REST_DAY_INDEX = {
  'الأحد': 0, 'الاثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3,
  'الخميس': 4, 'الجمعة': 5, 'السبت': 6,
};

/**
 * هل هذا التاريخ هو يوم العطلة الأسبوعية المثبّت للموظف؟
 * يعيد false لو ما في يوم عطلة محدَّد ببياناته.
 * @param {string|null|undefined} restDay — profiles.rest_day
 * @param {Date|string} date — Date أو "YYYY-MM-DD"
 */
export function isWeeklyOffDay(restDay, date) {
  if (!restDay) return false;
  const idx = REST_DAY_INDEX[String(restDay).trim()];
  if (idx === undefined) return false;
  const d = date instanceof Date
    ? date
    : new Date(`${String(date).replace(/\//g, '-')}T00:00:00`);
  if (isNaN(d)) return false;
  return d.getDay() === idx;
}

// ── نظام الورديات حسب عدد الشركاء ─────────────────────────────
/**
 * سماحية داخلية بعد بداية الوردية — قاعدة حساب فقط، لا تُعرض للموظف.
 * بوّابة لا خصم: ضمنها = صفر تأخير، وبعدها = التأخير كاملاً من بداية الوردية.
 */
export const LATE_GRACE_MINUTES = 10;

/** نافذة الوصول المبكر: تسجيل قبل بداية وردية بهذا القدر يُنسب لها. */
const EARLY_ARRIVAL_WINDOW = 45;

export const SHIFT_PLANS = {
  2: {
    size: 2,
    label: 'مجموعة من شخصين',
    span: { start: '10:00', end: '23:00' },
    breakWindow: { start: '16:00', end: '17:00' },
    shifts: [
      { key: 'morning', label: 'الوردية الصباحية', start: '10:00', end: '16:00' },
      { key: 'evening', label: 'الوردية المسائية', start: '17:00', end: '23:00' },
    ],
  },
  3: {
    size: 3,
    label: 'مجموعة من ثلاثة',
    span: { start: '10:00', end: '01:00' },
    breakWindow: null,
    shifts: [
      { key: 'morning', label: 'الوردية الصباحية', start: '10:00', end: '15:00' },
      { key: 'noon',    label: 'وردية الظهر',      start: '15:00', end: '20:00' },
      { key: 'evening', label: 'الوردية المسائية', start: '20:00', end: '01:00' },
    ],
  },
};

/** خطة الورديات لمجموعة بعدد أعضاء معيّن — null لو العدد غير مدعوم. */
export function shiftPlanForSize(size) {
  return SHIFT_PLANS[Number(size)] ?? null;
}

/** خطة الورديات لمجموعة. */
export function shiftPlanForGroup(group) {
  if (!group?.members?.length) return null;
  return shiftPlanForSize(group.members.length);
}

/** الوردية المطابقة لمفتاح مخزَّن (shift_key) داخل خطة. */
export function shiftByKey(plan, key) {
  if (!plan || !key) return null;
  return plan.shifts.find(s => s.key === key) ?? null;
}

// ── أدوات وقت ─────────────────────────────────────────────────
/** "HH:MM" → دقائق من منتصف الليل */
export function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/** فرق دائري بالدقائق (a - b) ضمن [-720, 720) — يتعامل مع منتصف الليل */
function circularDiff(a, b) {
  let d = (a - b) % 1440;
  if (d >= 720) d -= 1440;
  if (d < -720) d += 1440;
  return d;
}

/** هل الوقت داخل نافذة الوردية؟ يدعم الورديات العابرة لمنتصف الليل. */
function inWindow(mins, startM, endM) {
  if (endM <= startM) return mins >= startM || mins < endM; // 20:00 → 01:00
  return mins >= startM && mins < endM;
}

// ── تحديد الوردية من وقت التسجيل الفعلي ───────────────────────
/**
 * يحدّد وردية الموظف من: خطة المجموعة + وقت تسجيل الدخول الفعلي.
 * الترتيب: وصول مبكر لوردية على وشك البدء ← الوردية التي يقع الوقت داخلها
 *          ← أقرب وردية زمنياً (دائرياً).
 * @param {object|null} plan — من shiftPlanForGroup
 * @param {string} checkInHHMM — "HH:MM"
 * @returns {object|null} shift
 */
export function resolveShift(plan, checkInHHMM) {
  if (!plan?.shifts?.length) return null;
  const t = toMinutes(checkInHHMM);
  if (t === null) return null;

  // 1) وصول مبكر — وردية تبدأ خلال النافذة القريبة
  let early = null;
  for (const s of plan.shifts) {
    const d = circularDiff(toMinutes(s.start), t); // موجب = الوردية لسّه ما بدأت
    if (d > 0 && d <= EARLY_ARRIVAL_WINDOW && (!early || d < early.d)) early = { s, d };
  }
  if (early) return early.s;

  // 2) الوقت داخل نافذة وردية
  for (const s of plan.shifts) {
    if (inWindow(t, toMinutes(s.start), toMinutes(s.end))) return s;
  }

  // 3) أقرب وردية دائرياً
  let best = null;
  for (const s of plan.shifts) {
    const dist = Math.abs(circularDiff(t, toMinutes(s.start)));
    if (!best || dist < best.dist) best = { s, dist };
  }
  return best?.s ?? null;
}

/**
 * دقائق التأخير من بداية الوردية الرسمية.
 *
 * السماحية بوّابة فقط (قرار حسام، 22 آب 2026):
 *   • التسجيل ضمن أول 10 دقائق → صفر تأخير إطلاقاً.
 *   • بعد تجاوزها → يُحتسب التأخير كاملاً من بداية الوردية،
 *     أي دخول 10:15 على وردية 10:00 = 15 دقيقة (لا 5).
 *
 * @param {string} checkInHHMM
 * @param {string} shiftStartHHMM
 * @returns {number} 0 أو أكثر
 */
export function computeDelayMinutes(checkInHHMM, shiftStartHHMM) {
  const t = toMinutes(checkInHHMM);
  const s = toMinutes(shiftStartHHMM);
  if (t === null || s === null) return 0;
  const d = circularDiff(t, s);      // سالب = وصل قبل بداية الوردية
  if (d <= LATE_GRACE_MINUTES) return 0;
  return d;
}

// ── قراءة/كتابة مجموعات الشركاء ───────────────────────────────
const TABLE = 'shift_groups';

/** "YYYY-MM-DD" بالتوقيت المحلي */
export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** التاريخ السابق ليوم ISO */
function prevDayISO(dateISO) {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return todayISO(d);
}

/**
 * كل المجموعات السارية بتاريخ معيّن.
 * يعيد [] بهدوء لو الجدول غير موجود بعد (قبل تطبيق الترحيل).
 */
export async function fetchGroupsAt(dateISO = todayISO()) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .lte('effective_from', dateISO)
      .or(`effective_to.is.null,effective_to.gte.${dateISO}`)
      .order('name');
    if (error) return [];
    return data ?? [];
  } catch { return []; }
}

/** كل نسخ مجموعة (تاريخها) — الأحدث أولاً. */
export async function fetchGroupHistory(groupKey) {
  try {
    const { data, error } = await supabase
      .from(TABLE).select('*')
      .eq('group_key', groupKey)
      .order('effective_from', { ascending: false });
    if (error) return [];
    return data ?? [];
  } catch { return []; }
}

/**
 * مجموعة موظف بتاريخ معيّن — المجموعة السارية بذلك التاريخ تحديداً،
 * فالسجلات القديمة تبقى مرتبطة بمجموعتها وقتها.
 */
export async function fetchGroupForEmployee(employeeName, dateISO = todayISO()) {
  if (!employeeName) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .contains('members', [employeeName])
      .lte('effective_from', dateISO)
      .or(`effective_to.is.null,effective_to.gte.${dateISO}`)
      .limit(1);
    if (error) return null;
    return data?.[0] ?? null;
  } catch { return null; }
}

/**
 * حفظ مجموعة (إنشاء أو تعديل أعضاء).
 * التعديل لا يمسّ السجلات القديمة: يُغلق سطر المجموعة الحالي بتاريخ أمس
 * ويُفتح سطر جديد يسري من تاريخ التغيير فصاعداً.
 *
 * @param {{id?:string, group_key?:string, name:string, members:string[], created_by?:string, current?:object}} group
 * @param {string} [effectiveFrom] — تاريخ سريان التغيير (افتراضي: اليوم)
 */
export async function saveGroup(group, effectiveFrom = todayISO()) {
  const members  = [...new Set((group.members ?? []).filter(Boolean))];
  const groupKey = group.group_key || `grp_${Date.now().toString(36)}`;
  const name     = group.name?.trim() || 'مجموعة دوام';

  // مجموعة جديدة
  if (!group.id) {
    const { data, error } = await supabase.from(TABLE).insert({
      group_key: groupKey, name, members,
      effective_from: effectiveFrom, effective_to: null,
      created_by: group.created_by ?? null,
    }).select().single();
    if (error) throw error;
    return data;
  }

  // تعديل بنفس يوم بدء النسخة الحالية → تعديل مباشر (ما في تاريخ سابق لحفظه)
  if (group.current?.effective_from === effectiveFrom) {
    const { data, error } = await supabase.from(TABLE)
      .update({ members, name })
      .eq('id', group.id).select().single();
    if (error) throw error;
    return data;
  }

  // إغلاق النسخة الحالية بتاريخ أمس ثم فتح نسخة جديدة
  const { error: closeErr } = await supabase.from(TABLE)
    .update({ effective_to: prevDayISO(effectiveFrom) })
    .eq('id', group.id);
  if (closeErr) throw closeErr;

  const { data, error } = await supabase.from(TABLE).insert({
    group_key: groupKey, name, members,
    effective_from: effectiveFrom, effective_to: null,
    created_by: group.created_by ?? null,
  }).select().single();
  if (error) throw error;
  return data;
}

// ── مجموعات مُشتقّة من ملفات الموظفين ─────────────────────────
// مسار مستقل عن جدول shift_groups أعلاه ولا يمسّه: المجموعة هنا
// تتكوّن **تلقائياً** من الشراكة المتبادَلة نفسها (D-0xx، 24 آب 2026 —
// كان التصميم السابق يشترط أيضاً تطابق نص «الصفحة/الرقم» حرفياً بين
// الشريكين، فتبيّن عملياً أنه يفشل حتى مع شراكة مقبولة فعلياً: كل موظف
// يكتب اسم صفحته بصيغته الخاصة (Lowe's professional / Profesyonel /
// Prfesyonel...) فلا يتطابق نصياً رغم كونها غالباً نفس الصفحة. القرار:
// المجموعة = مكوّنات الترابط (connected components) على رسم الشراكات
// المقبولة بجدول shift_partners — الصفحة/الرقم عرض معلوماتي فقط، ليست
// شرط تكوين. يدعم الثلاثي غير المكتمل بكل الأزواج: كفاية شخص محوري
// (hub) اتّفق مع الاثنين الآخرين، حتى لو ما تأكّدا هما مع بعض مباشرة —
// هذا فعلياً كيف تتشكّل أغلب الثلاثيات بالبيانات الحقيقية (لا واجهة
// طلب ثلاثي مباشر بالنظام).

/** الاسم الأول من الاسم الكامل. */
function firstName(fullName) {
  return String(fullName ?? '').trim().split(/\s+/)[0] || String(fullName ?? '').trim();
}

/**
 * يبني مجموعات شركاء الدوام من ملفات الموظفين.
 * العضوية: موظف نشط له شراكة مقبولة (shift_partners.status='accepted')
 * مع موظف نشط آخر، أو حقل profiles.shift_partner يذكر اسم موظف نشط.
 * المجموعة: مكوّن ترابط كامل بهذا الرسم (عضوان أو ثلاثة عادةً — نظام
 * الورديات مبني لهذين الحجمين فقط، غيرهما يُعرض بلا تقسيم ورديات).
 *
 * @returns {Promise<{groups: object[], pending: object[], ready: boolean}>}
 */
export async function fetchDerivedPartnerGroups() {
  const COLS = 'id, employee_name, shift_partner, page_name, team, avatar_url';
  let data, error;
  try {
    ({ data, error } = await supabase
      .from('profiles').select(COLS).eq('is_active', true).order('employee_name'));
  } catch { return { groups: [], pending: [], ready: false }; }

  // عمود shift_partner غير مضاف بعد → الميزة غير جاهزة، بلا أي عطل
  if (error) return { groups: [], pending: [], ready: false };

  const profiles = data ?? [];
  const byName = new Map(profiles.map(p => [p.employee_name, p]));

  // شراكات مقبولة متبادَلة — المصدر الأساسي (نفس نظام «شركاء الوردية»
  // بالملف الشخصي، بموافقة الطرفين).
  let accepted = [];
  try {
    const { data: sp } = await supabase
      .from('shift_partners').select('requester, partner').eq('status', 'accepted');
    accepted = sp ?? [];
  } catch { /* الجدول غير متاح → نكتفي بحقل الإدارة إن وُجد */ }

  // Union-Find بسيط على أسماء الموظفين النشطين فقط.
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    let cur = x;
    while (parent.get(cur) !== r) { const next = parent.get(cur); parent.set(cur, r); cur = next; }
    return r;
  };
  const union = (a, b) => {
    if (!byName.has(a) || !byName.has(b)) return; // طرف غير نشط/غير موجود — لا يُربَط
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const flaggedNames = new Set();
  for (const { requester, partner } of accepted) {
    if (byName.has(requester)) flaggedNames.add(requester);
    if (byName.has(partner))   flaggedNames.add(partner);
    union(requester, partner);
  }
  // حقل الإدارة (profiles.shift_partner) — يدعم اسماً أو أكثر مفصولة بفاصلة.
  for (const p of profiles) {
    const raw = String(p.shift_partner ?? '').trim();
    if (!raw) continue;
    flaggedNames.add(p.employee_name);
    for (const name of raw.split(/[,،]/).map(s => s.trim()).filter(Boolean)) {
      flaggedNames.add(p.employee_name);
      union(p.employee_name, name);
    }
  }

  const byRoot = new Map();
  for (const name of flaggedNames) {
    const root = find(name);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(byName.get(name));
  }

  const groups = [];
  const pending = [];
  for (const members of byRoot.values()) {
    if (members.length < 2) { pending.push(...members); continue; }
    // الصفحة/الرقم — عرض معلوماتي فقط الآن (لا شرط تكوين): كل الصفحات
    // المختلفة غير الفارغة المذكورة بين الأعضاء، بدون تكرار.
    const pages = [...new Set(members.map(m => String(m.page_name ?? '').trim()).filter(Boolean))];
    groups.push({
      key:  members.map(m => m.id).sort().join('+'),
      page: pages.join(' / '),
      members,
      name: members.map(m => firstName(m.employee_name)).join(' + '),
    });
  }
  groups.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  return { groups, pending, ready: true };
}

/** إنهاء مجموعة اعتباراً من تاريخ — لا حذف، السجلات القديمة تبقى كما هي. */
export async function endGroup(id, effectiveFrom = todayISO()) {
  const { error } = await supabase.from(TABLE)
    .update({ effective_to: prevDayISO(effectiveFrom) })
    .eq('id', id);
  if (error) throw error;
}

// ── الواجهة الجامعة المستخدَمة عند تسجيل الحضور ────────────────
/**
 * يحسب وردية الموظف وتأخيره عند تسجيل الدخول.
 * لو ما عنده مجموعة (أو عدد أعضائها غير مدعوم) → قيَم محايدة،
 * فيبقى سلوك النظام الحالي دون تغيير.
 *
 * @param {string} employeeName
 * @param {string} checkInHHMM
 * @param {string} dateISO — يوم الوردية (لا اليوم التقويمي بالضرورة)
 */
export async function resolveCheckInContext(employeeName, checkInHHMM, dateISO = todayISO()) {
  // 1) مجموعة يدوية سارية بذلك التاريخ إن وُجدت — تبقى الأولوية لها
  //    احتراماً لأي تحديد صريح من المسؤول.
  // 2) وإلا: المجموعة التلقائية من ملفات الموظفين (الشريك + الرقم/الصفحة).
  //    فلا حاجة لإنشاء المجموعات يدوياً أصلاً.
  let group = await fetchGroupForEmployee(employeeName, dateISO);
  if (!group) {
    const { groups } = await fetchDerivedPartnerGroups();
    const g = groups.find(x => x.members.some(m => m.employee_name === employeeName));
    if (g) {
      group = {
        id:      null,                 // مجموعة مشتقّة — لا سطر بجدول shift_groups
        name:    g.name,
        members: g.members.map(m => m.employee_name),
        derived: true,
        page:    g.page,
      };
    }
  }
  const plan  = shiftPlanForGroup(group);
  const shift = resolveShift(plan, checkInHHMM);
  if (!shift) return { group, plan: null, shift: null, delayMinutes: 0, wasLate: false };

  const delayMinutes = computeDelayMinutes(checkInHHMM, shift.start);
  return { group, plan, shift, delayMinutes, wasLate: delayMinutes > 0 };
}
