// =============================================================
// Accounting Zustand Store
// =============================================================

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  ACCOUNTING_REALTIME_INTERVAL_MS,
  calcLedgerBalance,
  totalByType,
  ENTRY_TYPE,
} from '../types/accounting.types.js';

const INITIAL_STATE = {
  entries:    [],
  categories: [],
  channels:   [],
  filters: { type: null, from: null, to: null, category: null },
  loading: { entries: false, action: false, categories: false },
  error: null,
  _initialized: false,
  _userId: null,
  _realtimeTimer: null,
};

const useAccountingStore = create()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL_STATE,

    async init(userId) {
      if (get()._initialized && get()._userId === userId) return;
      set({ _userId: userId, _initialized: true, error: null });
      await Promise.all([get().loadEntries(), get().loadCategories(), get().loadChannels()]);
      get()._startRealtime();
    },

    teardown() {
      get()._stopRealtime();
      set({ ...INITIAL_STATE });
    },

    // ── Entries ────────────────────────────────────────────────────────────

    async loadEntries(extra = {}) {
      get()._setLoading('entries', true);
      try {
        const { fetchEntries } = await import('../services/accountingService.js');
        // الرصيد/الخزينة تعتمد على الدفتر الكامل — لا نمرّر فلاتر التاريخ/النوع للسيرفر،
        // والتصفية تتم في الواجهة (filtered useMemo) كي تبقى entries هي الدفتر الكامل دائماً.
        const entries = await fetchEntries({ ...extra });
        set({ entries });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('entries', false);
      }
    },

    async createEntry(data) {
      get()._setLoading('action', true);
      try {
        if (!get()._userId) throw new Error('الجلسة غير جاهزة — أعد تسجيل الدخول');
        const { createEntry } = await import('../services/accountingService.js');
        const entry = await createEntry({ ...data, created_by: get()._userId });
        set(s => ({ entries: [entry, ...s.entries] }));
        return entry;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // تحويل بساقين بين الكتابين (تسليم/توريد الرصيد) — يُضيف القيدين فوراً.
    async createTransfer(args) {
      get()._setLoading('action', true);
      try {
        if (!get()._userId) throw new Error('الجلسة غير جاهزة — أعد تسجيل الدخول');
        const { createTransfer } = await import('../services/accountingService.js');
        const legs = await createTransfer({ ...args, createdBy: get()._userId });
        set(s => ({ entries: [...legs, ...s.entries] }));
        return legs;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // تحويل بين محفظتين (ساقان مرتبطان) — إدراج ذرّي بنداء واحد كي لا تبقى ساق يتيمة.
    async createWalletTransfer(args) {
      get()._setLoading('action', true);
      try {
        if (!get()._userId) throw new Error('الجلسة غير جاهزة — أعد تسجيل الدخول');
        const { createWalletTransfer } = await import('../services/accountingService.js');
        const legs = await createWalletTransfer({ ...args, createdBy: get()._userId });
        set(s => ({ entries: [...legs, ...s.entries] }));
        return legs;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async updateEntry(id, data) {
      get()._setLoading('action', true);
      try {
        const { updateEntry } = await import('../services/accountingService.js');
        const updated = await updateEntry(id, data);
        set(s => ({ entries: s.entries.map(e => (e.id === id ? updated : e)) }));
        return updated;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    async deleteEntry(id) {
      get()._setLoading('action', true);
      try {
        const { deleteEntry } = await import('../services/accountingService.js');
        await deleteEntry(id);
        set(s => ({ entries: s.entries.filter(e => e.id !== id) }));
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // ── Categories ─────────────────────────────────────────────────────────

    async loadCategories(type = null) {
      get()._setLoading('categories', true);
      try {
        const { fetchCategories } = await import('../services/accountingService.js');
        const categories = await fetchCategories(type);
        set({ categories });
      } catch (err) {
        set({ error: err.message });
      } finally {
        get()._setLoading('categories', false);
      }
    },

    async createCategory(data) {
      get()._setLoading('action', true);
      try {
        const { createCategory } = await import('../services/accountingService.js');
        const cat = await createCategory(data);
        set(s => ({ categories: [...s.categories, cat] }));
        return cat;
      } catch (err) {
        set({ error: err.message });
        throw err;
      } finally {
        get()._setLoading('action', false);
      }
    },

    // ── Channels ─────────────────────────────────────────────────────────────

    async loadChannels() {
      try {
        const { fetchChannels } = await import('../services/accountingService.js');
        set({ channels: await fetchChannels() });
      } catch (err) {
        set({ error: err.message });
      }
    },

    async createChannel(data) {
      get()._setLoading('action', true);
      try {
        const { createChannel } = await import('../services/accountingService.js');
        const ch = await createChannel({ ...data, created_by: get()._userId });
        set(s => ({ channels: [...s.channels, ch].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)) }));
        return ch;
      } catch (err) { set({ error: err.message }); throw err; }
      finally { get()._setLoading('action', false); }
    },

    async updateChannel(id, data) {
      get()._setLoading('action', true);
      try {
        const { updateChannel } = await import('../services/accountingService.js');
        const ch = await updateChannel(id, data);
        set(s => ({ channels: s.channels.map(c => (c.id === id ? ch : c)) }));
        return ch;
      } catch (err) { set({ error: err.message }); throw err; }
      finally { get()._setLoading('action', false); }
    },

    async deleteChannel(id) {
      get()._setLoading('action', true);
      try {
        const { deleteChannel } = await import('../services/accountingService.js');
        await deleteChannel(id);
        set(s => ({ channels: s.channels.filter(c => c.id !== id) }));
      } catch (err) { set({ error: err.message }); throw err; }
      finally { get()._setLoading('action', false); }
    },

    // ── Filters ────────────────────────────────────────────────────────────

    setFilters(partial) {
      set(s => ({ filters: { ...s.filters, ...partial } }));
      get().loadEntries();
    },

    resetFilters() {
      set({ filters: { type: null, from: null, to: null, category: null } });
      get().loadEntries();
    },

    clearError() {
      set({ error: null });
    },

    // ── Computed ───────────────────────────────────────────────────────────

    getLedgerKPIs() {
      const { entries } = get();
      const income   = totalByType(entries, ENTRY_TYPE.INCOME);
      const expense  = totalByType(entries, ENTRY_TYPE.EXPENSE);
      const advance  = totalByType(entries, ENTRY_TYPE.ADVANCE);
      const salary   = totalByType(entries, ENTRY_TYPE.SALARY);
      const balance  = income - expense - salary;
      return { income, expense, advance, salary, balance, total: entries.length };
    },

    getEntriesByCategory() {
      const { entries } = get();
      const map = {};
      entries.forEach(e => {
        if (e.entry_type === ENTRY_TYPE.TRANSFER) return;
        const key = e.category || 'غير مصنف';
        if (!map[key]) map[key] = { label: key, total: 0, count: 0 };
        map[key].total += Number(e.amount_usd ?? 0);
        map[key].count += 1;
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    },

    // ── Internal ───────────────────────────────────────────────────────────

    _setLoading(key, val) {
      set(s => ({ loading: { ...s.loading, [key]: val } }));
    },

    _startRealtime() {
      const timer = setInterval(() => {
        if (!get()._initialized) return;
        get().loadEntries();
      }, ACCOUNTING_REALTIME_INTERVAL_MS);
      set({ _realtimeTimer: timer });
    },

    _stopRealtime() {
      const { _realtimeTimer } = get();
      if (_realtimeTimer) clearInterval(_realtimeTimer);
      set({ _realtimeTimer: null });
    },
  }))
);

export default useAccountingStore;
