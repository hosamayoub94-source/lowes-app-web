// =============================================================
// Attendance — Dev Monitor
//
// Floating panel (bottom-right) for development only.
// Shows:
//   • Current user's record fields
//   • Mock store snapshot (all team records)
//   • Quick actions: force check-in/out, clear mock data
//   • Active break info
//
// Hidden in production (USE_MOCK === false and NODE_ENV === production).
// =============================================================
import React, { useState } from 'react';
import useAttendanceStore   from '../store/useAttendanceStore';
import { clearMockData, USE_MOCK } from '../services/attendanceService';
import { ATTENDANCE_STATUS_COLORS } from '../types/attendance.types';

const DEV_USER_ID = 'user_current';

function _DevAttendanceMonitorNull() { return null; }

function _DevAttendanceMonitor() {
  const [open, setOpen] = useState(false);
  const [tab,  setTab]  = useState('my'); // 'my' | 'team'

  const myRecord    = useAttendanceStore((s) => s.myRecord);
  const activeBreak = useAttendanceStore((s) => s.activeBreak);
  const teamRecords = useAttendanceStore((s) => s.teamRecords);
  const loading     = useAttendanceStore((s) => s.loading);
  const error       = useAttendanceStore((s) => s.error);
  const checkIn     = useAttendanceStore((s) => s.checkIn);
  const checkOut    = useAttendanceStore((s) => s.checkOut);
  const loadAtt     = useAttendanceStore((s) => s.loadAttendance);

  const handleClear = () => {
    clearMockData();
    loadAtt(DEV_USER_ID);
  };

  const handleCheckIn = async () => {
    try { await checkIn(DEV_USER_ID); } catch (e) { console.error(e); }
  };

  const handleCheckOut = async () => {
    try { await checkOut(DEV_USER_ID); } catch (e) { console.error(e); }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        zIndex: 9999,
        fontFamily: 'monospace',
        fontSize: 11,
      }}
    >
      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: '#1e293b',
          color: '#94a3b8',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: '4px 10px',
          cursor: 'pointer',
          marginBottom: open ? 4 : 0,
        }}
      >
        {open ? '▼' : '▲'} Attendance Dev {USE_MOCK ? '(mock)' : '(live)'}
      </button>

      {open && (
        <div
          style={{
            background: '#0f172a',
            color: '#e2e8f0',
            border: '1px solid #1e293b',
            borderRadius: 10,
            padding: 12,
            width: 340,
            maxHeight: 480,
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {['my', 'team'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? '#334155' : 'transparent',
                  color: tab === t ? '#f1f5f9' : '#64748b',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: '2px 10px',
                  cursor: 'pointer',
                }}
              >
                {t === 'my' ? 'سجلي' : 'الفريق'}
              </button>
            ))}
            {loading && (
              <span style={{ color: '#f59e0b', marginRight: 'auto', alignSelf: 'center' }}>
                ⏳
              </span>
            )}
          </div>

          {error && (
            <div style={{ color: '#f87171', background: '#450a0a', borderRadius: 6, padding: '4px 8px', marginBottom: 8 }}>
              ⚠ {error}
            </div>
          )}

          {tab === 'my' && (
            <div>
              {/* Quick actions */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                <button
                  onClick={handleCheckIn}
                  style={_btnStyle('#059669')}
                >دخول</button>
                <button
                  onClick={handleCheckOut}
                  style={_btnStyle('#dc2626')}
                >خروج</button>
                <button
                  onClick={handleClear}
                  style={_btnStyle('#7c3aed')}
                >مسح</button>
                <button
                  onClick={() => loadAtt(DEV_USER_ID)}
                  style={_btnStyle('#0284c7')}
                >تحديث</button>
              </div>

              {myRecord ? (
                <pre style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#cbd5e1' }}>
{`status       : `}<span style={{ color: ATTENDANCE_STATUS_COLORS[myRecord.status] ?? '#fff' }}>{myRecord.status}</span>{`
check_in     : ${myRecord.check_in_time ? new Date(myRecord.check_in_time).toLocaleTimeString('ar-SA') : '—'}
check_out    : ${myRecord.check_out_time ? new Date(myRecord.check_out_time).toLocaleTimeString('ar-SA') : '—'}
late_by      : ${myRecord.late_by_minutes}م
worked       : ${myRecord.worked_minutes}م
overtime     : ${myRecord.overtime_minutes}م
break_total  : ${myRecord.break_minutes}م
breaks       : ${(myRecord._breaks ?? myRecord.break_sessions ?? []).length} جلسة`}
                </pre>
              ) : (
                <p style={{ color: '#64748b' }}>لا يوجد سجل اليوم</p>
              )}

              {activeBreak && (
                <div style={{ background: '#082f49', borderRadius: 6, padding: '6px 8px', marginTop: 8 }}>
                  <p style={{ color: '#7dd3fc' }}>استراحة نشطة: {activeBreak.type}</p>
                  <p style={{ color: '#94a3b8' }}>
                    بدأت: {new Date(activeBreak.start_time).toLocaleTimeString('ar-SA')}
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === 'team' && (
            <div>
              <p style={{ color: '#64748b', marginBottom: 6 }}>
                {teamRecords.length} سجل
              </p>
              {teamRecords.map((rec) => (
                <div
                  key={rec.id ?? rec.user_id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '4px 0',
                    borderBottom: '1px solid #1e293b',
                  }}
                >
                  <span style={{ color: '#cbd5e1' }}>
                    {rec.metadata?.name ?? rec.user_id?.slice(0, 10)}
                  </span>
                  <span
                    style={{
                      color: ATTENDANCE_STATUS_COLORS[rec.status] ?? '#94a3b8',
                      fontSize: 10,
                    }}
                  >
                    {rec.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const DevAttendanceMonitor =
  (!USE_MOCK && import.meta.env.PROD)
    ? _DevAttendanceMonitorNull
    : _DevAttendanceMonitor;

export default DevAttendanceMonitor;

function _btnStyle(bg) {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '3px 8px',
    cursor: 'pointer',
    fontSize: 11,
  };
}
