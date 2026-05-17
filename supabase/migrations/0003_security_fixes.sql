-- =============================================================
-- Security Fixes Migration — Apply AFTER 0001 and 0002
-- Safe to re-run: all statements use DROP IF EXISTS / IF NOT EXISTS
-- Addresses all HIGH/MEDIUM risks from schema verification 2026-05-18
-- =============================================================

-- ── 0. Revoke profiles.pin from clients (if not done by 0002) ─────
-- REVOKE is idempotent — safe to run multiple times.
REVOKE SELECT (pin) ON public.profiles FROM anon, authenticated;

-- ── 1. CRM — Fix over-permissive write policies ────────────────────
--
-- READ  = any authenticated user (shared team pipeline — intentional)
-- WRITE = only owner/assigned_to or admin/manager role
--
-- customers
DROP POLICY IF EXISTS "customers_select"  ON public.customers;
DROP POLICY IF EXISTS "customers_write"   ON public.customers;

CREATE POLICY "customers_select"
  ON public.customers FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "customers_insert"
  ON public.customers FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "customers_update"
  ON public.customers FOR UPDATE
  USING (
    auth.uid() = owner_id
    OR auth.uid() = assigned_to
    OR public.current_role_type() IN ('admin', 'manager', 'sales_manager')
  );

CREATE POLICY "customers_delete"
  ON public.customers FOR DELETE
  USING (
    auth.uid() = owner_id
    OR public.current_role_type() IN ('admin', 'manager', 'sales_manager')
  );

-- customer_contacts
DROP POLICY IF EXISTS "contacts_all" ON public.customer_contacts;

CREATE POLICY "contacts_select"
  ON public.customer_contacts FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "contacts_insert"
  ON public.customer_contacts FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "contacts_update"
  ON public.customer_contacts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_id
        AND (c.owner_id = auth.uid() OR c.assigned_to = auth.uid()
             OR public.current_role_type() IN ('admin','manager','sales_manager'))
    )
  );

CREATE POLICY "contacts_delete"
  ON public.customer_contacts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_id
        AND (c.owner_id = auth.uid()
             OR public.current_role_type() IN ('admin','manager','sales_manager'))
    )
  );

-- leads
DROP POLICY IF EXISTS "leads_select" ON public.leads;
DROP POLICY IF EXISTS "leads_write"  ON public.leads;

CREATE POLICY "leads_select"
  ON public.leads FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "leads_insert"
  ON public.leads FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "leads_update"
  ON public.leads FOR UPDATE
  USING (
    auth.uid() = owner_id
    OR auth.uid() = assigned_to
    OR public.current_role_type() IN ('admin', 'manager', 'sales_manager')
  );

CREATE POLICY "leads_delete"
  ON public.leads FOR DELETE
  USING (
    auth.uid() = owner_id
    OR public.current_role_type() IN ('admin', 'manager', 'sales_manager')
  );

-- pipelines
DROP POLICY IF EXISTS "pipelines_select" ON public.pipelines;
DROP POLICY IF EXISTS "pipelines_write"  ON public.pipelines;

CREATE POLICY "pipelines_select"
  ON public.pipelines FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "pipelines_write"
  ON public.pipelines FOR ALL
  USING (
    auth.uid() = owner_id
    OR public.current_role_type() IN ('admin', 'manager', 'sales_manager')
  );

-- pipeline_stages
DROP POLICY IF EXISTS "stages_select" ON public.pipeline_stages;
DROP POLICY IF EXISTS "stages_write"  ON public.pipeline_stages;

CREATE POLICY "stages_select"
  ON public.pipeline_stages FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "stages_write"
  ON public.pipeline_stages FOR ALL
  USING (
    public.current_role_type() IN ('admin', 'manager', 'sales_manager')
  );

-- deals
DROP POLICY IF EXISTS "deals_select" ON public.deals;
DROP POLICY IF EXISTS "deals_write"  ON public.deals;

CREATE POLICY "deals_select"
  ON public.deals FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "deals_insert"
  ON public.deals FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "deals_update"
  ON public.deals FOR UPDATE
  USING (
    auth.uid() = owner_id
    OR auth.uid() = assigned_to
    OR public.current_role_type() IN ('admin', 'manager', 'sales_manager')
  );

CREATE POLICY "deals_delete"
  ON public.deals FOR DELETE
  USING (
    auth.uid() = owner_id
    OR public.current_role_type() IN ('admin', 'manager', 'sales_manager')
  );

-- deal_activities
DROP POLICY IF EXISTS "activities_all" ON public.deal_activities;

CREATE POLICY "activities_select"
  ON public.deal_activities FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "activities_insert"
  ON public.deal_activities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "activities_update"
  ON public.deal_activities FOR UPDATE
  USING (auth.uid() = user_id OR public.current_role_type() = 'admin');

CREATE POLICY "activities_delete"
  ON public.deal_activities FOR DELETE
  USING (auth.uid() = user_id OR public.current_role_type() = 'admin');

-- followups
DROP POLICY IF EXISTS "followups_select" ON public.followups;
DROP POLICY IF EXISTS "followups_write"  ON public.followups;

CREATE POLICY "followups_select"
  ON public.followups FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "followups_insert"
  ON public.followups FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "followups_update"
  ON public.followups FOR UPDATE
  USING (
    auth.uid() = assigned_to
    OR auth.uid() = owner_id
    OR public.current_role_type() IN ('admin', 'manager', 'sales_manager')
  );

CREATE POLICY "followups_delete"
  ON public.followups FOR DELETE
  USING (
    auth.uid() = owner_id
    OR public.current_role_type() IN ('admin', 'manager', 'sales_manager')
  );

-- sales_notes
DROP POLICY IF EXISTS "notes_all" ON public.sales_notes;

CREATE POLICY "notes_select"
  ON public.sales_notes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "notes_insert"
  ON public.sales_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notes_update"
  ON public.sales_notes FOR UPDATE
  USING (auth.uid() = user_id OR public.current_role_type() = 'admin');

CREATE POLICY "notes_delete"
  ON public.sales_notes FOR DELETE
  USING (auth.uid() = user_id OR public.current_role_type() = 'admin');

-- ── 2. Attendance — add manager read policy ────────────────────────
DROP POLICY IF EXISTS "attendance_select_manager" ON public.attendance_records;

CREATE POLICY "attendance_select_manager"
  ON public.attendance_records FOR SELECT
  USING (
    -- Own records always visible
    auth.uid() = user_id
    -- Admin sees everything
    OR public.current_role_type() = 'admin'
    -- Manager sees their team's attendance
    OR (
      public.current_role_type() IN ('manager', 'sales_manager', 'social_manager')
      AND EXISTS (
        SELECT 1 FROM public.profiles emp
        WHERE emp.id = user_id
          AND emp.team = public.current_team()
      )
    )
  );

-- Drop the old own-only select policy to avoid conflict
DROP POLICY IF EXISTS "attendance_select_own" ON public.attendance_records;

-- ── 3. Attendance — enable realtime (idempotent) ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'attendance_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'break_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.break_sessions;
  END IF;
END $$;

-- ── 4. activity_logs — enable realtime (idempotent) ───────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'activity_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
  END IF;
END $$;

-- ── 5. Storage bucket RLS — files bucket ──────────────────────────
-- Owner can read/write their own files only.
-- The folder structure is: <bucket>/users/<user_id>/<filename>
-- OR: <bucket>/<user_id>/<filename>   (check fileService storage_path format)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'files_bucket_owner_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "files_bucket_owner_all"
        ON storage.objects FOR ALL
        USING (
          bucket_id = 'files'
          AND auth.uid()::text = (storage.foldername(name))[1]
        )
        WITH CHECK (
          bucket_id = 'files'
          AND auth.uid()::text = (storage.foldername(name))[1]
        );
    $policy$;
  END IF;
END $$;

-- Allow any authenticated user to read files shared with them
-- (via file_shares table — token or direct share)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'files_bucket_shared_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "files_bucket_shared_read"
        ON storage.objects FOR SELECT
        USING (
          bucket_id = 'files'
          AND EXISTS (
            SELECT 1 FROM public.file_shares fs
            JOIN public.files f ON f.storage_path = storage.objects.name
            WHERE fs.file_id = f.id
              AND fs.shared_with = auth.uid()
              AND (fs.expires_at IS NULL OR fs.expires_at > NOW())
          )
        );
    $policy$;
  END IF;
END $$;

-- ── 6. Verification queries — run to confirm ──────────────────────
-- These are comment-only; copy and run in SQL editor to verify.
--
-- Check RLS is enabled on all CRM tables:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('leads','deals','customers','customer_contacts',
--                     'deal_activities','followups','sales_notes',
--                     'attendance_records','notifications','activity_logs',
--                     'files','profiles');
--
-- Check all policies on CRM tables:
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('leads','deals','customers')
-- ORDER BY tablename, policyname;
--
-- Check realtime publications:
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime'
-- ORDER BY tablename;
--
-- Check storage policies:
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects';
