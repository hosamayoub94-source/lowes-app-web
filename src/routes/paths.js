// =============================================================
// Centralized route paths — change once, propagate everywhere.
// =============================================================
export const ROUTES = {
  LOGIN: '/login',
  HOME: '/',
  ATTENDANCE: '/attendance',
  TASKS: '/tasks',
  TEAM: '/team',
  HOLIDAYS: '/holidays',
  CRM: '/crm',
  ACCOUNTING: '/accounting',
  ADMIN: '/admin',
  ADMIN_USERS: '/admin/users',
  ADMIN_SETTINGS: '/admin/settings',
  ADMIN_REPORTS: '/admin/reports',
  ADMIN_AUDIT: '/admin/audit',
  ADMIN_QA:          '/admin/qa',
  ADMIN_MAINTENANCE: '/admin/maintenance',
  ADMIN_OPERATIONS:  '/admin/operations',
  FILES: '/files',
  ANALYTICS: '/analytics',
  WORKSPACE: '/workspace',
  NOTIFICATIONS: '/notifications',
  CHAT: '/chat',
  PROFILE: '/profile',
  NOT_FOUND: '*',

  // Priority 1 modules
  PAYROLL:      '/payroll',
  REQUESTS:     '/requests',
  LEDGER:       '/ledger',
  SALES:        '/sales',
  CAMPAIGNS:    '/campaigns',
  TASKS_REPORT: '/tasks-report',

  // Priority 2 modules
  PERFORMANCE:       '/performance',
  INVENTORY:         '/inventory',
  ATTENDANCE_REPORT: '/attendance-report',

  // Gamification
  ACHIEVEMENTS: '/achievements',

  // Announcements
  ANNOUNCEMENTS: '/announcements',

  // HR & Leave
  LEAVE: '/leave',
  HR:    '/hr',

  // Training / Daily Quiz
  TRAINING:   '/training',
  ADMIN_QUIZ: '/admin/quiz',

  // HR Features
  SCHEDULE:  '/schedule',
  ADVANCES:  '/advances',
  REVIEWS:   '/reviews',

  // Product Catalog
  ADMIN_PRODUCTS: '/admin/products',

  // Lozy AI knowledge
  ADMIN_LOZY: '/admin/lozy',

  // Face verification enrollment
  ADMIN_FACE_ENROLL: '/admin/face-enroll',

  // Manager executive board + Social content studio
  MANAGER_BOARD: '/manager-board',
  SOCIAL_STUDIO: '/social-studio',
  SOCIAL_TEAM:   '/social-team',
  PROFITABILITY: '/profitability',

  // Orders — ماكنتان منفصلتان (سوريا / تركيا) + /orders يحوّل لسوق المستخدم
  ORDERS: '/orders',
  ORDERS_SYRIA: '/orders/syria',
  ORDERS_TURKEY: '/orders/turkey',

  // Warehouses
  WAREHOUSES: '/warehouses',

  // Customers
  CUSTOMERS: '/customers',

  // Distribution network — محفظة العمولات + شبكة MLM
  WALLET: '/wallet',
  NETWORK: '/network',
  COMMISSION_REPORT: '/commission-report',
  TERRITORIES: '/territories',
  CONSIGNMENT: '/consignment',
  COLLECTIONS: '/collections',
};

export default ROUTES;