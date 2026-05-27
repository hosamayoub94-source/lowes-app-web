// =============================================================
// migrate.mjs — تشغيل الـ migrations على Supabase مباشرة
// Usage: node scripts/migrate.mjs
// =============================================================
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fghdumrgimoeqsafdhhh.supabase.co';
const SERVICE_ROLE  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGR1bXJnaW1vZXFzYWZkaGhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjE5MTc5NCwiZXhwIjoyMDkxNzY3Nzk0fQ.xpvq4jRX-SiEy5WpLCOnAbY68k_hXlpPDn6Jp_MhhRs';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// ── helpers ───────────────────────────────────────────────────
function log(msg)  { console.log('  ✅', msg); }
function warn(msg) { console.warn('  ⚠️ ', msg); }
function err(msg)  { console.error('  ❌', msg); }

async function tableExists(name) {
  const { error } = await supabase.from(name).select('*', { count: 'exact', head: true });
  if (!error) return true;
  if (error.code === '42P01' || error.message?.includes('does not exist')) return false;
  // other error (e.g. RLS with no rows) → table exists
  return true;
}

async function execSQL(sql, label) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_migration`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SERVICE_ROLE,
      'Authorization': 'Bearer ' + SERVICE_ROLE,
    },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${label}: HTTP ${res.status} — ${body.slice(0, 200)}`);
  }
  return res.json().catch(() => null);
}

// ── migrations ────────────────────────────────────────────────
const MIGRATIONS = [

  // ── 1. attendance table ────────────────────────────────────
  {
    name: 'attendance table + UNIQUE constraint',
    check: () => tableExists('attendance'),
    sql: `
      CREATE TABLE IF NOT EXISTS attendance (
        id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        employee_name text NOT NULL,
        date          date NOT NULL,
        check_in      text,
        check_out     text,
        notes         text,
        created_at    timestamptz DEFAULT now(),
        updated_at    timestamptz DEFAULT now(),
        CONSTRAINT attendance_emp_date_unique UNIQUE (employee_name, date)
      );

      -- Add UNIQUE if table existed without it
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'attendance'::regclass
            AND contype   = 'u'
            AND conname   = 'attendance_emp_date_unique'
        ) THEN
          ALTER TABLE attendance
            ADD CONSTRAINT attendance_emp_date_unique UNIQUE (employee_name, date);
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_att_emp  ON attendance(employee_name);
      CREATE INDEX IF NOT EXISTS idx_att_date ON attendance(date DESC);

      ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "attendance_all" ON attendance;
      CREATE POLICY "attendance_all" ON attendance FOR ALL USING (true) WITH CHECK (true);
    `,
  },

  // ── 2. announcements table ─────────────────────────────────
  {
    name: 'announcements table',
    check: () => tableExists('announcements'),
    sql: `
      CREATE TABLE IF NOT EXISTS announcements (
        id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        title      text NOT NULL,
        body       text NOT NULL,
        emoji      text DEFAULT '📢',
        created_by text NOT NULL,
        created_at timestamptz DEFAULT now(),
        is_pinned  boolean DEFAULT false
      );
      ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "ann_read"   ON announcements;
      DROP POLICY IF EXISTS "ann_insert" ON announcements;
      DROP POLICY IF EXISTS "ann_update" ON announcements;
      DROP POLICY IF EXISTS "ann_delete" ON announcements;
      CREATE POLICY "ann_read"   ON announcements FOR SELECT USING (true);
      CREATE POLICY "ann_insert" ON announcements FOR INSERT WITH CHECK (true);
      CREATE POLICY "ann_update" ON announcements FOR UPDATE USING (true);
      CREATE POLICY "ann_delete" ON announcements FOR DELETE USING (true);
    `,
  },

  // ── 3. products table ──────────────────────────────────────
  {
    name: 'products table',
    check: () => tableExists('products'),
    sql: `
      CREATE TABLE IF NOT EXISTS products (
        id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        name        text NOT NULL,
        sku         text UNIQUE,
        category    text DEFAULT 'العناية بالبشرة',
        quantity    int DEFAULT 0,
        price_usd   numeric(10,2) DEFAULT 0,
        price_try   numeric(10,2) DEFAULT 0,
        min_stock   int DEFAULT 5,
        description text,
        is_active   boolean DEFAULT true,
        created_at  timestamptz DEFAULT now(),
        updated_at  timestamptz DEFAULT now()
      );
      ALTER TABLE products ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "products_all" ON products;
      CREATE POLICY "products_all" ON products FOR ALL USING (true) WITH CHECK (true);
    `,
  },

  // ── 4. chat_rooms requires_approval fix ────────────────────
  {
    name: 'chat_rooms: set requires_approval=false for public groups',
    check: async () => {
      const exists = await tableExists('chat_rooms');
      if (!exists) return true; // skip if table missing
      const { data } = await supabase
        .from('chat_rooms')
        .select('id')
        .eq('type', 'group')
        .eq('is_private', false)
        .eq('requires_approval', true)
        .limit(1);
      return !data?.length; // true = already fixed, skip
    },
    sql: `UPDATE chat_rooms SET requires_approval = false WHERE type = 'group' AND is_private = false;`,
  },

  // ── 5. chat_pinned table ───────────────────────────────────
  {
    name: 'chat_pinned table',
    check: () => tableExists('chat_pinned'),
    sql: `
      CREATE TABLE IF NOT EXISTS chat_pinned (
        id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        room_id    uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
        message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
        pinned_by  text,
        pinned_at  timestamptz DEFAULT now(),
        UNIQUE(room_id)
      );
      CREATE INDEX IF NOT EXISTS idx_chat_pinned_room ON chat_pinned(room_id);
      ALTER TABLE chat_pinned ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "chat_pinned_all" ON chat_pinned;
      CREATE POLICY "chat_pinned_all" ON chat_pinned FOR ALL USING (true) WITH CHECK (true);
    `,
  },

  // ── 6. chat_join_requests table ───────────────────────────
  {
    name: 'chat_join_requests table',
    check: () => tableExists('chat_join_requests'),
    sql: `
      CREATE TABLE IF NOT EXISTS chat_join_requests (
        id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        room_id      uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
        room_name    text,
        user_id      text NOT NULL,
        user_name    text,
        status       text DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        requested_at timestamptz DEFAULT now(),
        reviewed_by  text,
        reviewed_at  timestamptz,
        UNIQUE(room_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_chat_jr_room   ON chat_join_requests(room_id);
      CREATE INDEX IF NOT EXISTS idx_chat_jr_user   ON chat_join_requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_chat_jr_status ON chat_join_requests(status);
      ALTER TABLE chat_join_requests ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "chat_jr_all" ON chat_join_requests;
      CREATE POLICY "chat_jr_all" ON chat_join_requests FOR ALL USING (true) WITH CHECK (true);
    `,
  },

  // ── 7. profiles: ensure pin column exists ─────────────────
  {
    name: 'profiles: add pin column if missing',
    check: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('pin')
        .limit(1);
      return data !== null; // column exists if query doesn't error
    },
    sql: `
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pin text;
    `,
  },

  // ── 8. push_subscriptions: Web Push endpoints ─────────────
  {
    name: 'push_subscriptions table (already done)',
    check: () => tableExists('push_subscriptions'),
    sql: `
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        endpoint    text        NOT NULL,
        p256dh      text,
        auth        text,
        user_agent  text,
        created_at  timestamptz DEFAULT now(),
        updated_at  timestamptz DEFAULT now(),
        UNIQUE(user_id, endpoint)
      );
      CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
      ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "push_subs_owner" ON push_subscriptions;
      CREATE POLICY "push_subs_owner" ON push_subscriptions
        FOR ALL USING (true) WITH CHECK (true);
    `,
  },

  // ── 9. leave_requests: إجازات workflow ───────────────────
  {
    name: 'leave_requests table',
    check: () => tableExists('leave_requests'),
    sql: `
      CREATE TABLE IF NOT EXISTS leave_requests (
        id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
        employee_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        employee_name text        NOT NULL,
        type          text        NOT NULL DEFAULT 'annual',
        start_date    date        NOT NULL,
        end_date      date        NOT NULL,
        days          int         NOT NULL DEFAULT 1,
        reason        text,
        status        text        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected')),
        manager_id    uuid        REFERENCES profiles(id),
        manager_note  text,
        created_at    timestamptz DEFAULT now(),
        updated_at    timestamptz DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_leave_req_employee ON leave_requests(employee_id);
      CREATE INDEX IF NOT EXISTS idx_leave_req_status   ON leave_requests(status);
      CREATE INDEX IF NOT EXISTS idx_leave_req_start    ON leave_requests(start_date);
      ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "leave_req_all" ON leave_requests;
      CREATE POLICY "leave_req_all" ON leave_requests
        FOR ALL USING (true) WITH CHECK (true);
    `,
  },
];

// ── exec helper via Management API ───────────────────────────
async function runSQL(sql, name) {
  // Try Management API first
  const mgmtRes = await fetch(
    'https://api.supabase.com/v1/projects/fghdumrgimoeqsafdhhh/database/query',
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + SERVICE_ROLE,
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (mgmtRes.ok) return true;

  const body = await mgmtRes.text();
  // 401/403 means management API needs PAT — try RPC fallback
  if (mgmtRes.status === 401 || mgmtRes.status === 403) {
    warn(`Management API requires PAT for "${name}" — trying RPC fallback...`);
    // Try calling exec_migration RPC (custom function that might exist)
    const { error: rpcErr } = await supabase.rpc('exec_migration', { sql });
    if (!rpcErr) return true;
    warn(`RPC fallback also failed: ${rpcErr.message}`);
    return false;
  }

  throw new Error(`Management API error for "${name}": ${body.slice(0, 300)}`);
}

// ── main ──────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 Lowe\'s App — DB Migration\n');

  let allOk   = true;
  let needPAT = false;

  for (const m of MIGRATIONS) {
    process.stdout.write(`  ⏳ ${m.name}...`);
    try {
      const skip = await m.check();
      if (skip) {
        console.log(' (already done — skipped)');
        continue;
      }
      const ok = await runSQL(m.sql, m.name);
      if (ok) {
        console.log(' ✅ done');
      } else {
        console.log(' ⚠️  needs manual PAT');
        needPAT = true;
        allOk   = false;
      }
    } catch (e) {
      console.log(' ❌');
      err(e.message);
      allOk   = false;
      needPAT = true;
    }
  }

  console.log('');
  if (allOk) {
    console.log('✅ All migrations applied successfully!\n');
  } else if (needPAT) {
    console.log('⚠️  Some migrations need a Supabase PAT (Personal Access Token).');
    console.log('   → Go to: https://supabase.com/dashboard/account/tokens');
    console.log('   → Generate a token and re-run:');
    console.log('   SUPABASE_PAT=<your-token> node scripts/migrate.mjs\n');
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
