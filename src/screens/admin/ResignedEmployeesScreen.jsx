// =============================================================
// ResignedEmployeesScreen — أرشيف الموظفين المستقيلين 👋
// يحفظ بيانات الموظف بعد استقالته (مبيعاته، طلباته، عمولته، تواريخه)
// بدل الحذف النهائي. الدخول معطّل، لكن البيانات تبقى محجوزة ومتاحة.
// =============================================================
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@hooks/useAuth';
import { supabase } from '@services/supabase';
import { ROLE_LABELS } from '@data/teams';

// SQL للمايغريشن (يظهر فقط إذا الأعمدة لسا غير مُضافة)
const MIGRATION_SQL = `ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS resigned_at       date,
  ADD COLUMN IF NOT EXISTS resign_reason     text;
GRANT SELECT (employment_status) ON profiles TO anon, authenticated;
GRANT SELECT (resigned_at)       ON profiles TO anon, authenticated;
GRANT SELECT (resign_reason)     ON profiles TO anon, authenticated;
GRANT UPDATE (employment_status, resigned_at, resign_reason) ON profiles TO authenticated;`;

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const CUR_SYM = { USD: '$', TRY: '₺', SYP: 'ل.س' };

// ── Data ──────────────────────────────────────────────────────
// يجلب الموظفين المستقيلين. يتدرّج بأمان لو عمود employment_status غير موجود بعد.
async function fetchResigned() {
  const cols = 'id,employee_name,role_type,team,avatar_url,total_points,commission_pct,join_date,employment_status,resigned_at,resign_reason';
  const { data, error } = await supabase
    .from('profiles').select(cols)
    .eq('employment_status', 'resigned')
    .order('resigned_at', { ascending: false });

  if (error?.message?.includes('does not exist') || error?.code === '42703') {
    // عمود غير موجود → نحتاج المايغريشن. fallback: المعطّلون كبديل مؤقت.
    const res = await supabase
      .from('profiles')
      .select('id,employee_name,role_type,team,avatar_url,total_points,commission_pct,join_date,is_active')
      .eq('is_active', false).order('employee_name');
    if (res.error) throw new Error(res.error.message);
    return { rows: res.data ?? [], migrated: false };
  }
  if (error) throw new Error(error.message);
  return { rows: data ?? [], migrated: true };
}

// يجمع مبيعات/طلبات كل موظف من جدول orders حسب handler_name (دفعة واحدة).
async function fetchSalesByHandler(names) {
  if (!names.length) return {};
  const { data, error } = await supabase
    .from('orders')
    .select('handler_name,amount,currency,status')
    .in('handler_name', names);
  if (error) return {};
  const map = {};
  for (const o of (data ?? [])) {
    const k = o.handler_name;
    if (!map[k]) map[k] = { count: 0, byCur: {}, delivered: 0 };
    map[k].count += 1;
    if (o.status === 'delivered' || o.status === 'settled') map[k].delivered += 1;
    const cur = o.currency || 'USD';
    map[k].byCur[cur] = (map[k].byCur[cur] || 0) + Number(o.amount || 0);
  }
  return map;
}

async function reactivateProfile(id) {
  // إعادة للعمل: نحاول إرجاع الحالة + التفعيل؛ لو العمود غير موجود نكتفي بالتفعيل.
  const base = { is_active: true, updated_at: new Date().toISOString() };
  let { error } = await supabase.from('profiles')
    .update({ ...base, employment_status: 'active', resigned_at: null }).eq('id', id);
  if (error?.message?.includes('does not exist') || error?.code === '42703') {
    ({ error } = await supabase.from('profiles').update(base).eq('id', id));
  }
  if (error) throw new Error(error.message);
}

// ── SQL banner ────────────────────────────────────────────────
function SQLBanner({ sql }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard.writeText(sql).then(() => {
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  });
  return (
    <div className="bg-amber-bg border border-amber/30 rounded-xl p-4 space-y-3">
      <p className="text-sm font-semibold text-amber-fg">⚠️ إعداد مطلوب (مرة واحدة)</p>
      <p className="text-xs text-muted">
        نفّذ هذا SQL في Supabase SQL Editor لتفعيل حالة «مستقيل» مستقلة. حتى ذلك الحين تُعرض الحسابات المعطّلة هنا مؤقتاً.
      </p>
      <pre className="text-[11px] font-mono bg-surface rounded-lg p-3 overflow-x-auto text-text whitespace-pre-wrap max-h-48">{sql}</pre>
      <button onClick={copy} className="px-3 py-1.5 rounded-lg bg-teal text-navy text-xs font-semibold hover:bg-teal/90 transition">
        {copied ? '✓ تم النسخ' : 'نسخ SQL'}
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function ResignedEmployeesScreen() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [rows, setRows]       = useState([]);
  const [sales, setSales]     = useState({});
  const [migrated, setMigrated] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [search, setSearch]   = useState('');
  const [busyId, setBusyId]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { rows, migrated } = await fetchResigned();
      setRows(rows);
      setMigrated(migrated);
      const names = [...new Set(rows.map(r => r.employee_name).filter(Boolean))];
      setSales(await fetchSalesByHandler(names));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const reactivate = async (p) => {
    if (!window.confirm(`إعادة «${p.employee_name}» للعمل؟ سيُفعَّل حسابه ويعود للدخول.`)) return;
    setBusyId(p.id);
    try {
      await reactivateProfile(p.id);
      setRows(rs => rs.filter(x => x.id !== p.id));
    } catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };

  const filtered = rows.filter(p =>
    !search || p.employee_name?.toLowerCase().includes(search.toLowerCase()) || p.team?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-text">👋 الموظفون المستقيلون</h1>
        <p className="text-sm text-muted mt-0.5">
          أرشيف الموظفين السابقين — بياناتهم ومبيعاتهم محفوظة ومحجوزة، ودخولهم معطّل. لإعادة أي موظف للعمل اضغط «إعادة تفعيل».
        </p>
      </div>

      {!migrated && <SQLBanner sql={MIGRATION_SQL} />}

      <input
        type="text" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="بحث بالاسم أو الفريق…"
        className="w-full border border-border rounded-xl px-4 py-2 text-sm bg-surface text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/30"
      />

      {error && (
        <div className="bg-red-bg border border-red/20 text-red-fg rounded-xl px-4 py-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="underline text-xs">إعادة المحاولة</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-muted text-sm">جار التحميل…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-2">🗂️</div>
          <p className="text-muted text-sm">{search ? 'لا نتائج مطابقة' : 'لا يوجد موظفون مستقيلون — كل الفريق نشط 🌟'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(p => {
            const s = sales[p.employee_name];
            return (
              <div key={p.id} className="bg-surface border border-border rounded-2xl p-4 space-y-3">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-surface-alt flex items-center justify-center text-muted font-bold text-lg overflow-hidden shrink-0">
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover grayscale" />
                      : (p.employee_name?.[0] ?? '?')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-text truncate">{p.employee_name}</p>
                    <p className="text-xs text-muted">
                      {ROLE_LABELS[p.role_type] ?? p.role_type}{p.team ? ` · ${p.team}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-bg text-red-fg font-medium shrink-0">مستقيل</span>
                </div>

                {/* Dates */}
                <div className="flex items-center gap-3 text-[11px] text-muted">
                  {p.join_date && <span>📅 انضمّ: {String(p.join_date).slice(0,10)}</span>}
                  {p.resigned_at && <span>👋 استقال: {String(p.resigned_at).slice(0,10)}</span>}
                </div>

                {/* Preserved sales */}
                <div className="bg-surface-alt rounded-xl p-3 space-y-1">
                  <p className="text-[11px] font-semibold text-muted">💼 بياناته المحفوظة</p>
                  {s ? (
                    <>
                      <p className="text-xs text-text">📦 الطلبات: <b>{s.count}</b> <span className="text-muted">({s.delivered} مُسلّم)</span></p>
                      <div className="text-xs text-text flex flex-wrap gap-x-3">
                        {Object.entries(s.byCur).map(([cur, v]) => (
                          <span key={cur}>💰 {fmt(v)} {CUR_SYM[cur] ?? cur}</span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted">لا طلبات مسجّلة باسمه</p>
                  )}
                  <div className="text-[11px] text-muted flex flex-wrap gap-x-3 pt-0.5">
                    {(p.total_points ?? 0) > 0 && <span>⭐ {p.total_points} نقطة</span>}
                    {(p.commission_pct ?? 0) > 0 && <span>📊 عمولة {p.commission_pct}%</span>}
                  </div>
                </div>

                {p.resign_reason && (
                  <p className="text-[11px] text-muted bg-surface-alt rounded-lg px-2 py-1.5">📝 {p.resign_reason}</p>
                )}

                {isAdmin && (
                  <button
                    onClick={() => reactivate(p)}
                    disabled={busyId === p.id}
                    className="w-full py-1.5 rounded-lg border border-green/20 text-green-fg text-xs font-medium hover:bg-green-bg disabled:opacity-50 transition"
                  >
                    {busyId === p.id ? 'جارٍ…' : '🟢 إعادة تفعيل'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
