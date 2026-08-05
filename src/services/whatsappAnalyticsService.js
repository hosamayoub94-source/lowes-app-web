// =============================================================
// whatsappAnalyticsService — سبرنت ② من خطة النمو: أول أرقام حقيقية
// عن أداء قناة واتساب الرسمية (معدل رد، سرعة رد الفريق، تحويل لطلب).
// بدون هذا القياس، أي حملة/سبرنت جاي (③ إعادة تنشيط...) بيصير تخمين
// بدل قرار مبني على رقم — راجع قانون KPI-Driven Development بالمشروع.
//
// يقرأ whatsapp_messages من مشروع Supabase التاني (نفس بنية whatsappService.js)
// ويقاطعه مع orders بمشروعنا (تركيا فقط — واتساب سوريا محظور كلياً D-022).
// =============================================================
import { supabase } from './supabase';
import { WA_PROJECT_URL, WA_HEADERS } from './whatsappService';

const digits = (s) => String(s || '').replace(/\D/g, '');
const last9  = (s) => digits(s).slice(-9); // كافٍ لمطابقة رقم تركي محلي/دولي بلا لبس

// يجلب كل رسائل واتساب منذ تاريخ معيّن (صفحات 1000 — سقف PostgREST).
export async function fetchMessagesSince(sinceISO) {
  const all = [];
  let offset = 0;
  const PAGE = 1000;
  for (;;) {
    const res = await fetch(
      `${WA_PROJECT_URL}/rest/v1/whatsapp_messages?select=phone,direction,created_at,by_user&created_at=gte.${encodeURIComponent(sinceISO)}&order=created_at.asc&limit=${PAGE}&offset=${offset}`,
      { headers: WA_HEADERS },
    );
    if (!res.ok) throw new Error('تعذّر تحميل رسائل واتساب للتحليل');
    const rows = await res.json();
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
    if (offset > 30000) break; // سقف أمان — يكفي لأي نافذة تحليل معقولة
  }
  return all;
}

// يبني إحصاءات المحادثات من الرسائل الخام: معدل رد العميل، سرعة رد الفريق
// (لما العميل يبلّش هو)، وعدد صادر/وارد إجمالي.
// مرسِلون آليون — يُستبعدوا من لوحة "مين عم يشتغل" (طلب مالك 6 أغسطس
// 2026: أدمن يقدر يشوف أداء الموظفين الفعلي على واتساب، لا ضجيج آلي).
const SYSTEM_SENDERS = new Set(['bulk-campaign', 'order-created']);

export function buildWhatsAppStats(messages) {
  const byPhone = new Map();
  for (const m of messages) {
    const key = digits(m.phone);
    if (!key) continue;
    if (!byPhone.has(key)) byPhone.set(key, []);
    byPhone.get(key).push(m);
  }

  let totalIn = 0, totalOut = 0, repliedConvos = 0, customerInitiated = 0;
  const responseTimesMin = [];
  const conversations = [];
  const agentMap = new Map(); // by_user → { sent, responseTimes: [] }

  for (const [phoneKey, msgs] of byPhone) {
    msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const ins  = msgs.filter(m => m.direction === 'in');
    const outs = msgs.filter(m => m.direction === 'out');
    totalIn += ins.length; totalOut += outs.length;
    if (ins.length > 0) repliedConvos++;

    const first = msgs[0];
    let responseMin = null;
    if (first.direction === 'in') {
      customerInitiated++;
      const firstOut = msgs.find(m => m.direction === 'out' && new Date(m.created_at) > new Date(first.created_at));
      if (firstOut) {
        const mins = (new Date(firstOut.created_at) - new Date(first.created_at)) / 60000;
        // استبعاد قيم شاذة (>3 أيام) — غالباً محادثة قديمة أُعيد فتحها لا رد فعلي سريع
        if (mins >= 0 && mins < 60 * 24 * 3) { responseTimesMin.push(mins); responseMin = mins; }
      }
    }
    conversations.push({
      phoneKey, firstAt: first.created_at, lastAt: msgs[msgs.length - 1].created_at,
      inCount: ins.length, outCount: outs.length,
      customerInitiated: first.direction === 'in', responseMin,
    });

    // نسب كل رسالة صادرة لصاحبها (by_user) + سرعة ردّه لو جاءت بعد رسالة عميل
    // مباشرة (نفس منطق "سرعة رد الفريق" أعلاه، بس مقسَّم بالشخص).
    let pendingInboundAt = null;
    for (const m of msgs) {
      if (m.direction === 'in') {
        pendingInboundAt = m.created_at;
      } else if (m.direction === 'out') {
        const agent = m.by_user;
        if (agent && !SYSTEM_SENDERS.has(agent)) {
          if (!agentMap.has(agent)) agentMap.set(agent, { sent: 0, responseTimes: [] });
          const a = agentMap.get(agent);
          a.sent++;
          if (pendingInboundAt) {
            const mins = (new Date(m.created_at) - new Date(pendingInboundAt)) / 60000;
            if (mins >= 0 && mins < 60 * 24 * 3) a.responseTimes.push(mins);
            pendingInboundAt = null;
          }
        }
      }
    }
  }

  const totalConvos = byPhone.size;
  const avgResponseMin = responseTimesMin.length
    ? Math.round(responseTimesMin.reduce((a, b) => a + b, 0) / responseTimesMin.length)
    : null;

  const agentStats = [...agentMap.entries()].map(([byUser, v]) => ({
    byUser, sent: v.sent,
    avgResponseMin: v.responseTimes.length ? Math.round(v.responseTimes.reduce((a, b) => a + b, 0) / v.responseTimes.length) : null,
  })).sort((a, b) => b.sent - a.sent);

  return {
    totalConvos, totalIn, totalOut, repliedConvos, customerInitiated,
    replyRate: totalConvos ? Math.round((repliedConvos / totalConvos) * 100) : 0,
    avgResponseMin,
    conversations,
    agentStats,
  };
}

// يبدّل معرّفات الموظفين (by_user = profile.id) بأسمائهم — استعلام واحد
// بالدفعة بدل استعلام لكل وكيل.
async function resolveAgentNames(agentStats) {
  const ids = agentStats.map(a => a.byUser).filter(id => /^[0-9a-f-]{36}$/i.test(id));
  if (!ids.length) return agentStats.map(a => ({ ...a, name: a.byUser }));
  const { data } = await supabase.from('profiles').select('id, employee_name').in('id', ids);
  const nameById = new Map((data || []).map(p => [p.id, p.employee_name]));
  return agentStats.map(a => ({ ...a, name: nameById.get(a.byUser) || a.byUser }));
}

// طلبات تركيا منذ تاريخ معيّن (للمطابقة مع محادثات واتساب) — صفحات 1000.
async function fetchTurkeyOrdersSince(sinceISO) {
  const all = [];
  let from = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('orders')
      .select('phone_1, order_date')
      .eq('market', 'turkey')
      .gte('order_date', sinceISO)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// يحسب كم محادثة "تحوّلت" فعلياً لطلب حقيقي خلال 7 أيام من أول رسالة —
// المقياس الوحيد اللي فعلاً بيربط واتساب بمبيع حقيقي، لا مجرد نشاط شات.
export async function computeConversions(conversations, sinceISO) {
  const orders = await fetchTurkeyOrdersSince(sinceISO);
  const earliestByPhone = new Map();
  for (const o of orders) {
    const k = last9(o.phone_1);
    if (!k || !o.order_date) continue;
    const prev = earliestByPhone.get(k);
    if (!prev || new Date(o.order_date) < new Date(prev)) earliestByPhone.set(k, o.order_date);
  }
  let converted = 0;
  for (const c of conversations) {
    const od = earliestByPhone.get(last9(c.phoneKey));
    if (!od) continue;
    const windowEnd = new Date(c.firstAt).getTime() + 7 * 86400000;
    if (new Date(od).getTime() >= new Date(c.firstAt).getTime() && new Date(od).getTime() <= windowEnd) converted++;
  }
  return converted;
}

// نداء واحد مريح للوحة: يرجّع كل الأرقام جاهزة لفترة (بالأيام).
export async function getWhatsAppAnalytics(days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const messages = await fetchMessagesSince(since);
  const stats = buildWhatsAppStats(messages);
  let converted = 0;
  try { converted = await computeConversions(stats.conversations, since); } catch { /* orders قد تفشل بلا كسر التحليلات الأساسية */ }
  let agentStats = stats.agentStats;
  try { agentStats = await resolveAgentNames(stats.agentStats); } catch { /* أسماء الموظفين ثانوية — لا تكسر باقي التحليلات */ }
  return { ...stats, agentStats, converted, conversionRate: stats.totalConvos ? Math.round((converted / stats.totalConvos) * 100) : 0, since, days };
}
