// =============================================================
// migrate.js — Supabase migration runner
// Usage: node scripts/migrate.js
// =============================================================
const { Client } = require('pg');

const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE5MTc5NCwiZXhwIjoyMDkxNzY3Nzk0fQ.xpvq4jRX-SiEy5WpLCOnAbY68k_hXlpPDn6Jp_MhhRs';
const REF = 'fghdumrgimoeqsafdhhh';

// Connection configs to try in order
const CONFIGS = [
  // Pooler Session mode – JWT as password
  {
    host: 'aws-0-ap-northeast-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: `postgres.${REF}`,
    password: SERVICE_ROLE,
    ssl: { rejectUnauthorized: false },
  },
  // Pooler Transaction mode
  {
    host: 'aws-0-ap-northeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: `postgres.${REF}`,
    password: SERVICE_ROLE,
    ssl: { rejectUnauthorized: false },
  },
  // Direct connection
  {
    host: `db.${REF}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: SERVICE_ROLE,
    ssl: { rejectUnauthorized: false },
  },
];

// ── Migrations ─────────────────────────────────────────────────
const MIGRATIONS = [
  {
    name: 'products table',
    sql: `
CREATE TABLE IF NOT EXISTS products (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sku         text NOT NULL,
  name        text NOT NULL,
  name_ar     text,
  category    text,
  quantity    int     DEFAULT 0,
  price_usd   numeric(10,2) DEFAULT 0,
  price_try   numeric(10,2) DEFAULT 0,
  min_stock   int     DEFAULT 5,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_sku_key') THEN
    ALTER TABLE products ADD CONSTRAINT products_sku_key UNIQUE (sku);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_products_cat    ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
    `,
  },
  {
    name: 'employee_badges table',
    sql: `
CREATE TABLE IF NOT EXISTS employee_badges (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_name text NOT NULL,
  badge_type    text NOT NULL,
  month_year    text NOT NULL,
  earned_at     timestamptz DEFAULT now(),
  UNIQUE(employee_name, badge_type, month_year)
);
CREATE INDEX IF NOT EXISTS idx_eb_emp ON employee_badges(employee_name);
    `,
  },
  {
    name: 'profiles birthday + hire_date columns',
    sql: `
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS birthday  date,
  ADD COLUMN IF NOT EXISTS hire_date date;
    `,
  },
  {
    name: 'chat_rooms table',
    sql: `
CREATE TABLE IF NOT EXISTS chat_rooms (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  type        text NOT NULL DEFAULT 'group' CHECK (type IN ('group','dm')),
  created_by  text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cr_type ON chat_rooms(type);
    `,
  },
  {
    name: 'chat_room_members table',
    sql: `
CREATE TABLE IF NOT EXISTS chat_room_members (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id     uuid REFERENCES chat_rooms(id) ON DELETE CASCADE,
  member_name text NOT NULL,
  joined_at   timestamptz DEFAULT now(),
  UNIQUE(room_id, member_name)
);
CREATE INDEX IF NOT EXISTS idx_crm_room   ON chat_room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_crm_member ON chat_room_members(member_name);
    `,
  },
  {
    name: 'chat_messages table',
    sql: `
CREATE TABLE IF NOT EXISTS chat_messages (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id      uuid REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_name  text NOT NULL,
  content      text,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','voice','file')),
  file_url     text,
  file_name    text,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cm_room    ON chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_cm_created ON chat_messages(created_at DESC);
    `,
  },
  {
    name: 'task_points trigger for auto-award',
    sql: `
CREATE OR REPLACE FUNCTION award_task_points()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE pts int := 8;
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    IF NEW.due_date IS NOT NULL AND NEW.completed_at IS NOT NULL
       AND NEW.completed_at::date <= NEW.due_date THEN
      pts := 15;
    END IF;
    INSERT INTO task_points (employee_name, task_id, points, reason)
    VALUES (
      NEW.assigned_to, NEW.id, pts,
      CASE WHEN pts = 15 THEN 'مهمة منجزة في الوقت' ELSE 'مهمة منجزة' END
    )
    ON CONFLICT DO NOTHING;
    UPDATE profiles
      SET total_points = COALESCE(total_points, 0) + pts
    WHERE employee_name = NEW.assigned_to;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_task_points ON tasks;
CREATE TRIGGER trg_task_points
  AFTER UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION award_task_points();
    `,
  },
  {
    name: 'admin_reset_pin SECURITY DEFINER function',
    sql: `
CREATE OR REPLACE FUNCTION admin_reset_pin(
  target_employee_name text,
  new_pin text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  target_id   uuid;
  synth_email text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role_type IN ('admin','manager')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT id INTO target_id FROM profiles
    WHERE employee_name = target_employee_name LIMIT 1;
  IF target_id IS NULL THEN RETURN false; END IF;
  synth_email := target_id::text || '@auth.lowes-pro.local';
  UPDATE auth.users
    SET encrypted_password = crypt('lp:' || new_pin, gen_salt('bf', 10))
  WHERE email = synth_email;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION admin_reset_pin FROM public;
GRANT EXECUTE ON FUNCTION admin_reset_pin TO authenticated;
    `,
  },
];

// ── Runner ─────────────────────────────────────────────────────
async function tryConnect() {
  for (const cfg of CONFIGS) {
    const client = new Client({ ...cfg, connectionTimeoutMillis: 8000 });
    try {
      await client.connect();
      const r = await client.query('SELECT current_user');
      console.log(`✅ Connected as: ${r.rows[0].current_user} (${cfg.host}:${cfg.port})`);
      return client;
    } catch (e) {
      console.log(`⚠️  ${cfg.host}:${cfg.port} → ${e.message}`);
      try { await client.end(); } catch {}
    }
  }
  return null;
}

async function main() {
  console.log('🚀 Supabase Migration Runner\n');

  const client = await tryConnect();
  if (!client) {
    console.error('\n❌ Could not connect to database with any config.');
    console.error('   Need: database password from Supabase Dashboard → Project Settings → Database');
    process.exit(1);
  }

  let passed = 0, failed = 0;
  for (const m of MIGRATIONS) {
    process.stdout.write(`  → ${m.name}... `);
    try {
      await client.query(m.sql);
      console.log('✅');
      passed++;
    } catch (e) {
      console.log(`❌ ${e.message}`);
      failed++;
    }
  }

  await client.end();
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) console.log('🎉 All migrations complete!');
}

main().catch(e => { console.error(e); process.exit(1); });
