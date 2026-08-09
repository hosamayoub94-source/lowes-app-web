// =============================================================
// Accounting Zustand Store
// =============================================================

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  ACCOUNTING_REALTIME_INTERVAL_MS,
  ENTRY_TYPE,
  convertToUsd,
} from '../types/accounting.types.js';

const INITIAL_STATE = {
  entries:    [],
  categories: [],
  channels:   [],
  rates:      {},   // { TRY: units-per-USD, SYP: units-per-USD } — لتوحيد KPIs/التوزيع بالدولار
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
      await Promise.all([get().loadEntries(), get().loadCategories(), get().loadChannels(), get().loadRates()]);
      get()._startRealtime();
    },

    // أسعار الصرف — نفس منطق بناء rateMap بـChannelPnL.jsx (أحدث سطر
    // مباشر USD→X)، لكن مركزي هون ليستفيد منه getLedgerKPIs/getEntriesByCategory.
    async loadRates() {
      try {
        const { fetchExchangeRates } = await import('../services/accountingService.js');
        const rows = await fetchExchangeRates();
        const m = {};
        for (const r of (rows || [])) {
          if (r.from_currency === 'USD' && r.to_currency && m[r.to_currency] === undefined) {
            m[r.to_currency] = Number(r.rate) || 0;
          }
        }
        set({ rates: m });
      } catch { /* يبقى {} — التحويل يرجع 0 بدل ما يكسر الشاشة */ }
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

    // تعليم/إلغاء تعليم قيد كـ"إدخال خاطئ" — بديل الحذف (طلب مالك 9 آب 2026):
    // "بدل ما نحذف القيد الخاطئ (بيسبب مشاكل بالمحاسبة)، بدنا نحدده وبس —
    // يضل بالسجل متظلل بالأسود، بلا حذف، وما يُحتسب بأي رصيد أو تقرير."
    async setEntryVoid(id, isVoid, reason) {
      get()._setLoading('action', true);
      try {
        const { updateEntry } = await import('../services/accountingService.js');
        const updated = await updateEntry(id, {
          is_void: isVoid,
          void_reason: isVoid ? (reason || null) : null,
          voided_by: isVoid ? get()._userId : null,
          voided_at: isVoid ? new Date().toISOString() : null,
        });
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
      // ⚠️ totalByType يجمع amount_usd فقط — القيود المسجَّلة بالليرة/الليرة
      // السورية (amount_try/amount_syp) كانت تختفي كلياً من هالبطاقات وأي
      // تقرير يعتمد عليها (تقرير الطباعة بـAccountingDashboard.jsx كان
      // يتوقع أصلاً income_try/income_syp وما كانت موجودة). صار كل نوع
      // يُجمَع بكل عملة على حدة (بلا تحويل — نفس النمط الصحيح المستخدم
      // بكروت الـKPI الرئيسية بالشاشة).
      const { entries } = get();
      const sumCur = (type, field) => entries
        .filter(e => e.entry_type === type && !e.is_void) // إدخال خاطئ مُعلَّم لا يُحتسب (طلب مالك 9 آب 2026)
        .reduce((s, e) => s + Number(e[field] ?? 0), 0);
      const income = sumCur(ENTRY_TYPE.INCOME, 'amount_usd');
      const income_try = sumCur(ENTRY_TYPE.INCOME, 'amount_try');
      const income_syp = sumCur(ENTRY_TYPE.INCOME, 'amount_syp');
      const expense = sumCur(ENTRY_TYPE.EXPENSE, 'amount_usd');
      const expense_try = sumCur(ENTRY_TYPE.EXPENSE, 'amount_try');
      const expense_syp = sumCur(ENTRY_TYPE.EXPENSE, 'amount_syp');
      const advance = sumCur(ENTRY_TYPE.ADVANCE, 'amount_usd');
      const advance_try = sumCur(ENTRY_TYPE.ADVANCE, 'amount_try');
      const advance_syp = sumCur(ENTRY_TYPE.ADVANCE, 'amount_syp');
      const salary = sumCur(ENTRY_TYPE.SALARY, 'amount_usd');
      const salary_try = sumCur(ENTRY_TYPE.SALARY, 'amount_try');
      const salary_syp = sumCur(ENTRY_TYPE.SALARY, 'amount_syp');
      const balance = income - expense - salary;
      const balance_try = income_try - expense_try - salary_try;
      const balance_syp = income_syp - expense_syp - salary_syp;
      return {
        income, income_try, income_syp,
        expense, expense_try, expense_syp,
        advance, advance_try, advance_syp,
        salary, salary_try, salary_syp,
        balance, balance_try, balance_syp,
        total: entries.length,
      };
    },

    getEntriesByCategory() {
      // ترتيب/عرض الشريط الجانبي يحتاج رقماً واحداً قابلاً للمقارنة، فيُحوَّل
      // كل مبلغ لمعادله بالدولار عبر rates (بخلاف كروت الـKPI اللي تعرض كل
      // عملة لحالها) — بدون هالتحويل أي تصنيف TRY/SYP-فقط كان يظهر total:0.
      const { entries, rates } = get();
      const map = {};
      entries.forEach(e => {
        if (e.is_void) return; // إدخال خاطئ مُعلَّم لا يُحتسب (طلب مالك 9 آب 2026)
        if (e.entry_type === ENTRY_TYPE.TRANSFER) return;
        const key = e.category || 'غير مصنف';
        if (!map[key]) map[key] = { label: key, total: 0, count: 0 };
        map[key].total += Number(e.amount_usd ?? 0)
          + convertToUsd(e.amount_try, 'TRY', rates)
          + convertToUsd(e.amount_syp, 'SYP', rates);
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
