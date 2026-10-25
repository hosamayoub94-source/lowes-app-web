// =============================================================
// pin-change -- منطق الدالة (D-090 · الخطوة 2)
// المسار الوحيد لتغيير أي PIN. يحدّث profiles.pin وكلمة سر Supabase Auth
// معاً (إن وُجد حساب Auth) — إما الاثنان أو لا شيء، مع تعويض عند الفشل.
//
//   mode 'self'  → الموظف نفسه: employee_name + current_pin + new_pin
//                  (الـPIN الحالي يُفحص هنا بالسيرفر — نفس منطق verify-pin)
//   mode 'admin' → أدمن بجلسة Auth حقيقية ومدرَج بـpin_admins: target_id + new_pin
//                  ممنوع: الهدف = الأدمن نفسه (يستخدم self)، أو الهدف أدمن آخر
//                  بـpin_admins (قرار حسام: كل أدمن يغيّر PIN تبعه فقط).
//
// Audit 2026-10 (F-09): when internal_secrets.auth_mode = 'derived' the Auth password no longer depends on the PIN
// (verify-pin owns it), so a PIN change only updates profiles.pin and CANNOT desynchronise Auth by construction.
// In 'compat' mode (default, today) behaviour is exactly the original: Auth password "lp:<pin>" updated first, with compensation.
//
// لا يُنشئ حساب Auth لأحد. لا يكتب أي PIN بالسجلات أو بالرد.
// هذا الملف بلا أي import — يُحقن عميل Supabase (service role) من index.ts،
// ليُختبر منطقياً بـNode بعميل مزيّف (test-pin-change-handler.mjs).
// =============================================================

export const PIN_RE = /^\d{4,6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const derivePass = (pin: string) => `lp:${pin}`;

type Result = { status: number; body: Record<string, unknown> };
const res = (status: number, body: Record<string, unknown>): Result => ({ status, body });

// deno-lint-ignore no-explicit-any
export async function handlePinChange(admin: any, body: any, authHeader: string | null): Promise<Result> {
  const audit = (action: string, actorId: string | null, actorName: string | null,
                 targetId: string | null, targetName: string | null, details: unknown = {}) =>
    Promise.resolve(admin.from('network_audit').insert({
      actor_id: actorId, actor_name: actorName, action,
      target_id: targetId, target_name: targetName, details,
    })).then(() => {}, () => {});

  const mode = body?.mode;
  const newPin = String(body?.new_pin ?? '').trim();
  if (!PIN_RE.test(newPin)) return res(400, { ok: false, error: 'invalid_pin' });

  // ── تحديد الهوية والهدف ──────────────────────────────────────
  // deno-lint-ignore no-explicit-any
  let target: any = null;
  let actorId: string | null = null;
  let actorName: string | null = null;

  if (mode === 'self') {
    const name = String(body?.employee_name ?? '').trim();
    const current = String(body?.current_pin ?? '').trim();
    if (!name || !current) return res(400, { ok: false, error: 'bad_request' });
    const { data: p, error } = await admin.from('profiles')
      .select('id, employee_name, pin, is_active').eq('employee_name', name).limit(1).maybeSingle();
    if (error) return res(500, { ok: false, error: 'server_error' });
    // رد موحّد لعدم الوجود/التعطيل/الـPIN الخاطئ — لا يكشف أي حالة.
    if (!p || p.is_active === false) return res(200, { ok: false, error: 'wrong_pin' });
    if (String(p.pin ?? '').trim() !== current) return res(200, { ok: false, error: 'wrong_pin' });
    target = p; actorId = p.id; actorName = p.employee_name;

  } else if (mode === 'admin') {
    const token = String(authHeader ?? '').replace('Bearer ', '').trim();
    if (!token) return res(401, { ok: false, error: 'unauthorized' });
    const { data: gu } = await admin.auth.getUser(token);
    const user = gu?.user;
    if (!user) return res(401, { ok: false, error: 'unauthorized' });

    const [{ data: allowed }, { data: me }] = await Promise.all([
      admin.from('pin_admins').select('profile_id').eq('profile_id', user.id).maybeSingle(),
      admin.from('profiles').select('employee_name, is_active').eq('id', user.id).maybeSingle(),
    ]);
    if (!allowed || !me || me.is_active === false) return res(403, { ok: false, error: 'forbidden' });

    const targetId = String(body?.target_id ?? '');
    if (!UUID_RE.test(targetId)) return res(400, { ok: false, error: 'bad_request' });
    if (targetId === user.id) return res(400, { ok: false, error: 'use_self_mode' });

    const { data: protectedTarget } = await admin.from('pin_admins')
      .select('profile_id').eq('profile_id', targetId).maybeSingle();
    if (protectedTarget) return res(403, { ok: false, error: 'protected_target' });

    const { data: p, error } = await admin.from('profiles')
      .select('id, employee_name, pin, is_active').eq('id', targetId).maybeSingle();
    if (error) return res(500, { ok: false, error: 'server_error' });
    if (!p) return res(404, { ok: false, error: 'not_found' });
    target = p; actorId = user.id; actorName = me.employee_name;

  } else {
    return res(400, { ok: false, error: 'bad_request' });
  }

  const oldPin: string | null = target.pin == null ? null : String(target.pin).trim();
  if (oldPin === newPin) return res(200, { ok: true, unchanged: true });

  // ── derived mode: Auth is independent of the PIN -> only profiles.pin changes ─────────────
  const { data: modeRow } = await admin.from('internal_secrets').select('secret').eq('name', 'auth_mode').maybeSingle();
  if (modeRow?.secret === 'derived') {
    let dq = admin.from('profiles').update({ pin: newPin }).eq('id', target.id);
    dq = target.pin == null ? dq.is('pin', null) : dq.eq('pin', target.pin);
    const { data: dupd, error: dErr } = await dq.select('id');
    if (dErr || !dupd || dupd.length !== 1) {
      await audit('pin_change_failed', actorId, actorName, target.id, target.employee_name, { mode, stage: 'profile', concurrent: !dErr });
      return res(dErr ? 500 : 409, { ok: false, error: dErr ? 'profile_update_failed' : 'pin_changed_concurrently' });
    }
    await audit('pin_change', actorId, actorName, target.id, target.employee_name, { mode, auth_synced: false, auth_mode: 'derived' });
    return res(200, { ok: true, auth_synced: false });
  }

  // ── هل عنده حساب Auth؟ (لا نُنشئ حساباً لأحد) ─────────────────
  const { data: au, error: auErr } = await admin.auth.admin.getUserById(target.id);
  const notFound = !!auErr && (auErr.status === 404 || auErr.code === 'user_not_found');
  if (auErr && !notFound) {
    await audit('pin_change_failed', actorId, actorName, target.id, target.employee_name, { mode, stage: 'auth_lookup' });
    return res(502, { ok: false, error: 'auth_lookup_failed' });
  }
  const hasAuth = !!au?.user;

  // ── 1) Auth أولاً ─────────────────────────────────────────────
  if (hasAuth) {
    const { error } = await admin.auth.admin.updateUserById(target.id, { password: derivePass(newPin) });
    if (error) {
      await audit('pin_change_failed', actorId, actorName, target.id, target.employee_name, { mode, stage: 'auth' });
      return res(502, { ok: false, error: 'auth_update_failed' });
    }
  }

  // ── 2) profiles.pin بشرط أن القديم لم يتغيّر بالأثناء ──────────
  let q = admin.from('profiles').update({ pin: newPin }).eq('id', target.id);
  q = target.pin == null ? q.is('pin', null) : q.eq('pin', target.pin);
  const { data: upd, error: pErr } = await q.select('id');

  if (pErr || !upd || upd.length !== 1) {
    // ── تعويض: أرجع كلمة سر Auth لتطابق profiles.pin الحالي ────────
    // نقرأ الـPIN الحالي من جديد بدل افتراض القديم: لو طلب آخر متزامن
    // سبقنا وكتب PIN جديداً، إرجاع القديم كان سيخلق عدم تطابق.
    if (hasAuth) {
      const { data: cur } = await admin.from('profiles').select('pin').eq('id', target.id).maybeSingle();
      const restorePin = cur && cur.pin != null ? String(cur.pin).trim() : oldPin;
      const { error: rbErr } = restorePin
        ? await admin.auth.admin.updateUserById(target.id, { password: derivePass(restorePin) })
        : { error: { message: 'no_pin_to_restore' } };
      if (rbErr) {
        await audit('pin_desync', actorId, actorName, target.id, target.employee_name, { mode });
        return res(500, { ok: false, error: 'desync' });
      }
    }
    await audit('pin_change_failed', actorId, actorName, target.id, target.employee_name,
      { mode, stage: 'profile', concurrent: !pErr });
    return res(pErr ? 500 : 409, { ok: false, error: pErr ? 'profile_update_failed' : 'pin_changed_concurrently' });
  }

  await audit('pin_change', actorId, actorName, target.id, target.employee_name, { mode, auth_synced: hasAuth });
  return res(200, { ok: true, auth_synced: hasAuth });
}
