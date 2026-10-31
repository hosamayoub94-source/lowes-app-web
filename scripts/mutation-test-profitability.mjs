// اختبار الطفرات للمحرّك: يُدخل خطأً متعمَّداً واحداً كل مرة في src/utils/profitabilityCalc.js ثم يشغّل test-profitability-calc.mjs.
// «قُتلت» = فشل الاختبار (assert أو استثناء). «نجت» = الاختبار لم يلتقط الخطأ ← ثغرة بالاختبارات (أو طفرة مكافئة).
// الاستعمال: node scripts/mutation-test-profitability.mjs   (يُعيد الملف الأصلي دائماً، حتى عند الإيقاف)
import fs from 'fs';
import { spawnSync } from 'child_process';

const FILES = { calc: 'src/utils/profitabilityCalc.js', da: 'src/utils/deliveryAccounting.js' };
const originals = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));
const restore = () => { for (const k of Object.keys(FILES)) fs.writeFileSync(FILES[k], originals[k]); };
process.on('exit', restore); process.on('SIGINT', () => process.exit(130)); process.on('SIGTERM', () => process.exit(143));

// طفرة بملف deliveryAccounting.js (تسعير /sales-delivery): Rda
const Rda = (name, from, to) => ({ ...R(name, from, to), file: 'da' });
const R = (name, from, to) => ({ name, mutate: (s) => { const i = s.indexOf(from); return i < 0 ? null : s.slice(0, i) + to + s.slice(i + from.length); } });
const afterNeedle = (name, needle, from, to) => ({ name, mutate: (s) => { const n = s.indexOf(needle); if (n < 0) return null; const i = s.indexOf(from, n); return i < 0 ? null : s.slice(0, i) + to + s.slice(i + from.length); } });

const MUTANTS = [
  R('تكلفة الوحدة المعروضة: أول طلب لا متوسط مرجّح', 'const ee = rk?.costUnits ? { ...ee0, cost: rk.costSet.size === 1 ? [...rk.costSet][0] : rk.costSum / rk.costUnits } : ee0;', 'const ee = ee0;'),
  R('تكلفة الوحدة المعروضة: متوسط بلا ترجيح بالكميات', 'rec.costSum = (rec.costSum || 0) + it.q * e.cost;', 'rec.costSum = (rec.costSum || 0) + e.cost * (rec.costUnits / Math.max(1, rec.costUnits));'),
  R('تكلفة الوحدة المعروضة: المرتجعات/المعلّق تدخل الترجيح', 'const versionFor = (it, ref, market, weigh = false) => {', 'const versionFor = (it, ref, market, weigh = true) => {'),
  R('يوم التسليم بتوقيت UTC لا إسطنبول', 'return Number.isFinite(t) ? new Date(t + 3 * 3600 * 1000).toISOString().slice(0, 10) : null;', 'return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;'),
  Rda('/sales-delivery: كل الطلبات تُسعَّر ببداية الشهر (لا بيوم التسليم)', "if (day) return { asOf: day, basis: 'delivery_day' };", "if (false) return { asOf: day, basis: 'delivery_day' };"),
  Rda('/sales-delivery: تاريخ الطلب البديل يُعدّ تسليماً موثوقاً', "basis !== 'unknown' && basis !== 'legacy_order_date'", "basis !== 'unknown'"),
  Rda('/sales-delivery: بلا أساس تسليم يُعدّ موثوقاً', 'const reliable = !!basis && basis', 'const reliable = basis !== \'unknown\' && basis'),
  Rda('/sales-delivery: تكلفة الوحدة = قيمة آخر طلب لا متوسط', 'const r = rows.get(id); if (!r || a.variants.size < 2) continue;', 'const r = rows.get(id); if (!r || true) continue;'),
  Rda('/sales-delivery: المتوسط بلا ترجيح بالكميات', 'a.both += it.q; a.sumCost += it.q * e.cost; a.sumProfit += it.q * (e.price - e.cost);', 'a.both += 1; a.sumCost += e.cost; a.sumProfit += (e.price - e.cost);'),
  Rda('/sales-delivery: المقام كمية خاطئة بالمتوسط', 'r.unitCost = a.both ? round2(a.sumCost / a.both) : 0;', 'r.unitCost = a.both ? round2(a.sumCost / a.priced) : 0;'),
  Rda('/sales-delivery: التعارض يظهر «بلا تكلفة»', "else if (e.costConflict) r.warning = r.warning === 'no_price' ? r.warning : 'cost_conflict';", ''),
  Rda('/sales-delivery: التعارض يغطّي «بلا سعر»', "r.warning = r.warning === 'no_price' ? r.warning : 'cost_conflict';", "r.warning = 'cost_conflict';"),
  R('مفتاح القرار السوقي يُطبَّق على كل الأسواق', 'const dk = `${g.name}|${g.market}|${g.period}`;', 'const dk = `${g.name}||${g.period}`;'),
  Rda('/sales-delivery: fallback لا يُحتسب', "if (pd.basis === 'month_fallback') r.fallbackQty += it.q;", ''),
  R('فترات السريان: التجميع بالشهر لا باليوم', 'const gk = `${x.key}|${marketOf(r)}|${period}`;', 'const gk = `${x.key}|${marketOf(r)}|${period.slice(0, 7)}`;'),
  R('فترات السريان: مفتاح القرار بلا تاريخ الفترة', 'const dk = `${g.name}|${g.market}|${g.period}`;', 'const dk = `${g.name}|${g.market}|${g.period.slice(0, 7)}-01`;'),
  R('فترات السريان: التسليم يُسعَّر ببداية الشهر لا بيومه', 'versionFor(it, istanbulDay(o.delivered_at) || monthStart, m, true)', 'versionFor(it, monthStart, m, true)'),
  R('فترات السريان: المرتجع يُسعَّر ببداية شهر التسليم', 'const pv = versionFor(it, dRef, m);', 'const pv = versionFor(it, dMonth, m);'),
  R('فترات السريان: تاريخ السريان يُسوّى للشهر', 'if (!inferred) row.effective_from = g.period;', 'if (!inferred) row.effective_from = g.period.slice(0, 7) + "-01";'),
  R('توحيد التكلفة: التعارض يأخذ أول قيمة', 'if (costs.length === 1) {', 'if (costs.length >= 1) {'),
  R('توحيد التكلفة: السوق خارج مفتاح المجموعة', 'const gk = `${x.key}|${marketOf(r)}|${period}`;', 'const gk = `${x.key}||${period}`;'),
  R('توحيد التكلفة: الاسم البديل لا يُقرأ', 'const g = groups.get(gk) || { name: x.name,', 'const g = groups.get(gk) || { name: r.item_name,'),
  R('FX: القسمة صارت ضرباً (إيراد الطلب)', 'usd: amount / rate', 'usd: amount * rate'),
  R('FX: USD يُعامل كعملة تحتاج صرفاً', "if (cur === 'USD') return { ok: true,", "if (false) return { ok: true,"),
  R('إيراد: قيمة صفرية تُقبل', "if (!(amount > 0)) return { ok: false, why: 'no_amount', amount, cur };", ''),
  R('FX: سعر الكل يتقدّم على سعر السوق', "m.get(`${currency}|${market}`) ?? m.get(`${currency}|all`)", "m.get(`${currency}|all`) ?? m.get(`${currency}|${market}`)"),
  R('FX مصاريف: القسمة صارت ضرباً', 'if (rate) usd += a / rate;', 'if (rate) usd += a * rate;'),
  R('مرتجع: عامل الشحن معكوس', 'afterDelivery ? 0.5 : 1.5', 'afterDelivery ? 1.5 : 0.5'),
  R('إيراد السوق لا يُضاف', 'M.revenue += sp.total;', ''),
  R('أجور توصيل العميل تُضاف للإيراد', 'M.revenue += sp.total;', "M.revenue += sp.total + (o.shipping_payer === 'customer' ? num(o.delivery_cost) : 0);"),
  afterNeedle('بلا صرف: الطلب يكمل ويحسب تكلفته', 'revenueGaps.push(', 'return;', ''),
  R('مرتجع: التكلفة المفترضة المستردة مُلغاة', 'assumed = costOut - costOut * rr - damaged', 'assumed = 0'),
  R('مرتجع: خصم الإيراد بشهر الإرجاع لا التسليم', 'const dMonth = afterDelivery ? istanbulMonthStart(o.delivered_at)', 'const dMonth = afterDelivery ? monthStart'),
  R('مرتجع: التكلفة بنسخة شهر الإرجاع', 'const pv = versionFor(it, dRef, m);', 'const pv = versionFor(it, monthStart, m);'),
  R('مرتجع: إشارة خصم الإيراد معكوسة', '(afterDelivery ? -revRed + restocked : -damaged)', '(afterDelivery ? revRed + restocked : -damaged)'),
  R('مرتجع: الاسترداد الجزئي مفترض كاملاً', 'const rr = denom > 0 ? Math.min(1, num(o.restock_qty) / denom) : 0;', 'const rr = 1;'),
  R('حد الشهر: النهاية شاملة', 't >= t0 && t < t1', 't >= t0 && t <= t1'),
  R('حد الشهر: البداية حصرية', 't >= t0 && t < t1', 't > t0 && t < t1'),
  R('ألغاء تقدير الإعلان لا يعمل', "summary[k].adsEstimated = !actual('ads', k)", 'summary[k].adsEstimated = true'),
  R('ألغاء تقدير الشحن لا يعمل', "summary[k].shippingEstimated = !actual('shipping', k)", 'summary[k].shippingEstimated = true'),
  R('صافي السوق لا يطرح مصاريفه', 'm.netProfit = m.productProfit - m.expenses;', 'm.netProfit = m.productProfit;'),
  R('صافي الشركة يتجاهل المشترك', 'total.netProfit = total.productProfit - total.expenses;', 'total.netProfit = total.productProfit - total.marketExpenses;'),
  R('المشترك يُهمَل بالمجموع', 'company.shared += r.usd;', 'company.shared += 0;'),
  R('قيد ملغى يُحسب', "if (e.is_void) return { skip: 'void' };", ''),
  R('تحويل داخلي يُحسب', "if (e.entry_type === 'transfer' ||", 'if (false ||'),
  R('قناة بلا سوق تُسند لسوريا', "MARKET_KEYS.includes(ch?.market) ? ch.market : 'unallocated'", "MARKET_KEYS.includes(ch?.market) ? ch.market : 'syria'"),
  R('طلب سوق غير معروف يُسند لسوريا', "MARKET_KEYS.includes(o.market) ? o.market : 'unknown'", "MARKET_KEYS.includes(o.market) ? o.market : 'syria'"),
  R('التسوية (settled) تُعالَج كبيع', "if (o.status === 'settled') return handleSettled(c);", ''),
  R('تاريخ التسليم المجهول يُحسب', "if (o.status === 'delivered' && (!o.delivered_at || o.delivery_basis === 'unknown')) return handleUnknownDelivery(c);", 'if (false) return handleUnknownDelivery(c);'),
  R('الجزئي يصير تقديرياً', "issues.some((i) => i.level === 'partial') ? 'partial'", "issues.some((i) => i.level === 'partial') ? 'estimated'"),
  R('رواتب: اليدوي لا يستبدل المحاسبة', '(manualPayroll.has(r.market) ||', '(false ||'),
  R('رواتب: النقص لا يُكتشف', 'm.payrollMissing = (m.orders > 0 || m.revenueNoFx.orders > 0) &&', 'm.payrollMissing = false &&'),
  R('التغليف: لا تحذير نقص', "packaging_missing: scope === 'company' && m.orders > 0 &&", "packaging_missing: scope === 'company' && false &&"),
  R('براند: لا تصفية', 'arr.filter((it) => it.active && (brand === \'all\' || it.brand === brand))', 'arr.filter((it) => it.active)'),
  R('المعلّق يُعامل كمرتجع مكتمل', "&& inM(o.order_date)) handlePending(c);", "&& inM(o.order_date)) handleCompletedReturn(c);"),
  R('تكلفة ناقصة تُعدّ صفراً', 'if (pv.cost > 0) r.productCost += pv.cost * it.q; else { r.complete = false; M.unpricedUnits += it.q; if (pv.costConflict) M.costConflictUnits += it.q; }', 'r.productCost += pv.cost * it.q;'),
  R('سعر السوق يُستعار من سوريا', "const arr = marketIdx.get(`${key}|${market}`);", "const arr = marketIdx.get(`${key}|syria`) || marketIdx.get(`${key}|${market}`);"),
  R('نسخة الأسعار الموحّدة: المستقبل يتسرّب', "String(r.effective_from).slice(0, 10) <= monthStart) || null)", "String(r.effective_from).slice(0, 10) <= '2099-12-31') || null)"),
  R('أسعار السوق: المستقبل يتسرّب', "String(r.effective_from).slice(0, 10) <= monthStart && (hasN(r[f])", "String(r.effective_from).slice(0, 10) <= '2099-12-31' && (hasN(r[f])"),
  R('مرتجع بتحويل جماعي يُقبل', "o.return_at && !o.return_bulk_suspect", 'o.return_at'),
  R('مصروف يدوي مربوط بقيد يُحتسب مرتين', 'if (e.accounting_entry_id && countedAccIds.has(e.accounting_entry_id)) { manualDup++; continue; }', ''),
  R('المحصَّل بالعملة الأصلية لا يُسجَّل', "M.revenueByCurrency[rv.cur] = (M.revenueByCurrency[rv.cur] || 0) + rv.amount;", ''),
  R('الإيراد المرجعي لا يُحسب', "if (pv.basis === 'market' && pv.price > 0) M.referenceRevenue += pv.price * it.q;", ''),
  R('الدفع الجزئي لا يُعرض', "if (o.payment_status === 'partial') { M.partialPayment.orders++;", "if (false) { M.partialPayment.orders++;"),
  R('توزيع: بالتساوي بدل الكمية', 'rv.usd * (it.q / totalQ)', 'rv.usd * (1 / c.all.length)'),
  R('كمية مشبوهة تُقبل', 'qty > 0 && !bad ? qty : 1', 'qty > 0 ? qty : 1'),
  R('المرجع يعتمد السعر الموحّد القديم', "pv.basis === 'market' && pv.price > 0", 'pv.price > 0'),
  R('حالة التكلفة: ناقصة تُعدّ موحّدة', "costStatus: costConflict ? 'conflict' : cost > 0 ? (mc ? 'market' : 'unified') : 'missing'", "costStatus: mc ? 'market' : 'unified'"),
  R('الأصل بالكتالوج مقلوب', 'catalogKeys.has(key)', '!catalogKeys.has(key)'),
  R('العلامة من الطلب لا تُطبَّق', 'if (o.brand && brand !== \'all\' && o.brand !== brand) {', 'if (false) {'),
  R('اسم الصنف يحدد العلامة بدل الطلب', 'items = o.brand ? all.filter((it) => it.active) : filt(all)', 'items = filt(all)'),
];

// الطفرة «قُتلت» إن فشل أيٌّ من اختبارَي المحرك (الحساب الشهري + قراءة التكلفة عبر الأسماء البديلة D-176)
const runOne = (file) => spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 180000 });
const run = () => { for (const t of ['test-profitability-calc.mjs', 'test-cost-alias-resolution.mjs', 'test-delivery-accounting.mjs']) { const r = runOne(t); if (r.status !== 0) return r; } return { status: 0, stdout: '', stderr: '' }; };
const base = run();
if (base.status !== 0) { console.error('الاختبار الأصلي يفشل — أصلحه أولاً.\n' + (base.stdout || '').split('\n').filter((l) => l.includes('❌')).join('\n')); process.exit(2); }

let killed = 0; const survived = [], inapplicable = [];
for (const m of MUTANTS) {
  const key = m.file || 'calc';
  const src = m.mutate(originals[key]);
  if (src === null) { inapplicable.push(m.name); continue; }
  if (src === originals[key]) { inapplicable.push(m.name + ' (لا فرق)'); continue; }
  fs.writeFileSync(FILES[key], src);
  const r = run();
  restore();
  const failedAsserts = ((r.stderr || '') + (r.stdout || '')).split('\n').filter((l) => l.startsWith('❌')).length;
  if (r.status !== 0) { killed++; console.log(`✅ قُتلت: ${m.name} — ${failedAsserts ? failedAsserts + ' assert' : 'استثناء/انهيار'}`); }
  else { survived.push(m.name); console.log(`❌ نجت:  ${m.name}`); }
}
restore();
console.log(`\nالطفرات: ${MUTANTS.length} · قُتلت ${killed} · نجت ${survived.length} · غير قابلة للتطبيق ${inapplicable.length}`);
if (inapplicable.length) console.log('غير قابلة للتطبيق (النص لم يُوجد — حدّث القائمة):\n - ' + inapplicable.join('\n - '));
if (survived.length) console.log('نجت (ثغرة اختبار أو طفرة مكافئة):\n - ' + survived.join('\n - '));
process.exit(survived.length || inapplicable.length ? 1 : 0);
