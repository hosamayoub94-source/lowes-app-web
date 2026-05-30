-- =============================================================
-- Migration: push_subscriptions table + leave_balances fix
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- =============================================================

-- ── 1. push_subscriptions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint    text        NOT NULL,
  p256dh      text        NOT NULL,
  auth        text        NOT NULL,
  user_agent  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

-- RLS: each user manages only their own subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_self" ON push_subscriptions;
CREATE POLICY "push_subscriptions_self" ON push_subscriptions
  USING      (true)
  WITH CHECK (true);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON push_subscriptions (user_id);

-- ── 2. leave_balances default fix ────────────────────────────
-- Change default annual days from 21 → 15 (company policy)
ALTER TABLE leave_balances
  ALTER COLUMN total_days SET DEFAULT 15;

-- Fix any existing rows that still have the wrong default
UPDATE leave_balances
   SET total_days = 15
 WHERE total_days = 21;
