// MockModeBanner — visible only in DEV. Shows which modules are running in mock mode.
// Renders at the top of the app so devs always know the current data state.

const MOCK_FLAGS = [
  { key: 'VITE_USE_MOCK_TASKS',         label: 'Tasks' },
  { key: 'VITE_USE_MOCK_ATTENDANCE',    label: 'Attendance' },
  { key: 'VITE_USE_MOCK_NOTIFICATIONS', label: 'Notifications' },
  { key: 'VITE_USE_MOCK_ANALYTICS',     label: 'Analytics' },
  { key: 'VITE_USE_MOCK_AUDIT',         label: 'Audit' },
  { key: 'VITE_USE_MOCK_FILES',         label: 'Files' },
  { key: 'VITE_USE_MOCK_CRM',           label: 'CRM' },
];

export function MockModeBanner() {
  if (!import.meta.env.DEV) return null;

  const activeMocks = MOCK_FLAGS.filter(
    ({ key }) => String(import.meta.env[key] ?? '').toLowerCase() !== 'false',
  );

  if (activeMocks.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#7c3aed', color: '#fff',
      padding: '4px 12px', fontSize: '11px',
      display: 'flex', alignItems: 'center', gap: '8px',
      zIndex: 9999, fontFamily: 'monospace',
    }}>
      <span style={{ fontWeight: 700 }}>⚠ MOCK MODE:</span>
      {activeMocks.map(({ label }) => (
        <span key={label} style={{
          background: 'rgba(255,255,255,0.2)',
          borderRadius: '3px', padding: '1px 6px',
        }}>{label}</span>
      ))}
    </div>
  );
}
