-- ============================================================
-- Orders Table Migration
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market           TEXT NOT NULL CHECK (market IN ('syria', 'turkey')),
  order_id         TEXT UNIQUE,
  order_date       TIMESTAMPTZ DEFAULT NOW(),
  handler_name     TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','preparing','shipped','delivered','cancelled')),
  notes            TEXT,

  -- Customer
  customer_name    TEXT NOT NULL,
  phone_1          TEXT,
  phone_2          TEXT,
  wa_number        TEXT,
  city             TEXT,
  district         TEXT,      -- Turkey only
  address          TEXT,

  -- Financial
  amount           NUMERIC(10,2),
  currency         TEXT DEFAULT 'TRY' CHECK (currency IN ('TRY','SYP','USD')),
  payment_method   TEXT,
  payment_status   TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('paid','unpaid')),

  -- Shipping
  shipping_company TEXT,
  pickup_type      TEXT,
  tracking_number  TEXT,

  -- Products [{ "name": "FIRMING GEL", "qty": 2 }]
  items            JSONB DEFAULT '[]',

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_all" ON orders FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_orders_updated_at();

-- Index for fast queries
CREATE INDEX IF NOT EXISTS orders_market_idx  ON orders(market);
CREATE INDEX IF NOT EXISTS orders_status_idx  ON orders(status);
CREATE INDEX IF NOT EXISTS orders_handler_idx ON orders(handler_name);
CREATE INDEX IF NOT EXISTS orders_date_idx    ON orders(order_date DESC);

-- ============================================================
-- Seed: 6 test orders (3 Syria + 3 Turkey)
-- ============================================================
INSERT INTO orders (market, order_id, order_date, handler_name, status, customer_name, phone_1, city, address, amount, currency, payment_method, payment_status, shipping_company, notes, items) VALUES

-- Syria orders
('syria', '5SA-311', '2026-05-31 10:17:00+03', 'Raghad', 'delivered',
 'غيداء ياسين الحمصي', '0980865460', 'حمص', 'قدموس الحضارة',
 NULL, 'SYP', 'ضد الدفع', 'paid', 'شركة الكرم', NULL,
 '[{"name":"FIRMING GEL","qty":2},{"name":"WHITENING CREAM","qty":2},{"name":"Derma Roller 1mm","qty":1}]'),

('syria', '5SA-329', '2026-05-31 11:15:00+03', 'Haneen', 'delivered',
 'ايناس رضوان الطباع', '0991123514', 'دمشق', 'توصيل جرمانا',
 NULL, 'SYP', 'دفع عند الاستلام', 'paid', 'شركة الكرم', NULL,
 '[{"name":"FIRMING GEL","qty":1},{"name":"BREAST CARE SERUM","qty":1},{"name":"BREAST CARE CREAM","qty":1},{"name":"WHITENING CREAM","qty":1}]'),

('syria', '4SA-149', '2026-04-16 17:47:00+03', 'Rand', 'shipped',
 'عبدالقادر محمد المصيطف', '0996913844', 'حلب', 'الكرم حلب',
 NULL, 'SYP', 'واصل 200', 'paid', 'شركة الكرم', NULL,
 '[{"name":"ROSEMARY SHAMPOO","qty":1},{"name":"ROSEMARY WATER","qty":1},{"name":"ROSEMARY SERUM","qty":1},{"name":"Derma Roller 0.5mm","qty":1}]'),

-- Turkey orders
('turkey', '4S178', '2026-05-18 11:10:00+03', 'saly', 'shipped',
 'ghader boshnak', '5061033562', 'Adana', 'Sucuzade, Saydam Cd. No:100/A',
 1000, 'TRY', 'دفع عند الباب', 'unpaid', 'yurtiçi', NULL,
 '[{"name":"FIRMING GEL","qty":2},{"name":"DERMA ROLLER 1mm","qty":1}]'),

('turkey', '5S100', '2026-05-23 17:22:00+03', 'Rita', 'shipped',
 'IPTISEM MUHAMMED', '5396478293', 'Adana', 'ŞAKIRPAŞA MAH. 42153 SK',
 2200, 'TRY', 'دفع عند الباب', 'unpaid', 'yurtiçi', NULL,
 '[{"name":"Dark Spot Corrector Serum","qty":1},{"name":"Sunscreen","qty":2},{"name":"Cleanser","qty":1},{"name":"VITAMIN C SERUM","qty":1}]'),

('turkey', '5S105', '2026-05-26 18:23:00+03', 'Zina Suleiman', 'pending',
 'Muhammed Mustafa', '5383744187', NULL, NULL,
 1200, 'TRY', 'دفع عند الباب', 'unpaid', 'yurtiçi', NULL,
 '[{"name":"viagra 100","qty":3},{"name":"super viga black","qty":1}]')

ON CONFLICT (order_id) DO NOTHING;
