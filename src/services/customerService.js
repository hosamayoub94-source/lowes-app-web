// =============================================================
// customerService — customer intelligence over the orders table.
// Reads the `customer_stats` view (keyed by normalized phone).
// Powers: repeat-customer detection, cross-seller history, VIP tiers.
// =============================================================
import { supabase } from './supabase';

// Turkey archive used short / differently-spelled seller names before the app
// introduced full profile names. Map full profile name (lowercase) → archive variants.
const SELLER_ALIASES = {
  'khedr alnisafe':  ['khder', 'Khder', 'khedr'],
  'zina sulyman':    ['Zina', 'zina', 'ZINA'],
  'arwa mohammed':   ['ARWA', 'Arwa', 'arwa'],
  'sarah alasaad':   ['sara h', 'Sara h', 'Sara H', 'SARA H'],
  'sarah ibrahim':   ['sara', 'Sara', 'SARA'],
  'hla al namra':    ['HLA NM', 'Hla NM', 'hla nm', 'Hla', 'hla'],
  // 'hassna ???':   ['hassna', 'Hassna'],  ← add full profile name when known
};

/** Returns all archive alias names for a given profile full name. */
export function getSellerAliases(userName) {
  if (!userName) return [];
  const key = String(userName).trim().toLowerCase();
  return SELLER_ALIASES[key] || [];
}

// Normalize a phone to digits-only (must match the view's phone_key).
export function phoneKey(phone) {
  return String(phone || '').replace(/\D/g, '');
}

// Look up a single customer by phone. Returns null if not found / too short.
export async function lookupCustomer(phone) {
  const key = phoneKey(phone);
  if (key.length < 6) return null; // ignore partial typing
  const { data, error } = await supabase
    .from('customer_stats')
    .select('*')
    .eq('phone_key', key)
    .maybeSingle();
  if (error) return null;
  return data;
}

// List customers for the /customers screen. Optional search (name/phone)
// and vipOnly filter. Sorted by orders_count desc.
const SORTS = {
  orders: { col: 'orders_count', asc: false },
  recent: { col: 'last_order',   asc: false },
  oldest: { col: 'first_order',  asc: true  },
  name:   { col: 'name',         asc: true  },
};

export async function listCustomers({ search = '', vipOnly = false, sellerName = null, sellerNames = null, market = null, brand = null, sort = 'orders', limit = 100 } = {}) {
  const s = SORTS[sort] || SORTS.orders;
  let q = supabase
    .from('customer_stats')
    .select('*')
    .order(s.col, { ascending: s.asc, nullsFirst: false })
    .limit(limit);
  if (vipOnly) q = q.gte('stars', 1);
  // «my customers» — match any of the name variants server-side (archive uses
  // short names, profiles use full names), so ALL their customers are returned.
  if (sellerNames && sellerNames.length) {
    q = q.or(sellerNames.map((n) => `sellers.cs.{"${String(n).replace(/"/g, '')}"}`).join(','));
  } else if (sellerName) {
    q = q.contains('sellers', [sellerName]);
  }
  // Archive sections: filter by market and/or brand (arrays on the view).
  if (market) q = q.contains('markets', [market]);
  if (brand)  q = q.contains('brands', [brand]);
  if (search) {
    const s = search.trim();
    const digits = phoneKey(s);
    if (digits.length >= 3) q = q.ilike('phone_key', `%${digits}%`);
    else q = q.ilike('name', `%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// True total count for a section (server-side, no row fetch).
export async function countCustomers({ market = null, brand = null } = {}) {
  let q = supabase.from('customer_stats').select('phone_key', { count: 'exact', head: true });
  if (market) q = q.contains('markets', [market]);
  if (brand)  q = q.contains('brands', [brand]);
  const { count } = await q;
  return count ?? 0;
}

// WhatsApp deep link for a customer phone, country code by market.
// Optional prefilled text (the seller can still edit before sending).
export function customerWaLink(phone, market, text) {
  const digits = phoneKey(phone);
  if (!digits) return null;
  const local = digits.replace(/^0+/, '');
  const cc = market === 'turkey' ? '90' : '963';
  const full = local.startsWith(cc) ? local : cc + local;
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${full}${q}`;
}

// A friendly, editable follow-up message template (retention marketing).
export function followupMessage(customerName, sellerName) {
  const n = customerName && customerName !== 'عميل' ? ` ${customerName}` : '';
  return `مرحباً${n} 🌿\nمعك${sellerName ? ' ' + sellerName : ''} من Lowe's Professional.\nحبيت أطمئن على تجربتك مع منتجاتنا 💚 وإذا احتجتي أي نصيحة للعناية ببشرتك أنا بخدمتك.\nعندنا وصل جديد وعروض مميزة — حابة أرشّحلك اللي يناسبك؟`;
}

// Fuzzy seller-name match: archive uses short names ("Haneen"), profiles
// use full names ("Haneen Mohamad"). Match on full equality, first token,
// or known Turkey-archive aliases (SELLER_ALIASES above).
export function sellerMatches(sellers, userName) {
  if (!userName || !Array.isArray(sellers)) return false;
  const norm = (s) => String(s || '').trim().toLowerCase();
  const u = norm(userName);
  const uFirst = u.split(/\s+/)[0];
  const aliases = getSellerAliases(userName).map(norm);
  return sellers.some((s) => {
    const a = norm(s);
    if (!a) return false;
    return a === u || a.includes(u) || u.includes(a) || a.split(/\s+/)[0] === uFirst || aliases.includes(a);
  });
}

// ── Customer notes (remember the customer) ────────────────────
export async function getNotes(phoneKeyValue) {
  const { data, error } = await supabase
    .from('customer_notes')
    .select('*')
    .eq('phone_key', phoneKeyValue)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function addNote(phoneKeyValue, note, author) {
  const { data, error } = await supabase
    .from('customer_notes')
    .insert({ phone_key: phoneKeyValue, note: String(note).trim(), author: author || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Days since the customer's last order (for follow-up surfacing).
export function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// Fetch a customer's orders by phone (for purchase-aware suggestions).
export async function getCustomerOrders(rawPhone) {
  if (!rawPhone) return [];
  const { data, error } = await supabase
    .from('orders')
    .select('order_date, items, amount, currency, status, city, address, wa_number, market, brand, customer_name')
    .eq('phone_1', rawPhone)
    .order('order_date', { ascending: false })
    .limit(50);
  if (error) return [];
  return data ?? [];
}

// Distinct product names this customer has bought (from order items).
export function boughtProductNames(orders) {
  const set = new Set();
  for (const o of orders || []) {
    for (const it of (o.items || [])) {
      if (it?.name) set.add(String(it.name).trim());
    }
  }
  return [...set];
}

// AI follow-up message via the deployed social-content edge function
// (reuses the brand-tone "reply" mode). Returns text or null.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;
export async function aiFollowupMessage({ customerName, products, idleDays, sellerName }) {
  try {
    const ctx = `اكتب رسالة واتساب قصيرة ودّية بالعربي لمتابعة عميلة من Lowe's Professional للعناية بالبشرة.`
      + ` اسم العميلة: ${customerName || 'العميلة'}.`
      + (products?.length ? ` اشترت سابقاً: ${products.slice(0, 4).join('، ')}.` : '')
      + (idleDays && idleDays !== Infinity ? ` مضى ${idleDays} يوماً على آخر طلب.` : '')
      + ` اطمئني على تجربتها، أظهري الاهتمام، واقترحي منتجاً مكمّلاً بلطف بدون إلحاح.`
      + (sellerName ? ` وقّعي باسم ${sellerName}.` : '');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/social-content`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'reply', product: '', extra: ctx }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.content || null;
  } catch { return null; }
}

// Star label helper.
export function starLabel(stars) {
  if (stars >= 3) return '⭐⭐⭐';
  if (stars === 2) return '⭐⭐';
  if (stars === 1) return '⭐';
  return '';
}
