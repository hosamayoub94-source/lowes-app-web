// =============================================================
// Attendance — check in/out, daily log, monthly calendar.
// Mirrors the `attendance` table.
// =============================================================
import { supabase } from './supabase';
import { todayS } from '@utils/date';

export async function listToday() {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('date', todayS())
    .order('created_at');
  if (error) throw error;
  return data || [];
}

export async function listForMonth(yyyymm) {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .like('date', `${yyyymm}%`)
    .order('date');
  if (error) throw error;
  return data || [];
}

export async function listForEmployee(employeeName, yyyymm) {
  let q = supabase
    .from('attendance')
    .select('*')
    .eq('employee_name', employeeName);
  if (yyyymm) q = q.like('date', `${yyyymm}%`);
  const { data, error } = await q.order('date');
  if (error) throw error;
  return data || [];
}

export async function recordEntry({
  employeeName, team, type, day, date = todayS(), timeIn, timeOut, hours, status, note,
}) {
  const payload = {
    employee_name: employeeName,
    team,
    date,
    day,
    type,
    time_in: timeIn,
    time_out: timeOut,
    hours,
    status,
    note,
    recorded_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('attendance').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function checkOnceToday(employeeName, type) {
  const { data, error } = await supabase
    .from('attendance')
    .select('id')
    .eq('employee_name', employeeName)
    .eq('date', todayS())
    .eq('type', type)
    .limit(1);
  if (error) throw error;
  return (data || []).length > 0;
}
