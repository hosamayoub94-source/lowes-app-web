// =============================================================
// shippingService — admin-managed carrier list for the order form.
//
// Source of truth = `accounting_channels` (kind='shipping'). A carrier
// added once in «قنوات المحاسبة» (/admin/channels) therefore shows up in
// BOTH the order form's «ارسال مع» picker AND the expenses/accounting
// channel list — one add, two places (the owner's request).
//
// Safety net: if the DB is empty/unreachable, the order form falls back to
// the hardcoded SYRIA/TURKEY carrier lists in `@data/cities`, so creating
// an order never breaks even offline or before any channel is seeded.
//
// Market tagging: `accounting_channels.market` ('syria' | 'turkey' | 'both')
// is optional. While that column does not exist yet, channels are treated
// as Syria-side (that's where carriers actually churn); Turkey keeps its
// hardcoded list. Once the column is added (migration 0009) the per-market
// tag is honored automatically — no code change needed.
// =============================================================
import { create } from 'zustand';
import { shippingForMarket as fallbackShipping } from '@data/cities';

// Fetch active shipping carriers. Uses the authenticated app session, so the
// `accounting_channels` SELECT RLS (auth.uid() IS NOT NULL) is satisfied.
export async function fetchShippingChannels() {
  const { supabase } = await import('@services/supabase');
  const { data, error } = await supabase
    .from('accounting_channels')
    .select('id, name_ar, kind, is_active, sort_order')
    .eq('kind', 'shipping')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return data || [];
}

// Merge the hardcoded defaults with the admin-managed carriers for a market
// (union, deduped, order preserved). DB-added carriers (e.g. «بابل») appear;
// the hardcoded defaults remain as a familiar, always-present safety net.
export function mergeShipping(channels, market) {
  const base = fallbackShipping(market) || [];
  const db = (channels || [])
    .filter((c) => c && c.is_active !== false && String(c.kind) === 'shipping')
    // honor the market tag when present; otherwise treat channels as Syria-side
    .filter((c) => (c.market ? c.market === market || c.market === 'both' : market === 'syria'))
    .map((c) => String(c.name_ar || '').trim())
    .filter(Boolean);
  return [...new Set([...base, ...db])];
}

// Tiny shared store so the order modal reads carriers once per session and
// admin edits can nudge a refresh without a full page reload.
export const useShippingStore = create((set, get) => ({
  channels: [],
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      const channels = await fetchShippingChannels();
      set({ channels, loaded: true });
    } catch {
      set({ channels: [], loaded: true }); // fallback list still applies via mergeShipping
    } finally {
      set({ loading: false });
    }
  },
  reload: async () => {
    set({ loading: true });
    try {
      const channels = await fetchShippingChannels();
      set({ channels, loaded: true });
    } catch {
      /* keep whatever we had */
    } finally {
      set({ loading: false });
    }
  },
}));
