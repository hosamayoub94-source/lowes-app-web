// =============================================================
// Supabase Edge Function — daily-analytics-snapshot
// جدول analytics_snapshots طلع فاضي بالكامل (0 صف) — يلي كان يخلّي رسم
// "اتجاه الحضور" بلوحة القيادة التنفيذية (/analytics) يعرض "لا توجد
// بيانات" رغم إن بطاقة الرقم (معدل الحضور) شغّالة (بتحسب حياً من جدول
// attendance مباشرة، مو من analytics_snapshots). هاي الدالة تحسب نفس
// المقاييس المستخدَمة بلوحة القيادة (kpiEngine.js) وتحفظها كـsnapshot
// يومي — نفس منطق computeKPIs بالضبط، معاد تنفيذه هون Server-side.
//
// idempotent: تحدّث سجل اليوم لو موجود بدل ما تكرّره (آمن لو الجدولة
// اشتغلت مرتين بالغلط بنفس اليوم).
//
// Deploy: supabase functions deploy daily-analytics-snapshot --no-verify-jwt
// Trigger: SQL cron job (راجع supabase/migration_v13_analytics_snapshot_cron.sql)
// =============================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    const today = new Date();
    const dateISO = today.toISOString().slice(0, 10);
    const dateSlash = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    const periodStart = dateISO + 'T00:00:00Z';
    const periodEnd   = dateISO + 'T23:59:59Z';

    // ── attendance_rate (يطابق _computeAttendanceKPIs بـkpiEngine.js) ──
    const [{ data: attRows }, { count: totalActive }] = await Promise.all([
      supabase.from('attendance').select('employee_name, type, hours, was_late').eq('date', dateSlash),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ]);
    const inRows  = (attRows ?? []).filter((r: any) => r.type === 'in');
    const outRows = (attRows ?? []).filter((r: any) => r.type === 'out');
    const present = inRows.length;
    const total   = totalActive || present;
    const attendance_rate = total ? Math.round((present / total) * 100) : 0;
    const late_employees  = inRows.filter((r: any) => r.was_late).length;
    const absent_employees = Math.max(0, total - present);
    const worked_hours_total = +outRows.reduce((a: number, r: any) => a + (Number(r.hours) || 0), 0).toFixed(1);

    // ── task KPIs (يطابق _computeTaskKPIs) ──
    const { data: tasks } = await supabase
      .from('tasks').select('status, progress, due_date, created_at')
      .gte('created_at', periodStart).lte('created_at', periodEnd);
    const tRows = tasks ?? [];
    const tTotal = tRows.length;
    const completed_tasks = tRows.filter((t: any) => t.status === 'completed' || t.status === 'done').length;
    const overdue_tasks = tRows.filter((t: any) =>
      t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed' && t.status !== 'done').length;
    const avgProg = tTotal ? tRows.reduce((s: number, t: any) => s + (t.progress ?? 0), 0) / tTotal : 0;
    const productivity_score = Math.round(avgProg);
    const task_completion_rate = tTotal ? Math.round((completed_tasks / tTotal) * 100) : 0;

    const metrics = {
      attendance_rate, late_employees, absent_employees, worked_hours_total,
      productivity_score, completed_tasks, overdue_tasks, task_completion_rate,
    };

    // ── idempotent upsert لسجل اليوم ──
    const { data: existing } = await supabase
      .from('analytics_snapshots').select('id')
      .eq('snapshot_type', 'daily').eq('period_start', periodStart).maybeSingle();

    if (existing?.id) {
      await supabase.from('analytics_snapshots')
        .update({ metrics, period_end: periodEnd, is_published: true })
        .eq('id', existing.id);
    } else {
      await supabase.from('analytics_snapshots').insert({
        snapshot_type: 'daily', period_start: periodStart, period_end: periodEnd,
        metrics, is_published: true,
      });
    }

    return new Response(JSON.stringify({ ok: true, date: dateISO, metrics }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('[daily-analytics-snapshot]', err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
