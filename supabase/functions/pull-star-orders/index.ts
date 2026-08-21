// =============================================================
// pull-star-orders — Edge Function
// -------------------------------------------------------------
// جسر طلبات شبكة النجوم (lowes-classic · مشروع kesoqnwyydycuyifqfhl)
// → تطبيق لويز (fghdumrgimoeqsafdhhh).
//
// طلبات تركيا للمسوّقات كانت تُولَد بشبكة النجوم ولا تصل الإدارة أبداً:
// لا لوحة تجهيز، لا تتبّع، ولا آلية عمل. هذه الدالة تسحبها وتُنزلها هنا
// فتمشي بالمسار الطبيعي (لوحة التجهيز اليومية · الشيت · البوليصة · التتبّع).
//
// حلقة **سحب/مطابقة** لا حلقة أحداث — عمداً:
//   · صفر DDL/trigger على قاعدة شبكة النجوم الحيّة (33 ألف طلب، ومرآتها
//     تعيد كتابة الصف كل ~1.8 ثانية فتُغرق أي trigger).
//   · لا يوجد `updated_at` بجدول شبكة النجوم أصلاً — فالمطابقة أصدق.
//   · فشل دورة = الدورة التالية تلحقها. لا طابور، لا رسائل ضائعة.
//
// الاتجاه: A→B قراءة فقط. لا يُكتب حرف واحد على شبكة النجوم.
//
// المخزون: **لا يُخصَم هنا**. شبكة النجوم تخصم مخزون تركيا عند اعتماد
// المشرفة على نفس البضاعة الفعلية (app.js:11160). الحاجز موجود بـ
// warehouseService.syncOrderStock عبر source='star_network'.
//
// الاستدعاء: pg_cron كل دقيقتين. يقبل بالجسم:
//   { dryRun?: boolean, sinceHours?: number, force?: boolean }
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://fghdumrgimoeqsafdhhh.supabase.co';
const SERVICE_KEY  = (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

// مشروع شبكة النجوم — قراءة فقط.
const STAR_URL = Deno.env.get('STAR_BASE_URL') ?? 'https://kesoqnwyydycuyifqfhl.supabase.co';
const STAR_KEY = Deno.env.get('STAR_KEY') ?? '';

const STATE_ID   = 'star_network';
const SOURCE_TAG = 'star_network';
const HANDLER    = 'شبكة النجوم';          // لا يطابق أي profile عمداً → لا عمولة موظف مزدوجة
const CREATED_BY = 'شبكة النجوم (تلقائي)';
const ACTOR      = 'شبكة النجوم (تلقائي)';

// نافذة الأمان على العلامة المائية. `createdAt` بشبكة النجوم يأتي من
// Date.now() بمتصفح المسوّقة (app.js:6081) — ساعة منحرفة تُنتج طلباً *خلف*
// العلامة المائية فلا يُرى أبداً. المرجع الحقيقي للتفرد هو external_id،
// والعلامة المائية مجرد تقليم للاستعلام.
const WATERMARK_SLACK_MS  = 48 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;   // أول تشغيل: يلتقط الطلب العالق
const LEASE_MS            = 5 * 60 * 1000;
const NEW_PAGE_LIMIT      = 200;

// حالات B التي تعني «الإدارة لسّا ما لمست الطلب» — وحدها تقبل كتابة الحالة.
const UNTOUCHED = new Set(['waiting', 'pending']);

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// ── تطبيع ────────────────────────────────────────────────────
const s = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const normName = (v: unknown) => s(v).toLowerCase().replace(/\s+/g, ' ');

// ── قراءة شبكة النجوم عبر RPC مُقيَّد (لا REST مباشر على orders) ──────
// تقوية أمنية (D-049، 21 آب 2026): STAR_KEY لم يعد service_role الكامل —
// صار مفتاح anon العام (غير سرّي أصلاً — مُضمَّن بكود شبكة النجوم نفسه،
// "safe to embed"). القراءة تمرّ حصراً عبر دالة SECURITY DEFINER
// `public.star_bridge_orders` (مُنشأة على مشروع شبكة النجوم يدوياً، انظر
// HANDOFFlowes.md) — تُعيد فقط الحقول المُسقَطة أدناه، مفلترة سيرفرياً
// بنفس شرط النطاق (تركيا + مسوّقة/مشرفة)، وGRANT EXECUTE لـanon فقط. لا
// select=* أبداً حتى داخل الدالة — عمود data الكامل (5–20KB/طلب) لا يخرج
// عبر أي مسار.
async function starRpc(args: { p_ids?: string[]; p_since?: string; p_limit?: number }): Promise<any[]> {
  const res = await fetch(`${STAR_URL}/rest/v1/rpc/star_bridge_orders`, {
    method: 'POST',
    headers: {
      apikey: STAR_KEY,
      Authorization: `Bearer ${STAR_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'count=none',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`star RPC ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return await res.json();
}

// verifyStage بشبكة النجوم → حالة تطبيق لويز.
//   supervisor = أُنشئ وبانتظار المشرفة، **لا مخزون مخصوم** → waiting (خارج لوحة التجهيز)
//   ops        = المشرفة اعتمدت، خُصم مخزون TR، «للتجهيز» (app.js:11156) → pending
//   rejected/returned → cancelled
// ⚠️ حالة A `delivered` لا تُترجَم أبداً: التسليم يملكه تطبيق لويز، والكتابة
// المباشرة عليه تتخطّى قيد المحاسبة بـOrdersScreen (يُنشأ عند نقلة الحالة
// يدوياً) فينتج إيراد بلا accounting_entries وبلا مفتاح تفرّد.
function desiredStatus(vstage: string): string | null {
  if (vstage === 'ops')        return 'pending';
  if (vstage === 'supervisor') return 'waiting';
  if (vstage === 'rejected' || vstage === 'returned') return 'cancelled';
  return null;
}

const TR_PAY_LABEL: Record<string, string> = { bank: 'حوالة بنكية', papara: 'Papara', office: 'مكتب' };

function paymentOf(row: any) {
  const ch    = s(row.pc) || 'prepaid';
  const total = num(row.ctotal);
  const dep   = num(row.dep);
  if (ch === 'prepaid') return { paid: total, status: 'paid',    label: 'دفع مسبق' };
  if (ch === 'partial') return { paid: dep,   status: 'partial', label: `دفع جزئي (عربون ${dep})` };
  return { paid: 0, status: 'unpaid', label: 'دفع عند الباب 💵' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const started  = Date.now();
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const stats = {
    scanned: 0, inserted: 0, advanced: 0, cancelled: 0,
    flagged: 0, skipped: 0, errors: [] as string[],
  };

  // ⚠️ verify_jwt=true **لا يكفي** هنا: مفتاح anon العام (المضمَّن بالواجهة،
  // والمسرَّب أصلاً) هو JWT صالح موقَّع من المشروع، فيمرّ من بوابة الـJWT.
  // بدون هذا الفحص يستطيع أي حامل لمفتاح anon تشغيل السحب مراراً وحرق Egress
  // شبكة النجوم (المشروع سبق أن تجاوز الحد). نشترط مفتاح الخدمة نفسه — وهو
  // ما يرسله الكرون أصلاً، فلا سرّ جديد يُدار.
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!SERVICE_KEY || bearer !== SERVICE_KEY) return json({ ok: false, error: 'forbidden' }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* الكرون يستدعي بجسم فارغ */ }
  const dryRun = body?.dryRun === true;
  const plan: any[] = [];

  if (!STAR_KEY) return json({ ok: false, error: 'STAR_KEY secret not set' }, 500);

  let fresh: any[] = [];
  try {
    // ── 0) قفل التشغيل ────────────────────────────────────────
    // الدفع للشيت متزامن (Apps Script، ثوانٍ للطلب) وقد يتجاوز الدقيقتين،
    // فيتوازى ساحبان ويولّدان صفّين ورقمَي TL لنفس الطلب.
    const { data: st } = await supabase
      .from('integration_state').select('*').eq('id', STATE_ID).maybeSingle();

    const nowMs = Date.now();
    if (!dryRun && body?.force !== true && st?.running_until
        && new Date(st.running_until).getTime() > nowMs) {
      return json({ ok: true, skipped: 'locked', running_until: st.running_until }, 200);
    }
    if (!dryRun) {
      await supabase.from('integration_state')
        .update({ running_until: new Date(nowMs + LEASE_MS).toISOString() })
        .eq('id', STATE_ID);
    }

    // ── 1) المرحلة الأولى — استعلامات ضيّقة ───────────────────
    // سقف 90 يوماً: نافذة أكبر = مسح تسلسلي أوسع على جدول شبكة النجوم (33 ألف
    // صف، وفلتر jsonb غير مفهرس) وحرق Egress بلا فائدة.
    const lookbackMs = body?.sinceHours
      ? Math.min(Math.max(Number(body.sinceHours) || 0, 1), 24 * 90) * 3600_000
      : null;
    const since = lookbackMs != null
      ? new Date(nowMs - lookbackMs)
      : st?.last_created_at
        ? new Date(new Date(st.last_created_at).getTime() - WATERMARK_SLACK_MS)
        : new Date(nowMs - DEFAULT_LOOKBACK_MS);

    // 1أ) الطلبات الجديدة داخل النافذة — RPC يُرجع البيانات المُسقَطة كاملة
    // مباشرة (لا حاجة لجلب id فقط ثم إعادة الجلب — الحقول نفسها بلا تكلفة
    // إضافية عبر star_bridge_orders، فدُمجت المرحلتان لتقليل عدد الرحلات).
    fresh = await starRpc({ p_since: since.toISOString(), p_limit: NEW_PAGE_LIMIT });
    stats.scanned = fresh.length;

    // 1ب) ما هو منسوخ عندنا أصلاً؟ بلا فلترة deleted_at/archived — الطلب
    //     المحذوف إدارياً يجب أن يُتخطّى لا أن يُعاد إنشاؤه برقم TL جديد.
    const { data: mirroredRows } = await supabase
      .from('orders')
      .select('id, order_id, external_id, external_stage, status, notes, customer_name, deleted_at')
      .eq('source', SOURCE_TAG);
    const mirrored = new Map<string, any>((mirroredRows ?? []).map((r: any) => [r.external_id, r]));

    const rowsByExtId = new Map<string, any>();
    for (const r of fresh) if (!mirrored.has(s(r.id))) rowsByExtId.set(s(r.id), r);

    // 1ج) الطلبات المفتوحة عندنا (waiting/pending) — رحلة واحدة تُرجع
    // البيانات الكاملة مباشرة، فنقارن vstage ونبني السجل من نفس النتيجة
    // بلا رحلة ثالثة منفصلة.
    const openIds = (mirroredRows ?? [])
      .filter((r: any) => !r.deleted_at && UNTOUCHED.has(r.status))
      .map((r: any) => r.external_id)
      .filter(Boolean);

    if (openIds.length) {
      const probe = await starRpc({ p_ids: openIds });
      for (const p of probe) {
        const cur = mirrored.get(s(p.id));
        if (!cur) continue;
        // vstage غير معروف (اختلاف حساسية حالة أحرف مفتاح JSON مثلاً) → ادفعه
        // للتنفيذ صراحةً بدل تخطّيه بصمت.
        if (p.vstage == null || s(p.vstage) !== s(cur.external_stage)) rowsByExtId.set(s(p.id), p);
      }
      // ⚠️ مرآة شبكة النجوم تحذف صفوفاً غابت عن الـblob — فقد يرجع الاستعلام
      // أقل مما طُلب. الغياب = «لا تغيير»، لا حذف ولا إلغاء.
    }

    const rows = [...rowsByExtId.values()];
    if (!rows.length) {
      if (!dryRun) await releaseLock(supabase, stats, started, fresh);
      return json({ ok: true, ...stats, note: 'nothing to do' }, 200);
    }

    // أسماء المسوّقات (للملاحظات فقط) + قاموس أسماء المنتجات المعتمدة.
    const marketerNames = await fetchMarketerNames(rows.map((r: any) => s(r.user_id)));
    const known         = await fetchKnownProductNames(supabase);

    // ── 3) تنفيذ ──────────────────────────────────────────────
    for (const row of rows) {
      const extId  = s(row.id);
      const vstage = s(row.vstage);
      const want   = desiredStatus(vstage);
      const cur    = mirrored.get(extId);
      const marketer = marketerNames.get(s(row.user_id)) || '';

      try {
        // ── طلب جديد ──
        if (!cur) {
          // مات قبل ما نراه أصلاً — لا تُنشئ نسخة لطلب مرفوض/راجع/ملغى.
          if (!want || want === 'cancelled' || s(row.status) === 'cancelled') { stats.skipped++; continue; }
          const rec = buildRecord(row, want, marketer, known);
          if (dryRun) {
            plan.push({ action: 'insert', external_id: extId, status: want, items: rec.record.items, unmatched: rec.unmatched });
            stats.inserted++; continue;
          }
          await insertMirrored(supabase, rec, stats);
          continue;
        }

        if (cur.deleted_at) { stats.skipped++; continue; }   // حُذف إدارياً — لا تُحيِه

        if (!want || want === cur.status) { await touchStage(supabase, cur.id, vstage, dryRun); continue; }

        // ── اعتماد المشرفة: waiting → pending. هنا فقط يدخل لوحة التجهيز ──
        if (want === 'pending' && cur.status === 'waiting') {
          if (dryRun) { plan.push({ action: 'advance', external_id: extId, to: 'pending' }); stats.advanced++; continue; }
          await advanceToPending(supabase, cur, row, marketer, known, stats);
          continue;
        }

        // ── إلغاء/رفض/إرجاع من المصدر ──
        if (want === 'cancelled') {
          if (UNTOUCHED.has(cur.status)) {
            if (dryRun) { plan.push({ action: 'cancel', external_id: extId }); stats.cancelled++; continue; }
            await cancelMirrored(supabase, cur, vstage, stats);
          } else {
            // الإدارة بلّشت تجهيزه فعلاً — لا تدهس حالتها ولا تكسر التتبّع.
            if (dryRun) { plan.push({ action: 'flag_late_cancel', external_id: extId, current: cur.status }); stats.flagged++; continue; }
            await flagLateCancel(supabase, cur, vstage, stats);
          }
          continue;
        }

        // أي وضع آخر (الإدارة تجاوزت الحالة): سجّل المرحلة فقط، لا تتراجع.
        await touchStage(supabase, cur.id, vstage, dryRun);
      } catch (e) {
        stats.errors.push(`${extId}: ${String(e).slice(0, 200)}`);
      }
    }

    if (!dryRun) await releaseLock(supabase, stats, started, fresh);
    return json({ ok: true, dryRun, ...stats, ...(dryRun ? { plan } : {}) }, 200);

  } catch (err) {
    const msg = String(err).slice(0, 500);
    console.error('[pull-star-orders]', err);
    if (!dryRun) {
      await supabase.from('integration_state')
        .update({ running_until: null, last_run_at: new Date().toISOString(), last_error: msg })
        .eq('id', STATE_ID).then(() => {}, () => {});
    }
    return json({ ok: false, error: msg, ...stats }, 200);
  }
});

// ═══════════════ مساعدات ═══════════════

async function releaseLock(supabase: any, stats: any, started: number, fresh: any[]) {
  // العلامة المائية تتقدّم لأحدث created_at شوهد فعلاً (لا إلى now) — ومع
  // نافذة 48 ساعة عند القراءة، فالساعة المنحرفة لا تُسقِط طلباً.
  const maxSeen = fresh.reduce((mx: string | null, r: any) => {
    const t = s(r.created_at);
    return t && (!mx || t > mx) ? t : mx;
  }, null as string | null);
  const patch: Record<string, unknown> = {
    running_until: null,
    last_run_at:   new Date().toISOString(),
    last_error:    stats.errors.length ? stats.errors.slice(0, 5).join(' | ') : null,
    stats:         { ...stats, ms: Date.now() - started },
  };
  if (maxSeen) patch.last_created_at = maxSeen;
  await supabase.from('integration_state').update(patch).eq('id', STATE_ID).then(() => {}, () => {});
}

// أسماء المسوّقات من profiles بمشروع شبكة النجوم (id نصّي 'u_xxx').
// للملاحظات فقط — handler_name يبقى «شبكة النجوم» عمداً.
async function fetchMarketerNames(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out = new Map<string, string>();
  if (!ids.length) return out;
  try {
    const res = await fetch(
      `${STAR_URL}/rest/v1/profiles?select=id,name&id=in.(${ids.map(encodeURIComponent).join(',')})`,
      { headers: { apikey: STAR_KEY, Authorization: `Bearer ${STAR_KEY}`, Prefer: 'count=none' } },
    );
    if (res.ok) for (const p of await res.json()) out.set(s(p.id), s(p.name));
  } catch { /* best-effort — الاسم زينة بالملاحظات */ }
  return out;
}

// الأسماء التي يعرفها الشيت: نفس قاعدة enName بـsync-order-to-sheet
// (products.name / name_en مُطبَّعة)، مع product_name_map كشبكة أمان
// لمعالجة الاسم البديل المعروف قبل أن يسقط بصمت.
async function fetchKnownProductNames(supabase: any) {
  const canonical = new Map<string, string>();   // مُطبَّع → الاسم كما بـproducts
  const alias     = new Map<string, string>();   // alias مُطبَّع → canonical_name
  try {
    const { data: prods } = await supabase.from('products').select('name,name_en');
    for (const p of prods ?? []) {
      if (p.name)    canonical.set(normName(p.name),    String(p.name));
      if (p.name_en) canonical.set(normName(p.name_en), String(p.name_en));
    }
  } catch { /* لو فشل: لا نُسقط طلباً، فقط لا نستطيع التحقق */ }
  try {
    const { data: maps } = await supabase.from('product_name_map').select('alias_name,canonical_name');
    for (const m of maps ?? []) alias.set(normName(m.alias_name), String(m.canonical_name));
  } catch { /* اختياري */ }
  return { canonical, alias, ready: canonical.size > 0 };
}

// أصناف الطلب → شكل تطبيق لويز [{name, qty}] + قائمة ما لم يُطابَق.
// الهدايا ($0 · isGift) تُدرَج كما هي: بضاعة فعلية لازم تُغلَّف.
function mapItems(raw: any, known: any) {
  const items: Array<{ name: string; qty: number }> = [];
  const unmatched: string[] = [];
  for (const it of Array.isArray(raw) ? raw : []) {
    let name = s(it?.name);
    if (!name) continue;
    const qty = Math.max(1, Math.round(num(it?.qty) || 1));
    if (known.ready) {
      const key = normName(name);
      const viaAlias = known.alias.get(key);
      if (known.canonical.has(key)) {
        name = known.canonical.get(key)!;
      } else if (viaAlias && known.canonical.has(normName(viaAlias))) {
        name = known.canonical.get(normName(viaAlias))!;   // اسم بديل معروف → القياسي
      } else {
        unmatched.push(name);
      }
    }
    items.push({ name, qty });
  }
  return { items, unmatched };
}

function buildRecord(row: any, status: string, marketer: string, known: any) {
  const pay = paymentOf(row);
  const { items, unmatched } = mapItems(row.items, known);
  const trpm = s(row.trpm);
  const base = [
    marketer ? `مسوّقة: ${marketer}` : null,
    `شبكة النجوم ${s(row.id)}`,
    s(row.recv) ? `المستلِم: ${s(row.recv)}` : null,
    num(row.collect) ? `المطلوب تحصيله: ${num(row.collect)} TRY` : null,
    'التعديل يتم بالتطبيق المصدر — بيانات العميل هنا لقطة زمنية.',
  ].filter(Boolean).join(' · ');

  const record: Record<string, unknown> = {
    market:           'turkey',
    brand:            'lowes',
    currency:         'TRY',
    status,
    customer_name:    s(row.client_name) || 'عميل شبكة النجوم',   // الحقل الوحيد NOT NULL
    phone_1:          s(row.p1),
    phone_2:          s(row.p2),
    wa_number:        s(row.wa) || s(row.p1),
    city:             s(row.city),
    district:         s(row.dist),
    address:          s(row.addr),
    amount:           num(row.ctotal),
    paid_amount:      pay.paid,
    payment_status:   pay.status,
    payment_method:   trpm ? `${pay.label} · ${TR_PAY_LABEL[trpm] ?? trpm}` : pay.label,
    shipping_company: s(row.shipco),
    handler_name:     HANDLER,
    items,
    notes:            unmatched.length ? `${base} · ⚠️ أصناف غير معروفة بالكتالوج: ${unmatched.join('، ')}` : base,
    order_date:       s(row.created_at) || new Date().toISOString(),
    created_by:       CREATED_BY,
    source:           SOURCE_TAG,
    external_id:      s(row.id),
    external_stage:   s(row.vstage),
    external_synced_at: new Date().toISOString(),
    // ⚠️ order_id يُترك فارغاً عمداً — تريغر assign_order_code يعطي رقم
    // TL-<n> أصلي فتشتغل البوليصة والشيت وصفحة التتبّع بلا أي استثناء.
  };

  // اسم صنف لا يعرفه الكتالوج يسقط بصمت من الشيت (itemsWritten < itemsSent)
  // ولا أحد يرى التوست من هنا. نرفع الراية بلافتة المزامنة الفاشلة بدل رفض
  // الطلب — رفضه إعادة إنتاج للمشكلة نفسها التي نصلحها: طلب لا يراه أحد.
  if (unmatched.length) {
    record.sync_status = 'failed';
    record.sync_error  = `أصناف غير مطابقة للكتالوج: ${unmatched.join('، ')}`;
  }
  return { record, unmatched };
}

async function insertMirrored(supabase: any, rec: any, stats: any) {
  const { data, error } = await supabase.from('orders')
    .insert(rec.record).select('id, order_id, status, customer_name').single();
  if (error) {
    // 23505 = أُنشئ بالتزامن لتوّه (فهرس external_id الفريد) — ليس خطأً فعلياً.
    if (String(error.code) === '23505') { stats.skipped++; return; }
    throw new Error(error.message);
  }
  stats.inserted++;
  await history(supabase, data.id, null, String(rec.record.status));
  // الطلب المُنسَّخ ينزل waiting: خارج لوحة التجهيز عمداً حتى تعتمده المشرفة.
  // الإشعار والشيت يجيان عند القلبة لـpending، لا الآن.
  if (data.status === 'pending') await onBecameActionable(supabase, data, rec.unmatched, stats);
}

async function advanceToPending(
  supabase: any, cur: any, row: any, marketer: string, known: any, stats: any,
) {
  // القلبة الوحيدة التي يُعاد فيها مزامنة بيانات العميل/الأصناف: اعتماد
  // المشرفة هو لحظة صيرورة بيانات المصدر نهائية، وB لسّا waiting فما لمسها أحد.
  const { record, unmatched } = buildRecord(row, 'pending', marketer, known);
  delete record.source;
  delete record.external_id;
  delete record.created_by;
  delete record.order_date;
  record.updated_at = new Date().toISOString();
  record.updated_by = ACTOR;

  const { error } = await supabase.from('orders').update(record).eq('id', cur.id);
  if (error) throw new Error(error.message);
  stats.advanced++;
  await history(supabase, cur.id, cur.status, 'pending');
  await onBecameActionable(
    supabase,
    { id: cur.id, order_id: cur.order_id, status: 'pending', customer_name: cur.customer_name },
    unmatched, stats,
  );
}

async function cancelMirrored(supabase: any, cur: any, vstage: string, stats: any) {
  const { error } = await supabase.from('orders').update({
    status: 'cancelled',
    external_stage: vstage,
    external_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: ACTOR,
  }).eq('id', cur.id);
  if (error) throw new Error(error.message);
  stats.cancelled++;
  await history(supabase, cur.id, cur.status, 'cancelled');
}

// إلغاء متأخر: المصدر رفض/أرجع الطلب بعد ما بلّشت الإدارة تجهّزه. لا نلمس
// الحالة (دهسها يكسر التتبّع وحركة المخزون) — نرفع راية ونُشعر التجهيز.
async function flagLateCancel(supabase: any, cur: any, vstage: string, stats: any) {
  const MARK = '⚠️ ألغته شبكة النجوم بعد بدء التجهيز';
  if (String(cur.notes || '').includes(MARK)) { stats.skipped++; return; }
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  await supabase.from('orders').update({
    notes: `${s(cur.notes)}${cur.notes ? ' · ' : ''}${MARK} (${vstage} — ${stamp})`,
    external_stage: vstage,
    external_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: ACTOR,
  }).eq('id', cur.id);
  stats.flagged++;
  await notifyFulfillment(supabase, {
    title:   `⚠️ إلغاء متأخر ${cur.order_id || ''}`.trim(),
    message: `${MARK} — الحالة عندنا «${cur.status}». راجع قبل الشحن.`,
    orderId: cur.id, orderCode: cur.order_id, type: 'system_alert', severity: 'warning',
  });
}

async function touchStage(supabase: any, id: string, vstage: string, dryRun: boolean) {
  if (dryRun || !vstage) return;
  await supabase.from('orders')
    .update({ external_stage: vstage, external_synced_at: new Date().toISOString() })
    .eq('id', id).then(() => {}, () => {});
}

// صار على طاولة المجهِّز: أشعِر التجهيز + ادفعه للشيت.
async function onBecameActionable(supabase: any, order: any, unmatched: string[], stats: any) {
  await notifyFulfillment(supabase, {
    title:   `📥 طلب جديد ${order.order_id || ''} · 🌟 شبكة النجوم`.trim(),
    message: `${order.customer_name || 'عميل'} — تركيا${unmatched.length ? ' · ⚠️ أصناف غير مطابقة للكتالوج' : ''}`,
    orderId: order.id, orderCode: order.order_id, type: 'order_new', severity: 'info',
  });
  // الشيت: عند صيرورة الطلب فعلياً قيد العمل فقط — الطلب waiting ما إله مكان
  // بجدول الفريق. بلا إعادة محاولة هنا: sync_status='failed' يلتقطه كرون
  // retry-failed-syncs كل 10 دقائق مجاناً.
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-order-to-sheet`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.id }),
    });
    const b  = await res.json().catch(() => null);
    const ok = res.ok && b?.ok !== false && !b?.error;
    const partial = b?.itemsSent != null && b?.itemsWritten != null && b.itemsWritten < b.itemsSent;
    if (!ok || partial) {
      await supabase.from('orders').update({
        sync_status: 'failed',
        sync_error:  partial ? `الشيت كتب ${b.itemsWritten}/${b.itemsSent} صنف` : String(b?.error ?? res.status),
      }).eq('id', order.id).then(() => {}, () => {});
    }
  } catch (e) {
    stats.errors.push(`sheet ${order.id}: ${String(e).slice(0, 120)}`);
  }
}

// نقل منطق notifyNewOrderToFulfillment (OrdersScreen.jsx:89) لجانب الخادم.
async function notifyFulfillment(
  supabase: any,
  p: { title: string; message: string; orderId: string; orderCode?: string; type: string; severity: string },
) {
  try {
    const { data: staff } = await supabase.from('profiles')
      .select('id').eq('is_active', true)
      .eq('order_role', 'fulfillment').eq('order_market', 'turkey');
    const ids = (staff ?? []).map((x: any) => x.id);
    if (!ids.length) return;
    const day = new Date().toISOString().slice(0, 10);
    await supabase.from('notifications').insert(ids.map((uid: string) => ({
      recipient: uid, kind: p.type, user_id: uid, type: p.type,
      title: p.title, message: p.message,
      entity_type: 'order', entity_id: String(p.orderId),
      severity: p.severity, is_read: false,
      metadata: { order_id: p.orderCode ?? null, market: 'turkey', source: SOURCE_TAG },
      dedup_key: `${uid}|${p.type}|${p.orderId}|${day}`,
    }))).then(() => {}, () => {});
  } catch { /* best-effort */ }
}

async function history(supabase: any, orderId: string, from: string | null, to: string) {
  await supabase.from('order_status_history').insert({
    order_id: orderId, from_status: from, to_status: to,
    changed_by: HANDLER, source: 'star',
  }).then(() => {}, () => {});
}
