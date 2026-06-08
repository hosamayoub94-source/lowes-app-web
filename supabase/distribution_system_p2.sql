-- ================================================================
-- DISTRIBUTION SYSTEM — P2 (MLM Network)  |  شبكة المسوّقات
-- Apply in Supabase SQL Editor (idempotent). Run AFTER P0 + P1.
--
--   1. توليد invite_code للمسوّقات التي لا تملك واحداً
--   2. RPC set_recruiter_by_invite — ضمّ مسوّقة عبر رمز دعوة
--   3. RPC my_downline — شجرة الفريق (depth + مبيعات الشهر)
-- ================================================================

-- ── 1. توليد رموز دعوة لمن يفتقدها (marketer/supervisor) ──
UPDATE public.profiles
SET invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE invite_code IS NULL
  AND seller_type = 'marketer';

-- دالة لتوليد رمز فريد عند إنشاء مسوّقة جديدة (تُستدعى من التطبيق عند الحاجة)
CREATE OR REPLACE FUNCTION public.ensure_invite_code(p_user uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_code text;
BEGIN
  SELECT invite_code INTO v_code FROM public.profiles WHERE id = p_user;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;
  LOOP
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE invite_code = v_code);
  END LOOP;
  UPDATE public.profiles SET invite_code = v_code WHERE id = p_user;
  RETURN v_code;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_invite_code(uuid) TO authenticated;


-- ── 2. ضمّ مسوّقة عبر رمز دعوة ──
-- المستخدم الحالي يصبح تابعاً (recruiter) لصاحب الرمز.
-- شروط: لا يضمّ نفسه، لا يغيّر مُجنِّداً موجوداً، لا حلقات (الرمز ليس تابعاً له).
CREATE OR REPLACE FUNCTION public.set_recruiter_by_invite(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_me        uuid := auth.uid();
  v_recruiter uuid;
  v_existing  uuid;
BEGIN
  IF v_me IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated'); END IF;

  SELECT id INTO v_recruiter FROM public.profiles WHERE invite_code = upper(trim(p_code));
  IF v_recruiter IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_code'); END IF;
  IF v_recruiter = v_me   THEN RETURN jsonb_build_object('ok', false, 'error', 'self'); END IF;

  SELECT recruiter_id INTO v_existing FROM public.profiles WHERE id = v_me;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'already_recruited'); END IF;

  -- منع الحلقة: الرمز يجب ألا يكون من ضمن تابعيّ أنا.
  IF public.is_supervisor_of(v_recruiter) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cycle');
  END IF;

  UPDATE public.profiles SET recruiter_id = v_recruiter WHERE id = v_me;
  RETURN jsonb_build_object('ok', true, 'recruiter_id', v_recruiter);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_recruiter_by_invite(text) TO authenticated;


-- ── 3. شجرة الفريق (downline) لمستخدم: كل التابعين مع العمق ومبيعات الشهر ──
CREATE OR REPLACE FUNCTION public.my_downline(p_root uuid DEFAULT NULL, p_month text DEFAULT NULL)
RETURNS TABLE (
  id uuid, employee_name text, mlm_rank text, seller_type text,
  depth int, recruiter_id uuid, month_sales numeric, month_commission numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH RECURSIVE root AS (
    SELECT COALESCE(p_root, auth.uid()) AS rid,
           COALESCE(p_month, to_char(now(), 'YYYY-MM')) AS mon
  ),
  tree AS (
    SELECT p.id, p.employee_name, p.mlm_rank, p.seller_type, 1 AS depth, p.recruiter_id
    FROM public.profiles p, root
    WHERE p.recruiter_id = root.rid
    UNION ALL
    SELECT c.id, c.employee_name, c.mlm_rank, c.seller_type, t.depth + 1, c.recruiter_id
    FROM public.profiles c
    JOIN tree t ON c.recruiter_id = t.id
    WHERE t.depth < 10
  )
  SELECT t.id, t.employee_name, t.mlm_rank, t.seller_type, t.depth, t.recruiter_id,
         COALESCE((SELECT sum(o.amount) FROM public.orders o, root
                   WHERE o.seller_id = t.id AND o.status = 'delivered'
                     AND to_char(COALESCE(o.order_date, o.created_at), 'YYYY-MM') = root.mon), 0) AS month_sales,
         COALESCE((SELECT sum(l.amount) FROM public.commission_ledger l, root
                   WHERE l.seller_id = t.id AND l.month = root.mon), 0) AS month_commission
  FROM tree t
  ORDER BY t.depth, t.employee_name;
$$;
GRANT EXECUTE ON FUNCTION public.my_downline(uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- التحقق:
--   SELECT public.ensure_invite_code(auth.uid());
--   SELECT * FROM public.my_downline();
-- ════════════════════════════════════════════════════════════════
