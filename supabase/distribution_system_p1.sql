-- ================================================================
-- DISTRIBUTION SYSTEM — P1 (Unified Commission Engine)
-- محرّك العمولات الموحّد | Apply in Supabase SQL Editor (idempotent)
-- Run AFTER distribution_system_p0.sql.
--
-- يوفّر دالة واحدة post_order_commission(order_id) تُستدعى عند تسليم
-- الطلب. تتفرّع حسب profiles.seller_type وتكتب صفوف commission_ledger:
--   • online    → تُتجاوز (تبقى العمولة per-market كما هي في الواجهة).
--   • field_rep → نسبة المستوى (rep_level_rules.base_pct).
--   • marketer  → شخصية (mlm_rank_rules) + override صعوداً في سلسلة
--                 recruiter (commission_config.override_pcts) + إشراف
--                 المجموعة (group_override_pct) مع السقوف.
-- idempotent عبر orders.commission_locked (لا احتساب مزدوج).
-- ================================================================

CREATE OR REPLACE FUNCTION public.post_order_commission(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order   public.orders%ROWTYPE;
  v_seller  public.profiles%ROWTYPE;
  v_month   text;
  v_cur     text;
  v_amount  numeric;
  v_pct     numeric;
  v_cap     numeric;
  v_hardmax numeric;
  v_over    numeric[];
  v_grp     numeric;
  v_current uuid;
  v_depth   int := 1;
  v_overlen int;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_order.status <> 'delivered' THEN RETURN; END IF;
  IF v_order.commission_locked THEN RETURN; END IF;          -- حارس الاحتساب المزدوج
  IF v_order.seller_id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_seller FROM public.profiles WHERE id = v_order.seller_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- online: العمولة تُحسب per-market في الواجهة — نقفل فقط بلا كتابة دفتر.
  IF v_seller.seller_type IS NULL OR v_seller.seller_type = 'online' THEN
    UPDATE public.orders SET commission_locked = true WHERE id = p_order_id;
    RETURN;
  END IF;

  v_month  := to_char(COALESCE(v_order.order_date, now()), 'YYYY-MM');
  v_cur    := COALESCE(v_order.currency, 'USD');
  v_amount := COALESCE(v_order.amount, 0);

  IF v_amount <= 0 THEN
    UPDATE public.orders SET commission_locked = true WHERE id = p_order_id;
    RETURN;
  END IF;

  SELECT override_pcts, group_override_pct, comm_cap_pct, comm_hardmax_pct
    INTO v_over, v_grp, v_cap, v_hardmax
    FROM public.commission_config WHERE id = 1;
  v_overlen := COALESCE(array_length(v_over, 1), 0);

  -- ── مندوب ميداني: نسبة المستوى ──
  IF v_seller.seller_type = 'field_rep' THEN
    SELECT base_pct INTO v_pct FROM public.rep_level_rules
      WHERE key = COALESCE(v_seller.rep_level, 'junior');
    v_pct := COALESCE(v_pct, 0);
    INSERT INTO public.commission_ledger
      (seller_id, order_id, source_seller_id, type, basis_amount, pct, amount, currency, month, note)
    VALUES
      (v_seller.id, p_order_id, v_seller.id, 'personal', v_amount, v_pct,
       round(v_amount * v_pct / 100, 2), v_cur, v_month,
       'مندوب — مستوى ' || COALESCE(v_seller.rep_level, 'junior'));

  -- ── مسوّقة MLM: شخصية + override + إشراف ──
  ELSIF v_seller.seller_type = 'marketer' THEN
    SELECT personal_pct INTO v_pct FROM public.mlm_rank_rules
      WHERE key = COALESCE(v_seller.mlm_rank, 'bronze');
    v_pct := LEAST(COALESCE(v_pct, 0), COALESCE(v_hardmax, 55));   -- سقف صارم
    INSERT INTO public.commission_ledger
      (seller_id, order_id, source_seller_id, type, basis_amount, pct, amount, currency, month, note)
    VALUES
      (v_seller.id, p_order_id, v_seller.id, 'personal', v_amount, v_pct,
       round(v_amount * v_pct / 100, 2), v_cur, v_month,
       'مسوّقة — رتبة ' || COALESCE(v_seller.mlm_rank, 'bronze'));

    -- override صعوداً في سلسلة recruiter بعمق طول مصفوفة override
    v_current := v_seller.recruiter_id;
    WHILE v_current IS NOT NULL AND v_depth <= v_overlen LOOP
      INSERT INTO public.commission_ledger
        (seller_id, order_id, source_seller_id, type, basis_amount, pct, amount, currency, month, note)
      VALUES
        (v_current, p_order_id, v_seller.id, 'team_override', v_amount, v_over[v_depth],
         round(v_amount * v_over[v_depth] / 100, 2), v_cur, v_month,
         'override مستوى ' || v_depth);
      SELECT recruiter_id INTO v_current FROM public.profiles WHERE id = v_current;
      v_depth := v_depth + 1;
    END LOOP;

    -- إشراف المجموعة → مشرفة مجموعة المسوّقة (إن وُجدت وليست هي نفسها)
    IF v_seller.group_id IS NOT NULL THEN
      INSERT INTO public.commission_ledger
        (seller_id, order_id, source_seller_id, type, basis_amount, pct, amount, currency, month, note)
      SELECT g.supervisor_id, p_order_id, v_seller.id, 'group_override', v_amount, v_grp,
             round(v_amount * v_grp / 100, 2), v_cur, v_month, 'إشراف المجموعة'
      FROM public.mlm_groups g
      WHERE g.id = v_seller.group_id
        AND g.supervisor_id IS NOT NULL
        AND g.supervisor_id <> v_seller.id;
    END IF;
  END IF;

  -- قفل الطلب (idempotency)
  UPDATE public.orders SET commission_locked = true WHERE id = p_order_id;

  -- تقدّم البائع: ترقية/نزول المستوى أو الرتبة + منح الأوسمة (مُعرّفة في p1b)
  PERFORM public.apply_seller_progress(v_seller.id, v_month);

  -- تحديث رصيد المحفظة لكل من تأثّر بهذا الطلب
  UPDATE public.profiles p
  SET wallet_balance =
      COALESCE((SELECT sum(amount) FROM public.commission_ledger l
                WHERE l.seller_id = p.id AND l.status = 'earned'), 0)
    - COALESCE((SELECT sum(amount) FROM public.withdrawals w
                WHERE w.seller_id = p.id AND w.status IN ('approved','paid')), 0)
  WHERE p.id IN (
    SELECT DISTINCT seller_id FROM public.commission_ledger WHERE order_id = p_order_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_order_commission(uuid) TO authenticated;

-- ── دالة مساعدة: كشف العمولة الشهري لبائع (مجمّع حسب النوع) ──
CREATE OR REPLACE FUNCTION public.commission_statement(p_seller uuid, p_month text)
RETURNS TABLE (type text, currency text, total numeric, rows_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT type, currency, sum(amount) AS total, count(*) AS rows_count
  FROM public.commission_ledger
  WHERE seller_id = p_seller AND month = p_month
  GROUP BY type, currency
  ORDER BY type;
$$;
GRANT EXECUTE ON FUNCTION public.commission_statement(uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- التحقق:
--   -- بعد تسليم طلب لمندوب field_rep:
--   SELECT type, pct, amount FROM commission_ledger WHERE order_id = '<uuid>';
--   SELECT wallet_balance FROM profiles WHERE id = '<seller>';
--   -- إعادة الاستدعاء يجب ألا يضيف صفوفاً (commission_locked):
--   SELECT public.post_order_commission('<uuid>');
-- ════════════════════════════════════════════════════════════════
