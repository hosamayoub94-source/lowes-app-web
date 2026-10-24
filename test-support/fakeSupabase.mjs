// In-memory Supabase stand-in shared by the payroll engine simulation tests.
// No network, no production data. Supports select/insert/upsert/update/delete with the filters the engine uses.
// opts.syncRunSummary mimics the production trigger (migration 20261024): every entry write refreshes
// payroll_runs.employee_count / total_net_usd for the affected run.
export function makeDb(seed, opts = {}) {
  const tables = JSON.parse(JSON.stringify(seed));
  const log = [];
  const syncSummary = (runIds) => {
    if (!opts.syncRunSummary) return;
    for (const id of new Set(runIds.filter(Boolean))) {
      const run = (tables.payroll_runs || []).find((r) => r.id === id);
      if (!run) continue;
      const lines = (tables.payroll_entries || []).filter((e) => e.run_id === id);
      run.employee_count = lines.length;
      run.total_net_usd = Math.round(lines.reduce((t, e) => t + (Number(e.net_salary_usd) || 0), 0) * 100) / 100;
    }
  };
  const builder = (name) => {
    const st = { op: 'select', filters: [], payload: null, opts: null, range: null, single: false, order: null };
    const q = {};
    const add = (fn) => (...a) => { st.filters.push(fn(...a)); return q; };
    q.select = () => q;
    q.insert = (p) => { st.op = 'insert'; st.payload = p; return q; };
    q.upsert = (p, o) => { st.op = 'upsert'; st.payload = p; st.opts = o; return q; };
    q.update = (p) => { st.op = 'update'; st.payload = p; return q; };
    q.delete = () => { st.op = 'delete'; return q; };
    q.eq = add((c, v) => (r) => r[c] === v);
    q.neq = add((c, v) => (r) => r[c] !== v);
    q.in = add((c, v) => (r) => v.includes(r[c]));
    q.gte = add((c, v) => (r) => String(r[c] ?? '') >= v);
    q.lte = add((c, v) => (r) => String(r[c] ?? '') <= v);
    q.lt = add((c, v) => (r) => String(r[c] ?? '') < v);
    q.gt = add((c, v) => (r) => String(r[c] ?? '') > v);
    q.like = add((c, v) => (r) => String(r[c] ?? '').startsWith(v.replace(/%$/, '')));
    q.or = () => q; // profile visibility filter is exercised by the fixture itself
    q.order = () => q;
    q.range = (a, b) => { st.range = [a, b]; return q; };
    q.limit = () => q;
    q.single = () => { st.single = true; return q; };
    q.maybeSingle = q.single;
    q.then = (res, rej) => {
      try {
        const rows = (tables[name] ||= []);
        const match = (r) => st.filters.every((f) => f(r));
        let data;
        if (st.op === 'select') {
          data = rows.filter(match);
          if (st.range) data = data.slice(st.range[0], st.range[1] + 1);
        } else if (st.op === 'delete') {
          const gone = rows.filter(match);
          tables[name] = rows.filter((r) => !match(r));
          log.push({ op: 'delete', table: name, count: gone.length });
          if (name === 'payroll_entries') syncSummary(gone.map((g) => g.run_id));
          data = gone;
        } else if (st.op === 'upsert' || st.op === 'insert') {
          const keys = (st.opts?.onConflict || '').split(',').filter(Boolean);
          const list = Array.isArray(st.payload) ? st.payload : [st.payload];
          data = list.map((p) => {
            const i = keys.length ? rows.findIndex((r) => keys.every((k) => r[k] === p[k])) : -1;
            if (i >= 0) { rows[i] = { ...rows[i], ...p }; return rows[i]; }
            const row = { id: `${name}-${rows.length + 1}`, ...p }; rows.push(row); return row;
          });
          log.push({ op: st.op, table: name, count: list.length });
          if (name === 'payroll_entries') syncSummary(list.map((p) => p.run_id));
          if (name === "payroll_entries") syncSummary(list.map((p) => p.run_id));
        } else if (st.op === 'update') {
          data = rows.filter(match).map((r) => Object.assign(r, st.payload));
        }
        const out = st.single ? { data: data?.[0] ?? null, error: null } : { data, error: null };
        return Promise.resolve(out).then(res, rej);
      } catch (e) { return Promise.resolve({ data: null, error: { message: String(e) } }).then(res, rej); }
    };
    return q;
  };
  return { client: { from: builder }, tables, log };
}

