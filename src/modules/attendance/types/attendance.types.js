// =============================================================
// Attendance Module — Types, Constants, Configuration
// Single source of truth. Zero imports — constants only.
// =============================================================

// ── Attendance Status ─────────────────────────────────────────
export const ATTENDANCE_STATUS = Object.freeze({
  PENDING:     'pending',       // Day started but no check-in yet
  PRESENT:     'present',       // Checked in on time
  LATE:        'late',          // Checked in after grace period
  ABSENT:      'absent',        // No check-in past detection window
  ON_BREAK:    'on_break',      // Currently on a break
  CHECKED_OUT: 'checked_out',   // Shift complete
});

// ── Shift Types ───────────────────────────────────────────────
export const SHIFT_TYPE = Object.freeze({
  MORNING:  'morning',
  EVENING:  'evening',
  NIGHT:    'night',
  CUSTOM:   'custom',
  FLEXIBLE: 'flexible',
});

// ── Break Types ───────────────────────────────────────────────
export const BREAK_TYPE = Object.freeze({
  REGULAR:  'regular',
  LUNCH:    'lunch',
  PRAYER:   'prayer',
  PERSONAL: 'personal',
});

// ── Check-in Source ───────────────────────────────────────────
export const CHECK_IN_SOURCE = Object.freeze({
  WEB:       'web',
  MOBILE:    'mobile',
  QR:        'qr',
  GPS:       'gps',
  BIOMETRIC: 'biometric',
  MANUAL:    'manual',
});

// ── Attendance Event Types ────────────────────────────────────
export const ATTENDANCE_EVENT_TYPE = Object.freeze({
  CHECK_IN:        'check_in',
  CHECK_OUT:       'check_out',
  BREAK_START:     'break_start',
  BREAK_END:       'break_end',
  LATE_FLAGGED:    'late_flagged',
  ABSENT_FLAGGED:  'absent_flagged',
  MANUAL_UPDATE:   'manual_update',
  OVERTIME_STARTED:'overtime_started',
});

// ── Default Shift Configs ─────────────────────────────────────
export const DEFAULT_SHIFTS = [
  {
    id:                 'shift_morning',
    name:               'Morning Shift',
    name_ar:            'الوردية الصباحية',
    type:               SHIFT_TYPE.MORNING,
    start_time:         '08:00',
    end_time:           '16:00',
    grace_minutes:      15,
    max_overtime_minutes: 120,
    days_of_week:       [1, 2, 3, 4, 5],
    is_active:          true,
  },
  {
    id:                 'shift_evening',
    name:               'Evening Shift',
    name_ar:            'الوردية المسائية',
    type:               SHIFT_TYPE.EVENING,
    start_time:         '16:00',
    end_time:           '00:00',
    grace_minutes:      15,
    max_overtime_minutes: 120,
    days_of_week:       [1, 2, 3, 4, 5],
    is_active:          true,
  },
  {
    id:                 'shift_flexible',
    name:               'Flexible Shift',
    name_ar:            'الدوام المرن',
    type:               SHIFT_TYPE.FLEXIBLE,
    start_time:         '07:00',
    end_time:           '18:00',
    grace_minutes:      60,
    max_overtime_minutes: 180,
    days_of_week:       [0, 1, 2, 3, 4, 5, 6],
    is_active:          true,
  },
];

// ── Arabic Labels ─────────────────────────────────────────────
export const ATTENDANCE_STATUS_LABELS = {
  [ATTENDANCE_STATUS.PENDING]:     'لم يسجل بعد',
  [ATTENDANCE_STATUS.PRESENT]:     'حاضر',
  [ATTENDANCE_STATUS.LATE]:        'متأخر',
  [ATTENDANCE_STATUS.ABSENT]:      'غائب',
  [ATTENDANCE_STATUS.ON_BREAK]:    'في استراحة',
  [ATTENDANCE_STATUS.CHECKED_OUT]: 'انصرف',
};

export const SHIFT_TYPE_LABELS = {
  [SHIFT_TYPE.MORNING]:  'الصباحية',
  [SHIFT_TYPE.EVENING]:  'المسائية',
  [SHIFT_TYPE.NIGHT]:    'الليلية',
  [SHIFT_TYPE.CUSTOM]:   'مخصصة',
  [SHIFT_TYPE.FLEXIBLE]: 'مرنة',
};

export const BREAK_TYPE_LABELS = {
  [BREAK_TYPE.REGULAR]:  'استراحة',
  [BREAK_TYPE.LUNCH]:    'غداء',
  [BREAK_TYPE.PRAYER]:   'صلاة',
  [BREAK_TYPE.PERSONAL]: 'شخصية',
};

// ── Status Colors ─────────────────────────────────────────────
export const ATTENDANCE_STATUS_COLORS = {
  [ATTENDANCE_STATUS.PENDING]:     '#94a3b8',
  [ATTENDANCE_STATUS.PRESENT]:     '#22c55e',
  [ATTENDANCE_STATUS.LATE]:        '#f59e0b',
  [ATTENDANCE_STATUS.ABSENT]:      '#ef4444',
  [ATTENDANCE_STATUS.ON_BREAK]:    '#0ea5e9',
  [ATTENDANCE_STATUS.CHECKED_OUT]: '#8b5cf6',
};

// ── Shift colors ──────────────────────────────────────────────
export const SHIFT_TYPE_COLORS = {
  [SHIFT_TYPE.MORNING]:  '#fbbf24',
  [SHIFT_TYPE.EVENING]:  '#818cf8',
  [SHIFT_TYPE.NIGHT]:    '#334155',
  [SHIFT_TYPE.CUSTOM]:   '#0ea5e9',
  [SHIFT_TYPE.FLEXIBLE]: '#22c55e',
};

// ── Business constants ────────────────────────────────────────
export const ABSENT_DETECTION_MINUTES = 120; // mark absent 2h after shift start
export const OVERTIME_THRESHOLD_MINUTES = 30; // OT starts 30min after shift end
export const MAX_BREAK_MINUTES = 60;          // max allowed single break
export const MAX_DAILY_BREAKS  = 3;           // max breaks per day
