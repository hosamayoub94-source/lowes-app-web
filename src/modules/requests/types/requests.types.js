// =============================================================
// Admin Requests Hub — Type definitions & constants
// =============================================================

export const REQUEST_TYPE = {
  LEAVE:    'leave',
  ADVANCE:  'advance',
  VACATION: 'vacation',
  DOCUMENT: 'document',
  OTHER:    'other',
};

export const REQUEST_TYPE_LABELS = {
  [REQUEST_TYPE.LEAVE]:    'إجازة',
  [REQUEST_TYPE.ADVANCE]:  'سلفة',
  [REQUEST_TYPE.VACATION]: 'عطلة',
  [REQUEST_TYPE.DOCUMENT]: 'وثيقة',
  [REQUEST_TYPE.OTHER]:    'أخرى',
};

export const REQUEST_TYPE_ICONS = {
  [REQUEST_TYPE.LEAVE]:    '🏖️',
  [REQUEST_TYPE.ADVANCE]:  '💵',
  [REQUEST_TYPE.VACATION]: '✈️',
  [REQUEST_TYPE.DOCUMENT]: '📄',
  [REQUEST_TYPE.OTHER]:    '📝',
};

export const REQUEST_STATUS = {
  PENDING:  'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

export const REQUEST_STATUS_LABELS = {
  [REQUEST_STATUS.PENDING]:   'بانتظار الموافقة',
  [REQUEST_STATUS.APPROVED]:  'موافق عليه',
  [REQUEST_STATUS.REJECTED]:  'مرفوض',
  [REQUEST_STATUS.CANCELLED]: 'ملغي',
};

export const LEAVE_TYPE = {
  ANNUAL:  'annual',
  SICK:    'sick',
  UNPAID:  'unpaid',
  EMERGENCY: 'emergency',
};

export const LEAVE_TYPE_LABELS = {
  [LEAVE_TYPE.ANNUAL]:    'سنوية',
  [LEAVE_TYPE.SICK]:      'مرضية',
  [LEAVE_TYPE.UNPAID]:    'بدون راتب',
  [LEAVE_TYPE.EMERGENCY]: 'طارئة',
};

export const REQUESTS_REALTIME_INTERVAL_MS = 20_000;

export function requestStatusColor(status) {
  return {
    pending:   'bg-amber-bg text-amber-fg border border-amber/20',
    approved:  'bg-green-bg text-green-fg border border-green/20',
    rejected:  'bg-red-bg   text-red-fg   border border-red/20',
    cancelled: 'bg-surface-alt text-muted border border-border/20',
  }[status] ?? 'bg-surface-alt text-muted border border-border/20';
}
