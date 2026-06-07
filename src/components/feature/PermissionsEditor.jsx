// =============================================================
// PermissionsEditor — professional, grouped permission management.
//
// Model: role template (base) + per-permission overrides.
//   • A base (role-default) permission can be REVOKED  → denied_permissions
//   • A non-base permission can be GRANTED             → extra_permissions
// Each row is a single ON/OFF toggle; the badge shows the SOURCE
// (من الدور / إضافية / ممنوعة) so the admin always knows why.
//
// Admin role = everything, locked on.
// =============================================================
import { useMemo } from 'react';
import { ROLES } from '@data/teams';
import {
  PERMISSION_LABELS,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_GROUPS,
  ROLE_TEMPLATES,
  basePermissionsFor,
  resolveProfilePermissions,
  permissionState,
} from '@data/permissions';

export default function PermissionsEditor({ roleType, extra = [], denied = [], onChange }) {
  const isAdminRole = roleType === ROLES.ADMIN;

  const effective = useMemo(
    () => resolveProfilePermissions({ role_type: roleType, extra_permissions: extra, denied_permissions: denied }),
    [roleType, extra, denied]
  );
  const baseSet = useMemo(() => basePermissionsFor(roleType), [roleType]);

  // Toggle a single permission, updating extra/denied appropriately.
  const toggle = (permKey) => {
    if (isAdminRole) return; // admin = all on, immutable
    const isBase  = baseSet.has(permKey);
    const extraS  = new Set(extra);
    const deniedS = new Set(denied);
    const on = effective.has(permKey);
    if (isBase) {
      if (on) deniedS.add(permKey);     // revoke a role default
      else    deniedS.delete(permKey);  // restore it
    } else {
      if (on) extraS.delete(permKey);   // remove a granted extra
      else    extraS.add(permKey);      // grant on top of role
    }
    onChange?.({ extra: [...extraS], denied: [...deniedS] });
  };

  const tpl = ROLE_TEMPLATES[roleType];

  return (
    <div className="space-y-4">
      {/* Role responsibility + live preview */}
      <div className="rounded-xl bg-navy/5 border border-navy/10 p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-text flex items-center gap-1.5">
            <span>{tpl?.icon}</span> {tpl?.label ?? roleType}
          </p>
          <span className="text-[11px] font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-full">
            {isAdminRole ? 'كل الصلاحيات' : `${effective.size} صلاحية فعّالة`}
          </span>
        </div>
        {tpl?.responsibility && <p className="text-xs text-muted leading-relaxed">{tpl.responsibility}</p>}
      </div>

      {isAdminRole ? (
        <p className="text-xs text-amber-fg bg-amber-bg border border-amber/30 rounded-xl px-3 py-2.5">
          👑 الأدمن يملك كل الصلاحيات تلقائياً ولا يمكن تقييدها.
        </p>
      ) : (
        PERMISSION_GROUPS.map(group => (
          <div key={group.key} className="space-y-1.5">
            <p className="text-[11px] font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <span>{group.icon}</span> {group.label}
            </p>
            <div className="space-y-1.5">
              {group.permissions.map(permKey => {
                const state = permissionState(roleType, permKey, extra, denied);
                const on    = state === 'base' || state === 'granted';
                const badge =
                  state === 'denied'  ? { t: 'ممنوعة',  c: 'bg-red-bg text-red-fg' }
                  : state === 'base'  ? { t: 'من الدور', c: 'bg-blue-bg text-blue-fg' }
                  : state === 'granted'? { t: 'إضافية',  c: 'bg-teal/15 text-teal' }
                  : null;
                return (
                  <button
                    type="button"
                    key={permKey}
                    onClick={() => toggle(permKey)}
                    className={`w-full text-start flex items-start gap-3 px-3 py-2.5 rounded-xl border transition
                      ${on ? 'border-teal/40 bg-teal/5' : 'border-border bg-surface-alt hover:border-teal/30'}`}
                  >
                    {/* Toggle pill */}
                    <span className={`mt-0.5 shrink-0 w-9 h-5 rounded-full relative transition ${on ? 'bg-teal' : 'bg-border'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'start-0.5' : 'start-[18px]'}`} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-text">{PERMISSION_LABELS[permKey]}</span>
                        {badge && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${badge.c}`}>{badge.t}</span>}
                      </span>
                      <span className="block text-[11px] text-muted mt-0.5 leading-relaxed">{PERMISSION_DESCRIPTIONS[permKey]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
