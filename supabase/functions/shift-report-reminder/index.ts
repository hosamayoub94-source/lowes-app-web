// =============================================================
// Supabase Edge Function — shift-report-reminder
// تذكير تقرير الحملات مرتبط بنهاية وردية الموظف الفعلية (قرار حسام، 16 أيلول 2026):
//   • قبل نهاية الوردية بـ30 دقيقة → «سجّل تقرير الحملات».
//   • بعد نهايتها بـ30 دقيقة ولا يوجد daily_reports ليوم الوردية → «لم يُسجَّل».
//   • بعد ذلك لا قفل ولا موعد نهائي — الشاشة تبقى مفتوحة.
//
// من يُذكَّر: موظف نشط + مُسنَد لحملة نشطة (campaigns.members) + سجّل دخولاً
// (attendance.type='in') بيوم الوردية. بلا دخول = لا وردية = لا تذكير
// (يغطي العطل والغياب تلقائياً). قراءة فقط من attendance — لا كتابة.
//
// نهاية الوردية: خطة شركاء الدوام (attendance.shift_key + حجم المجموعة)
// وإلا profiles.work_end. نهاية ≤ بداية → تعبر منتصف الليل (18:00→01:00).
// يوم الوردية = نفس قاعدة التطبيق: قبل 06:00 محلياً = تتمة أمس.
//
// التوقيت: تركيا وسوريا كلاهما UTC+3 ثابت — لا DST.
// التكرار: cron كل 5 دقائق + dedup_key بجدول notifications = إشعار واحد لكل نافذة.
//
// Deploy: تلقائي عبر GitHub Actions على main (--no-verify-jwt).
// Trigger: supabase/migrations/20260916_report_reminder.sql
// =============================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TZ_OFFSET_MIN     = 3 * 60; // UTC+3
const SHIFT_DAY_START_H = 6;
const PRE_MIN           = 30;     // قبل النهاية
const POST_MIN          = 30;     // بعد النهاية
const WINDOW_MIN        = 5;      // عرض نافذة الالتقاط = فترة الـcron

// نفس SHIFT_PLANS في src/services/shiftPartnersService.js — نهاية كل وردية حسب حجم المجموعة
const PLAN_END: Record<number, Record<string, string>> = {
  2: { morning: '16:00', evening: '23:00' },
  3: { morning: '15:00', noon: '20:00', evening: '01:00' },
};

const pad = (n: number) => String(n).padStart(2, '0');
const toMin = (hhmm: string | null | undefined): number | null => {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  return (isNaN(h) || isNaN(m)) ? null : h * 60 + m;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const sb  = createClient(url, key);

    // ── الوقت المحلي (UTC+3) ─────────────────────────────────
    const nowLocal = new Date(Date.now() + TZ_OFFSET_MIN * 60_000); // نقرأ حقول UTC كمحلية
    const shiftDay = new Date(nowLocal);
    if (shiftDay.getUTCHours() < SHIFT_DAY_START_H) shiftDay.setUTCDate(shiftDay.getUTCDate() - 1);
    const y = shiftDay.getUTCFullYear(), mo = shiftDay.getUTCMonth() + 1, d = shiftDay.getUTCDate();
    const shiftISO   = `${y}-${pad(mo)}-${pad(d)}`;
    const shiftSlash = `${y}/${pad(mo)}/${pad(d)}`;
    // دقائق "الآن" منذ منتصف ليل يوم الوردية (قد تتجاوز 1440 بعد منتصف الليل)
    const nowMinFromShiftMidnight = Math.round((nowLocal.getTime() - Date.UTC(y, mo - 1, d)) / 60_000);

    // ── البيانات ─────────────────────────────────────────────
    const [profRes, campRes, attRes] = await Promise.all([
      sb.from('profiles').select('id, employee_name, work_start, work_end, shift_partner').eq('is_active', true),
      sb.from('campaigns').select('members, is_active').or('is_active.is.null,is_active.eq.true'),
      sb.from('attendance').select('employee_name, time_in, shift_key, shift_start, shift_group_id')
        .eq('date', shiftSlash).eq('type', 'in'),
    ]);
    if (profRes.error) throw profRes.error;
    if (campRes.error) throw campRes.error;
    if (attRes.error)  throw attRes.error;

    const profiles = profRes.data ?? [];
    const byName   = new Map(profiles.map((p: any) => [p.employee_name, p]));
    const assigned = new Set<string>();
    for (const c of (campRes.data ?? []) as any[]) for (const m of (Array.isArray(c.members) ? c.members : [])) assigned.add(m);

    // أول دخول لكل موظف بيوم الوردية (لو أكثر من دخول نأخذ الأول — نهاية الوردية واحدة)
    const inByName = new Map<string, any>();
    for (const r of (attRes.data ?? []) as any[]) {
      const prev = inByName.get(r.employee_name);
      if (!prev || String(r.time_in || '') < String(prev.time_in || '')) inByName.set(r.employee_name, r);
    }

    // ── حجم مجموعة الشركاء (لتحديد نهاية الوردية من shift_key) ──
    // 1) shift_groups إن كان shift_group_id موجوداً · 2) وإلا المجموعة المشتقّة
    //    (shift_partners المقبولة + profiles.shift_partner) — نفس منطق التطبيق.
    const groupSizeById = new Map<string, number>();
    const needIds = [...new Set([...inByName.values()].map(r => r.shift_group_id).filter(Boolean))];
    if (needIds.length) {
      const { data } = await sb.from('shift_groups').select('id, members').in('id', needIds);
      for (const g of (data ?? []) as any[]) groupSizeById.set(g.id, (g.members ?? []).length);
    }
    const parent = new Map<string, string>();
    const find = (x: string): string => { if (!parent.has(x)) parent.set(x, x); let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
    const union = (a: string, b: string) => { if (!byName.has(a) || !byName.has(b)) return; const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    try {
      const { data: sp } = await sb.from('shift_partners').select('requester, partner').eq('status', 'accepted');
      for (const { requester, partner } of (sp ?? []) as any[]) union(requester, partner);
    } catch { /* الجدول غير متاح → نكتفي بحقل الإدارة */ }
    for (const p of profiles as any[]) {
      const raw = String(p.shift_partner ?? '').trim();
      if (!raw) continue;
      for (const n of raw.split(/[,،]/).map((s: string) => s.trim()).filter(Boolean)) union(p.employee_name, n);
    }
    const compSize = new Map<string, number>();
    for (const n of parent.keys()) { const r = find(n); compSize.set(r, (compSize.get(r) ?? 0) + 1); }
    const derivedSize = (name: string) => parent.has(name) ? (compSize.get(find(name)) ?? 1) : 1;

    // ── من عليه إشعار الآن؟ ──────────────────────────────────
    const pre: any[] = [], post: any[] = [];
    for (const [name, row] of inByName) {
      if (!assigned.has(name)) continue;
      const prof: any = byName.get(name);
      if (!prof?.id) continue;

      // نهاية الوردية
      let endHHMM: string | null = null;
      if (row.shift_key) {
        const size = row.shift_group_id ? (groupSizeById.get(row.shift_group_id) ?? derivedSize(name)) : derivedSize(name);
        endHHMM = PLAN_END[size]?.[row.shift_key] ?? null;
      }
      if (!endHHMM && prof.work_end) endHHMM = String(prof.work_end).slice(0, 5);
      const endM   = toMin(endHHMM);
      const startM = toMin(row.shift_start) ?? toMin(prof.work_start) ?? toMin(row.time_in);
      if (endM === null || startM === null) continue;

      // نهاية ≤ بداية → الوردية تعبر منتصف الليل (18:00→01:00 = 25:00 بمقياس يوم الوردية)
      const endAbs = endM <= startM ? endM + 1440 : endM;
      const untilEnd = endAbs - nowMinFromShiftMidnight; // موجب = لسا ما انتهت

      if (untilEnd <= PRE_MIN && untilEnd > PRE_MIN - WINDOW_MIN) pre.push({ prof, name, endHHMM });
      else if (-untilEnd >= POST_MIN && -untilEnd < POST_MIN + WINDOW_MIN) post.push({ prof, name, endHHMM });
    }

    // بعد النهاية: فقط من لم يسجّل تقرير يوم الوردية
    let postMissing = post;
    if (post.length) {
      const { data: reps } = await sb.from('daily_reports').select('employee_name')
        .eq('report_date', shiftISO).in('employee_name', post.map(p => p.name));
      const done = new Set((reps ?? []).map((r: any) => r.employee_name));
      postMissing = post.filter(p => !done.has(p.name));
    }

    // ── الإرسال (إشعار داخل التطبيق + push) ─────────────────
    const notify = async (userId: string, kind: 'pre' | 'post', endHHMM: string) => {
      const title   = kind === 'pre' ? '⏰ بقي 30 دقيقة على نهاية ورديتك' : '⚠️ لم يُسجَّل تقرير الحملات';
      const message = kind === 'pre'
        ? `ورديتك تنتهي ${endHHMM} — سجّل تقرير الحملات والإعلانات قبل الخروج.`
        : `انتهت ورديتك ${endHHMM} ولم يُسجَّل تقرير اليوم (${shiftISO}). يمكنك تسجيله الآن من «تقريري اليومي».`;
      const { error } = await sb.from('notifications').insert({
        recipient: userId, kind: 'report_reminder', user_id: userId, type: 'report_reminder',
        title, message, severity: 'warning', entity_type: 'daily_report', entity_id: shiftISO,
        metadata: { kind, shift_date: shiftISO, shift_end: endHHMM }, is_read: false,
        dedup_key: `${userId}|report_reminder|${kind}:${shiftISO}|${shiftISO}`,
      });
      if (error) { if (error.code === '23505') return 'dup'; throw error; }
      // push — best effort
      try {
        await fetch(`${url}/functions/v1/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({ userId, title, body: message, url: '/daily-report', tag: `report-${kind}-${shiftISO}` }),
        });
      } catch { /* silent */ }
      return 'sent';
    };

    const results: Record<string, string> = {};
    for (const p of pre)         results[`pre:${p.name}`]  = await notify(p.prof.id, 'pre',  p.endHHMM);
    for (const p of postMissing) results[`post:${p.name}`] = await notify(p.prof.id, 'post', p.endHHMM);

    return new Response(JSON.stringify({
      ok: true, shift_date: shiftISO, local_now: nowLocal.toISOString().slice(11, 16),
      checked: inByName.size, pre: pre.length, post: post.length, post_missing: postMissing.length, results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[shift-report-reminder]', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
