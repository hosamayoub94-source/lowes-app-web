// =============================================================
// Supabase Edge Function — manage-employee
// إنشاء/تعطيل/إعادة تفعيل/إعادة PIN/نقل مجموعة — بصلاحية هرمية server-side.
// يتجاوز حظر INSERT على profiles للـ anon عبر service role، مع بوابة دور.
//
// الهرمية (CAN_CREATE):
//   admin / manager        → أي دور
//   sales_manager          → أدوار التوزيع كلها
//   supervisor_manager     → مشرفات فقط (supervisor)
//   supervisor             → مسوّقات فقط (marketer)
//   social_manager         → موظفي ميديا فقط (team=ميديا, role=employee)
//
// المسوّقات/المشرفات الجديدات تُربَط آلياً بشجرة الكفلاء (recruiter_id) عند وجود كفيل.
// المشرفة الجديدة تحصل على mlm_group خاص بها.
//
// Deploy: supabase functions deploy manage-employee --no-verify-jwt
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DIST_ROLES = ['field_rep', 'marketer', 'supervisor', 'supervisor_manager', 'area_agent'];

// مَن يحقّ لكل دور إنشاؤه. '*' = أي دور.
const CAN_CREATE: Record<string, string[] | '*'> = {
  admin:              '*',
  manager:            '*',
  social_manager:     ['employee'],
  sales_manager:      DIST_ROLES,
  supervisor_manager: ['supervisor'],
  supervisor:         ['marketer'],
};

const MANAGE_ROLES = Object.keys(CAN_CREATE);

// أدوار شبكة MLM (seller_type='marketer') تُربَط بشجرة الكفلاء عبر recruiter_id.
const MLM_ROLES = ['marketer', 'supervisor', 'supervisor_manager'];
const FIELD_ROLES = ['field_rep', 'area_agent'];

const randomPin = () => String(Math.floor(100000 + Math.random() * 900000)); // 6 أرقام

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, requesterRole, requesterId, employee_name, team, job_title, pin, target_id,
            role_type, seller_type, rep_level, mlm_rank, sponsor_id, group_id, store_id } = body;

    if (!MANAGE_ROLES.includes(requesterRole)) {
      return json({ ok: false, error: 'forbidden', message: 'ليس لديك صلاحية إدارة المستخدمين' }, 200);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    const isSocial = requesterRole === 'social_manager';
    const allowed = CAN_CREATE[requesterRole];

    // اسم المُنفِّذ للتدقيق
    let actorName: string | null = null;
    if (requesterId) {
      const { data: actor } = await supabase.from('profiles')
        .select('employee_name').eq('id', requesterId).maybeSingle();
      actorName = actor?.employee_name ?? null;
    }
    const audit = (act: string, targetId: string | null, targetName: string | null, details: unknown = {}) =>
      supabase.from('network_audit').insert({
        actor_id: requesterId ?? null, actor_name: actorName,
        action: act, target_id: targetId, target_name: targetName, details,
      });

    // ───────────────────────────── add ─────────────────────────────
    if (action === 'add') {
      if (!employee_name?.trim()) return json({ ok: false, error: 'name_required' }, 200);

      // الدور النهائي + بوابة الهرمية
      const role = isSocial ? 'employee' : (role_type || 'employee');
      if (allowed !== '*' && !allowed.includes(role)) {
        return json({ ok: false, error: 'forbidden_role',
          message: `لا تملك صلاحية إنشاء حساب بدور «${role}»` }, 200);
      }

      const finalTeam = isSocial ? 'ميديا' : (team || null);
      const finalPin  = (pin && /^\d{4,6}$/.test(String(pin))) ? String(pin) : randomPin();

      // نوع البائع + المستوى/الرتبة (لمحرّك العمولات)
      let st = 'online';
      if (!isSocial) {
        if (MLM_ROLES.includes(role)) st = 'marketer';
        else if (FIELD_ROLES.includes(role)) st = 'field_rep';
        else st = seller_type || 'online';
      }
      const lvl = st === 'field_rep' ? (rep_level || 'junior') : null;
      const rnk = st === 'marketer'  ? (mlm_rank  || 'bronze') : null;

      // منع تكرار اسم نشِط
      const { data: existing } = await supabase.from('profiles')
        .select('id,is_active').eq('employee_name', employee_name.trim()).maybeSingle();
      if (existing?.is_active) return json({ ok: false, error: 'exists', message: 'الاسم موجود ونشط بالفعل' }, 200);

      // رمز دعوة فريد للمسوّقات/المشرفات
      let invite_code: string | null = null;
      if (st === 'marketer') {
        for (let i = 0; i < 6; i++) {
          const code = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
          const { data: clash } = await supabase.from('profiles')
            .select('id').eq('invite_code', code).maybeSingle();
          if (!clash) { invite_code = code; break; }
        }
      }

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
        invite_code,
        store_id: role === 'store' ? (store_id || null) : null,
      }).select('id,employee_name,role_type,team,seller_type,invite_code').single();
      if (error) return json({ ok: false, error: 'db', message: error.message }, 200);

      // المشرفة الجديدة → مجموعة خاصة بها
      if (role === 'supervisor') {
        const { data: grp } = await supabase.from('mlm_groups').insert({
          name: `مجموعة ${data.employee_name}`,
          supervisor_id: data.id,
          manager_id: requesterRole === 'supervisor_manager' ? requesterId : null,
        }).select('id').single();
        if (grp?.id) await supabase.from('profiles').update({ group_id: grp.id }).eq('id', data.id);
      }

      // الربط بشجرة الكفلاء (recruiter_id) — لكل أدوار MLM إن وُجد كفيل
      let recruiter: string | null = null;
      if (st === 'marketer') {
        // الكفيل: صريح > المُنشئ إن كان من الشبكة > لا أحد (جذر يُنشئه الأدمن/مدير المبيعات)
        const effectiveSponsor = sponsor_id
          || (['supervisor', 'supervisor_manager', 'marketer'].includes(requesterRole) ? requesterId : null);
        // الحساب جديد بلا تابعين، فلا يُشكّل ربطُه حلقة ما دام الكفيل ≠ نفسه.
        if (effectiveSponsor && effectiveSponsor !== data.id) {
          const { error: rErr } = await supabase.from('profiles')
            .update({ recruiter_id: effectiveSponsor }).eq('id', data.id);
          if (rErr) {
            // فشل الربط — لا نكسر الإنشاء، نُبلِغ
            await audit('create', data.id, data.employee_name, { recruiter_error: rErr.message });
            return json({ ok: true, action, profile: data, pin: finalPin,
              warning: 'تم الإنشاء لكن تعذّر ربط الكفيل تلقائياً', recruiter_error: rErr.message }, 200);
          }
          recruiter = effectiveSponsor;
        }
      }

      await audit('create', data.id, data.employee_name,
        { role, seller_type: st, recruiter_id: recruiter });

      return json({ ok: true, action, profile: data, pin: finalPin, recruiter_id: recruiter }, 200);
    }

    // ──────────────────── deactivate / reactivate ──────────────────
    if (action === 'deactivate' || action === 'reactivate') {
      if (!target_id) return json({ ok: false, error: 'target_required' }, 200);
      const guard = await assertCanManageTarget(supabase, requesterRole, requesterId, target_id, isSocial, allowed);
      if (!guard.ok) return json(guard, 200);

      const { data, error } = await supabase.from('profiles')
        .update({ is_active: action === 'reactivate' })
        .eq('id', target_id).select('id,employee_name,is_active').single();
      if (error) return json({ ok: false, error: 'db', message: error.message }, 200);
      await audit(action, target_id, data.employee_name, {});
      return json({ ok: true, action, profile: data }, 200);
    }

    // ───────────────────────── reset_pin ───────────────────────────
    if (action === 'reset_pin') {
      if (!target_id) return json({ ok: false, error: 'target_required' }, 200);
      const guard = await assertCanManageTarget(supabase, requesterRole, requesterId, target_id, isSocial, allowed);
      if (!guard.ok) return json(guard, 200);

      const newPin = (pin && /^\d{4,6}$/.test(String(pin))) ? String(pin) : randomPin();
      const { data, error } = await supabase.from('profiles')
        .update({ pin: newPin }).eq('id', target_id).select('id,employee_name').single();
      if (error) return json({ ok: false, error: 'db', message: error.message }, 200);
      await audit('reset_pin', target_id, data.employee_name, {});
      return json({ ok: true, action, profile: data, pin: newPin }, 200);
    }

    // ───────────────────────── move_group ──────────────────────────
    if (action === 'move_group') {
      if (!target_id || !group_id) return json({ ok: false, error: 'target_and_group_required' }, 200);
      const guard = await assertCanManageTarget(supabase, requesterRole, requesterId, target_id, isSocial, allowed);
      if (!guard.ok) return json(guard, 200);

      const { data, error } = await supabase.from('profiles')
        .update({ group_id }).eq('id', target_id).select('id,employee_name,group_id').single();
      if (error) return json({ ok: false, error: 'db', message: error.message }, 200);
      await audit('move_group', target_id, data.employee_name, { group_id });
      return json({ ok: true, action, profile: data }, 200);
    }

    // ───────────────────────── edit ────────────────────────────────
    if (action === 'edit') {
      if (!target_id) return json({ ok: false, error: 'target_required' }, 200);
      const guard = await assertCanManageTarget(supabase, requesterRole, requesterId, target_id, isSocial, allowed);
      if (!guard.ok) return json(guard, 200);

      const patch: Record<string, unknown> = {};
      if (employee_name?.trim()) patch.employee_name = employee_name.trim();
      if (role_type) {
        if (allowed !== '*' && !allowed.includes(role_type))
          return json({ ok: false, error: 'forbidden_role', message: `لا تملك صلاحية تعيين دور «${role_type}»` }, 200);
        patch.role_type = role_type;
        const st = MLM_ROLES.includes(role_type) ? 'marketer' : FIELD_ROLES.includes(role_type) ? 'field_rep' : 'online';
        patch.seller_type = st;
        if (st === 'field_rep') patch.rep_level = rep_level || 'junior';
        if (st === 'marketer') patch.mlm_rank = mlm_rank || 'bronze';
      }
      if (Object.keys(patch).length === 0) return json({ ok: false, error: 'nothing_to_update' }, 200);

      const { data, error } = await supabase.from('profiles').update(patch)
        .eq('id', target_id).select('id,employee_name,role_type').single();
      if (error) return json({ ok: false, error: 'db', message: error.message }, 200);
      await audit('edit', target_id, data.employee_name, patch);
      return json({ ok: true, action, profile: data }, 200);
    }

    // ──────────────────────── delete (نهائي) ────────────────────────
    if (action === 'delete') {
      if (!target_id) return json({ ok: false, error: 'target_required' }, 200);
      // الحذف النهائي للأدمن/المدير فقط (إجراء خطير)
      if (!['admin', 'manager'].includes(requesterRole))
        return json({ ok: false, error: 'forbidden', message: 'الحذف النهائي للأدمن/المدير فقط' }, 200);
      const { data: t } = await supabase.from('profiles').select('employee_name').eq('id', target_id).maybeSingle();
      const { error } = await supabase.from('profiles').delete().eq('id', target_id);
      if (error) return json({ ok: false, error: 'db', message: 'تعذّر الحذف (قد يكون مرتبطاً بطلبات). ' + error.message }, 200);
      await audit('delete', null, t?.employee_name || null, { deleted_id: target_id });
      return json({ ok: true, action }, 200);
    }

    return json({ ok: false, error: 'unknown_action' }, 200);

  } catch (err) {
    console.error('[manage-employee]', err);
    return json({ ok: false, error: String(err) }, 500);
  }
});

// التحقّق أن المُنفّذ يحقّ له إدارة الهدف (تعطيل/PIN/نقل).
async function assertCanManageTarget(
  supabase: any, requesterRole: string, requesterId: string | undefined,
  targetId: string, isSocial: boolean, allowed: string[] | '*',
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const { data: t } = await supabase.from('profiles')
    .select('role_type,team').eq('id', targetId).maybeSingle();
  if (!t) return { ok: false, error: 'not_found', message: 'الحساب غير موجود' };

  if (isSocial) {
    if (t.team !== 'ميديا' || t.role_type !== 'employee')
      return { ok: false, error: 'forbidden', message: 'يمكنك إدارة موظفي السوشال فقط' };
    return { ok: true };
  }
  if (allowed !== '*' && !allowed.includes(t.role_type))
    return { ok: false, error: 'forbidden', message: `لا تملك صلاحية إدارة دور «${t.role_type}»` };
  return { ok: true };
}

function json(b: unknown, status: number) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
