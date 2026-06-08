// =============================================================
// Supabase Edge Function — manage-employee
// إضافة/تعطيل/إعادة تفعيل موظف — بصلاحية المدير/الأدمن/مدير السوشال.
// يتجاوز حظر INSERT على profiles للـ anon عبر service role، مع بوابة دور.
//
// مدير السوشال (social_manager): يضيف موظفي ميديا فقط (team=ميديا, role=employee).
// الأدمن/المدير: حرية أكبر.
//
// Deploy: supabase functions deploy manage-employee --no-verify-jwt
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MANAGE_ROLES = ['admin', 'manager', 'social_manager'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, requesterRole, requesterId, employee_name, team, job_title, pin, target_id,
            role_type, seller_type, rep_level, mlm_rank } = await req.json();

    if (!MANAGE_ROLES.includes(requesterRole)) {
      return json({ ok: false, error: 'forbidden', message: 'ليس لديك صلاحية إدارة الموظفين' }, 200);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // social_manager is constrained to media-team employees
    const isSocial = requesterRole === 'social_manager';

    if (action === 'add') {
      if (!employee_name?.trim()) return json({ ok: false, error: 'name_required' }, 200);
      // social_manager مقيّد بموظفي ميديا؛ الأدمن/المدير يحدّدان الدور.
      const role = isSocial ? 'employee' : (role_type || 'employee');
      const finalTeam = isSocial ? 'ميديا' : (team || null);
      const finalPin = (pin && /^\d{4}$/.test(String(pin))) ? String(pin) : '1234';
      // نوع البائع + المستوى/الرتبة (لمحرّك العمولات)
      const st = isSocial ? 'online' : (seller_type || 'online');
      const lvl = st === 'field_rep' ? (rep_level || 'junior') : null;
      const rnk = st === 'marketer'  ? (mlm_rank  || 'bronze') : null;

      // prevent duplicate active name
      const { data: existing } = await supabase.from('profiles')
        .select('id,is_active').eq('employee_name', employee_name.trim()).maybeSingle();
      if (existing?.is_active) return json({ ok: false, error: 'exists', message: 'الاسم موجود ونشط بالفعل' }, 200);

      const { data, error } = await supabase.from('profiles').insert({
        employee_name: employee_name.trim(),
        role_type: role,
        team: finalTeam,
        job_title: job_title?.trim() || (isSocial ? 'فريق السوشال' : null),
        pin: finalPin,
        is_active: true,
        seller_type: st,
        rep_level: lvl,
        mlm_rank: rnk,
      }).select('id,employee_name,role_type,team,seller_type').single();
      if (error) return json({ ok: false, error: 'db', message: error.message }, 200);
      return json({ ok: true, action, profile: data, pin: finalPin }, 200);
    }

    if (action === 'deactivate' || action === 'reactivate') {
      if (!target_id) return json({ ok: false, error: 'target_required' }, 200);
      // social_manager can only toggle media-team employees
      if (isSocial) {
        const { data: t } = await supabase.from('profiles').select('team,role_type').eq('id', target_id).maybeSingle();
        if (!t || t.team !== 'ميديا' || t.role_type !== 'employee') {
          return json({ ok: false, error: 'forbidden', message: 'يمكنك إدارة موظفي السوشال فقط' }, 200);
        }
      }
      const { data, error } = await supabase.from('profiles')
        .update({ is_active: action === 'reactivate' })
        .eq('id', target_id).select('id,employee_name,is_active').single();
      if (error) return json({ ok: false, error: 'db', message: error.message }, 200);
      return json({ ok: true, action, profile: data }, 200);
    }

    return json({ ok: false, error: 'unknown_action' }, 200);

  } catch (err) {
    console.error('[manage-employee]', err);
    return json({ ok: false, error: String(err) }, 500);
  }

  function json(b: unknown, status: number) {
    return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
