// =============================================================
// useCelebrations — يفحص كل يوم عند فتح التطبيق:
//   • عيد ميلاد موظف → ينشر إعلان تلقائي 🎂
//   • ذكرى تعيين     → ينشر إعلان تلقائي 🏆
//
// يعمل فقط عند المدير والأدمن لتجنّب تكرار النشر من 50 جهاز.
// يحفظ تاريخ آخر فحص في localStorage لتجنّب فحص متكرر.
// يتحقق من الإعلانات الموجودة اليوم قبل النشر (منع التكرار).
// =============================================================
import { useEffect } from 'react';
import { supabase }  from '@services/supabase';
import { useAuth }   from '@hooks/useAuth';
import { ROLES }     from '@data/teams';

const LS_KEY = 'celebrations_checked'; // localStorage key → stores 'YYYY-MM-DD'

// ── helpers ───────────────────────────────────────────────────
function todayStr()  { return new Date().toISOString().slice(0, 10); }
function todayStart(){ return new Date().toISOString().slice(0, 10) + 'T00:00:00'; }

function sameMonthDay(dateStr, today) {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr);
    return d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  } catch { return false; }
}

function yearsAgo(dateStr, today) {
  if (!dateStr) return 0;
  return today.getFullYear() - new Date(dateStr).getFullYear();
}

async function runCheck(posterName) {
  const today     = new Date();
  const todayISO  = todayStr();
  const todayMidnight = todayStart();

  // 1. Fetch today's existing auto-announcements to avoid duplicates
  const { data: existing } = await supabase
    .from('announcements')
    .select('title')
    .gte('created_at', todayMidnight)
    .eq('created_by', 'النظام');

  const existingTitles = (existing || []).map(a => a.title);
  const alreadyPosted  = (name) => existingTitles.some(t => t.includes(name));

  // 2. Fetch active profiles that have birthday or join_date
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('employee_name, birthday, join_date')
    .eq('is_active', true)
    .not('employee_name', 'is', null);

  if (error || !profiles?.length) return;

  const toPost = [];

  for (const p of profiles) {
    const name = p.employee_name?.trim();
    if (!name) continue;

    // ── 🎂 عيد ميلاد ───────────────────────────────────────
    if (sameMonthDay(p.birthday, today) && !alreadyPosted(name)) {
      toPost.push({
        emoji:      '🎂',
        title:      `🎂 عيد ميلاد سعيد ${name}!`,
        body:       `الفريق بأكمله يهنئ ${name} بعيد ميلادها/ه السعيد 🎉\nكل عام وأنت بخير، تمنياتنا لك بالصحة والسعادة والنجاح دائماً 💙`,
        created_by: 'النظام',
        is_pinned:  true,
      });
    }

    // ── 🏆 ذكرى التعيين ────────────────────────────────────
    if (sameMonthDay(p.join_date, today) && !alreadyPosted(name)) {
      const years = yearsAgo(p.join_date, today);
      if (years < 1) continue; // السنة الأولى ما تنشر ذكرى
      const yearsLabel = years === 1 ? 'سنة كاملة' : `${years} سنوات`;
      toPost.push({
        emoji:      '🏆',
        title:      `🏆 ذكرى تعيين ${name} — ${yearsLabel}!`,
        body:       `اليوم يمر ${yearsLabel} على انضمام ${name} لعائلة Lowe's Professional!\nشكراً على كل جهودك وعطاءك المستمر — أنت ركيزة الفريق 💪✨`,
        created_by: 'النظام',
        is_pinned:  false,
      });
    }
  }

  // 3. Post all celebrations
  if (toPost.length === 0) return;

  for (const ann of toPost) {
    await supabase.from('announcements').insert(ann).catch(() => {});
  }

  // 4. Save today's date so same device doesn't re-run
  localStorage.setItem(LS_KEY, todayISO);
}

// ── Hook ──────────────────────────────────────────────────────
export function useCelebrations() {
  const { name, role } = useAuth();

  // Only admin/manager trigger the check
  const canPost = [ROLES.ADMIN, ROLES.MANAGER].includes(role);

  useEffect(() => {
    if (!canPost || !name) return;

    // Skip if already checked today on this device
    const lastChecked = localStorage.getItem(LS_KEY);
    if (lastChecked === todayStr()) return;

    // Small delay so auth is fully settled
    const timer = setTimeout(() => {
      runCheck(name).catch(() => {});
    }, 4000);

    return () => clearTimeout(timer);
  }, [canPost, name]);
}

export default useCelebrations;
