// One server-side bridge for every non-UI order status writer.
// It calls the same atomic/idempotent RPC used by the React app.
const DEDUCTED = new Set([
  'preparing', 'ready', 'motor_prep', 'at_center', 'shipped', 'on_way',
  'special_delivery', 'motor', 'prepaid', 'delivered', 'settled',
]);
const RETURN_STAGES: Record<string, string> = { returning: 'in_transit', returned: 'received' };
const EXTERNAL_SOURCES = new Set(['star_network', 'uae_sheet_import']);

const norm = (s: unknown) => String(s ?? '')
  .toLowerCase()
  .replace(/i̇/g, 'i').replace(/[ıİ]/g, 'i')
  .replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
  .replace(/[çÇ]/g, 'c').replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u')
  .replace(/[^a-z0-9؀-ۿ]/g, '').replace(/^lowes/, '');

const ALIASES: Record<string, string> = {
  'ROSEMARY SERUM': 'Rosemary Oil',
  'Body toner': 'PORE TIHGTENNING & PURIFINE TONER',
  'sakal ve Bıyık Serumu': 'BEARD SERUM',
  'GÖĞÜS BAKIM SERUM': 'BREAST CARE SERUM',
  'WHITHING CREAM': 'WHITENING CREAM',
};

export async function syncOrderInventory(supabase: any, order: any, actor: string) {
  if (!order?.id || (order.brand || 'lowes') !== 'lowes') return { skipped: 'brand' };
  if (EXTERNAL_SOURCES.has(order.source)) return { skipped: 'external_source' };

  let warehouseId: string | null = null;
  if (order.handler_name) {
    const { data: profile } = await supabase.from('profiles')
      .select('warehouse_id').eq('employee_name', order.handler_name).maybeSingle();
    if (profile?.warehouse_id) {
      const { data: wh } = await supabase.from('wh_warehouses')
        .select('market').eq('id', profile.warehouse_id).maybeSingle();
      if (!wh?.market || wh.market === order.market) warehouseId = profile.warehouse_id;
    }
  }
  if (!warehouseId) {
    const { data: wh } = await supabase.from('wh_warehouses')
      .select('id').eq('type', 'sales').eq('market', order.market)
      .eq('is_active', true).maybeSingle();
    warehouseId = wh?.id ?? null;
  }
  if (!warehouseId) throw new Error(`لا يوجد مخزن مصدر للسوق ${order.market || 'غير محدد'}`);

  const { data: products, error: productError } = await supabase
    .from('products').select('id, name, name_en');
  if (productError) throw productError;
  const byName = new Map<string, string>();
  for (const p of products ?? []) {
    if (p.name) byName.set(norm(p.name), p.id);
    if (p.name_en) byName.set(norm(p.name_en), p.id);
  }
  const aliasToId = new Map<string, string>();
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    const id = byName.get(norm(canonical));
    if (id) aliasToId.set(norm(alias), id);
  }
  const lines: Array<{ productId: string; qty: number }> = [];
  const missing: string[] = [];
  for (const item of (Array.isArray(order.items) ? order.items : [])) {
    const id = item.product_id || item.productId || byName.get(norm(item.name)) || aliasToId.get(norm(item.name));
    const qty = Number(item.qty ?? item.quantity ?? 1);
    if (!id && qty > 0) missing.push(String(item.name || 'غير معروف'));
    else if (id && qty > 0) lines.push({ productId: id, qty });
  }
  if (missing.length) throw new Error(`أصناف غير مربوطة بالكتالوج: ${missing.join('، ')}`);

  const returnStage = RETURN_STAGES[order.status];
  if (returnStage) {
    // Keep the original reservation while the parcel is in transit/awaiting
    // inspection. It must not become saleable merely because the status changed.
    const { data, error } = await supabase.rpc('wh_register_order_return', {
      p_order_id: order.id,
      p_warehouse: warehouseId,
      p_items: lines,
      p_stage: returnStage,
      p_performed_by: actor || null,
      p_reason: `حالة مرتجع: ${order.status}`,
    });
    if (error) throw error;
    return data ?? { ok: true, return_status: returnStage };
  }

  const { data, error } = await supabase.rpc('wh_sync_order_stock', {
    p_order_id: order.id,
    p_warehouse: warehouseId,
    p_lines: lines,
    p_should_be_out: DEDUCTED.has(order.status),
    p_performed_by: actor || null,
    p_release_reason: DEDUCTED.has(order.status) ? null : `استرداد بسبب حالة الطلب: ${order.status}`,
  });
  if (error) throw error;
  return data ?? { ok: true };
}
