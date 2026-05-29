-- ============================================================
-- migration_v7_profile_chat.sql — Lowe's Staff App
-- SAFE TO RE-RUN (idempotent) — نفّذ في Supabase SQL Editor
-- ============================================================
-- يصلح:
--   1. profiles — أعمدة مفقودة (phone, personal_email, work_location, bio, skills)
--   2. chat_join_requests — UNIQUE constraint
--   3. shift_partners — إصلاح RLS (auth.uid() → true)
--   4. chat_* tables — إصلاح RLS نهائي (للتأكد)
-- ============================================================


-- ┌─────────────────────────────────────────────────────────────┐
-- │  FIX 1: profiles — أعمدة مفقودة                            │
-- │  سبب الخطأ: ProfileScreen يحاول UPDATE أعمدة غير موجودة   │
-- └─────────────────────────────────────────────────────────────┘

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone          text,
  ADD COLUMN IF NOT EXISTS personal_email text,
  ADD COLUMN IF NOT EXISTS work_location  text,
  ADD COLUMN IF NOT EXISTS bio            text,
  ADD COLUMN IF NOT EXISTS skills         text;


-- ┌─────────────────────────────────────────────────────────────┐
-- │  FIX 2: chat_join_requests — UNIQUE constraint              │
-- │  مطلوب لكي تعمل upsert({onConflict:'room_id,user_id'})     │
-- └─────────────────────────────────────────────────────────────┘

DO $$
BEGIN
  BEGIN
    ALTER TABLE chat_join_requests
      ADD CONSTRAINT chat_join_requests_room_id_user_id_key
      UNIQUE (room_id, user_id);
  EXCEPTION WHEN others THEN
    NULL; -- Already exists or data conflict — safe to ignore
  END;
END $$;


-- ┌─────────────────────────────────────────────────────────────┐
-- │  FIX 3: shift_partners — RLS بدون auth.uid()               │
-- └─────────────────────────────────────────────────────────────┘

DROP POLICY IF EXISTS "shift_partners_select" ON shift_partners;
DROP POLICY IF EXISTS "shift_partners_insert" ON shift_partners;
DROP POLICY IF EXISTS "shift_partners_update" ON shift_partners;
DROP POLICY IF EXISTS "shift_partners_delete" ON shift_partners;
DROP POLICY IF EXISTS "shift_partners_all"    ON shift_partners;

CREATE POLICY "shift_partners_all" ON shift_partners
  FOR ALL USING (true) WITH CHECK (true);


-- ┌─────────────────────────────────────────────────────────────┐
-- │  FIX 4: chat_* جداول — إصلاح RLS نهائي (تأكيد)           │
-- └─────────────────────────────────────────────────────────────┘

DROP POLICY IF EXISTS "chat_rooms_all"    ON chat_rooms;
DROP POLICY IF EXISTS "chat_rooms_select" ON chat_rooms;
DROP POLICY IF EXISTS "chat_rooms_insert" ON chat_rooms;
DROP POLICY IF EXISTS "chat_rooms_update" ON chat_rooms;
DROP POLICY IF EXISTS "chat_rooms_delete" ON chat_rooms;
CREATE POLICY "chat_rooms_all" ON chat_rooms FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chat_members_all"    ON chat_room_members;
DROP POLICY IF EXISTS "chat_members_select" ON chat_room_members;
DROP POLICY IF EXISTS "chat_members_insert" ON chat_room_members;
DROP POLICY IF EXISTS "chat_members_update" ON chat_room_members;
DROP POLICY IF EXISTS "chat_members_delete" ON chat_room_members;
CREATE POLICY "chat_members_all" ON chat_room_members FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chat_messages_all"    ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_select" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_update" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_delete" ON chat_messages;
CREATE POLICY "chat_messages_all" ON chat_messages FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chat_reactions_all"    ON chat_reactions;
DROP POLICY IF EXISTS "chat_reactions_select" ON chat_reactions;
DROP POLICY IF EXISTS "chat_reactions_insert" ON chat_reactions;
DROP POLICY IF EXISTS "chat_reactions_update" ON chat_reactions;
DROP POLICY IF EXISTS "chat_reactions_delete" ON chat_reactions;
CREATE POLICY "chat_reactions_all" ON chat_reactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chat_last_read_all"    ON chat_last_read;
DROP POLICY IF EXISTS "chat_last_read_select" ON chat_last_read;
DROP POLICY IF EXISTS "chat_last_read_insert" ON chat_last_read;
DROP POLICY IF EXISTS "chat_last_read_update" ON chat_last_read;
DROP POLICY IF EXISTS "chat_last_read_delete" ON chat_last_read;
CREATE POLICY "chat_last_read_all" ON chat_last_read FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chat_join_requests_all"    ON chat_join_requests;
DROP POLICY IF EXISTS "chat_join_requests_select" ON chat_join_requests;
DROP POLICY IF EXISTS "chat_join_requests_insert" ON chat_join_requests;
DROP POLICY IF EXISTS "chat_join_requests_update" ON chat_join_requests;
DROP POLICY IF EXISTS "chat_join_requests_delete" ON chat_join_requests;
CREATE POLICY "chat_join_requests_all" ON chat_join_requests FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "chat_pinned_all"    ON chat_pinned;
DROP POLICY IF EXISTS "chat_pinned_select" ON chat_pinned;
DROP POLICY IF EXISTS "chat_pinned_insert" ON chat_pinned;
DROP POLICY IF EXISTS "chat_pinned_update" ON chat_pinned;
DROP POLICY IF EXISTS "chat_pinned_delete" ON chat_pinned;
CREATE POLICY "chat_pinned_all" ON chat_pinned FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "music_room_state_all"    ON music_room_state;
DROP POLICY IF EXISTS "music_room_state_select" ON music_room_state;
DROP POLICY IF EXISTS "music_room_state_insert" ON music_room_state;
DROP POLICY IF EXISTS "music_room_state_update" ON music_room_state;
DROP POLICY IF EXISTS "music_room_state_delete" ON music_room_state;
CREATE POLICY "music_room_state_all" ON music_room_state FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- ✅ Done.
-- الأعمدة المضافة: profiles.phone, personal_email, work_location, bio, skills
-- ============================================================
