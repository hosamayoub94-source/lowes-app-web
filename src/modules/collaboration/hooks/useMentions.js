// =============================================================
// useMentions — @mention suggestion engine
// Provides: search employees, parse mention syntax, pending mentions
// =============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth }          from '@hooks/useAuth';
import { listEmployees }    from '@services/employeeService';

// ── Mention syntax helpers ─────────────────────────────────────
// Format: @[Display Name](userId)
export const buildMentionText = (name, id) => `@[${name}](${id})`;

export const renderMentions = (content = '') =>
  content.replace(/@\[([^\]]+)\]\([^)]+\)/g, '<strong class="text-indigo-600">@$1</strong>');

export const stripMentionSyntax = (content = '') =>
  content.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');

export function useMentions() {
  const auth    = useAuth();
  const [employees, setEmployees]   = useState([]);
  const [loadingEmp, setLoadingEmp] = useState(false);

  // ── Load employees once ───────────────────────────────────────
  useEffect(() => {
    setLoadingEmp(true);
    listEmployees({ activeOnly: true })
      .then((data) => setEmployees(data ?? []))
      .catch(() => setEmployees([]))
      .finally(() => setLoadingEmp(false));
  }, []);

  // ── Search employees by query ──────────────────────────────────
  const searchEmployees = useCallback(
    (q = '') => {
      if (!q.trim()) return employees.slice(0, 8);
      const lower = q.toLowerCase();
      return employees
        .filter(
          (e) =>
            e.name?.toLowerCase().includes(lower) ||
            e.team?.toLowerCase().includes(lower)
        )
        .slice(0, 8);
    },
    [employees]
  );

  // ── Team-based suggestions ────────────────────────────────────
  const teamMates = useMemo(
    () => employees.filter((e) => e.team === auth.team && e.name !== auth.name),
    [employees, auth.team, auth.name]
  );

  return {
    employees,
    loadingEmp,
    searchEmployees,
    teamMates,
    buildMentionText,
    renderMentions,
    stripMentionSyntax,
  };
}

export default useMentions;
