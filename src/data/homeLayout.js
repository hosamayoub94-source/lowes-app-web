// =============================================================
// Home page composition per role archetype.
// HomeScreen renders these block keys in order for the user's role.
// Common blocks (hero, emergency) are always rendered at the top by
// HomeScreen itself and are NOT listed here.
// =============================================================
import { ROLES } from './teams';

// Map a profile role/role_type to a home archetype.
export function homeArchetype(role) {
  switch (role) {
    case ROLES.ADMIN:
    case ROLES.MANAGER:             return 'manager';
    case ROLES.SALES_MANAGER:       return 'sales_manager';
    case ROLES.SOCIAL_MANAGER:
    case ROLES.MEDIA_BUYER:         return 'media';
    case ROLES.FIELD_REP:
    case ROLES.AREA_AGENT:          return 'field_rep';
    case ROLES.MARKETER:            return 'marketer';
    case ROLES.SUPERVISOR:
    case ROLES.SUPERVISOR_MANAGER:  return 'supervisor';
    case 'storage':                 return 'storage';
    default:                        return 'seller';
  }
}

// Ordered list of block keys per archetype.
// NOTE (P0): distribution archetypes reuse existing blocks. P1 introduces
// dedicated big-number blocks: 'myWallet', 'myLevel', 'myRank', 'myNetwork'.
export const HOME_LAYOUT = {
  seller:        ['attendance', 'myTasks', 'myTarget', 'announcement', 'celebration', 'training'],
  manager:       ['attendance', 'myTasks', 'teamStatus', 'salesChart', 'attendanceChart', 'leaderboard', 'currency', 'announcement'],
  sales_manager: ['attendance', 'myTasks', 'salesChart', 'leaderboard', 'currency', 'campaignsLink', 'announcement'],
  media:         ['attendance', 'myTasks', 'campaignsLink', 'announcement', 'training'],
  storage:       ['attendance', 'myTasks', 'lowStock', 'announcement'],
  // مندوب ميداني / وكيل منطقة: يومه — حضور، هدفه، مهامه، ترتيبه، إعلان
  field_rep:     ['attendance', 'myTarget', 'myTasks', 'leaderboard', 'announcement', 'training'],
  // مسوّقة: هدفها (عمولتها)، ترتيبها، تتويج، إعلان، تدريب
  marketer:      ['myTarget', 'leaderboard', 'celebration', 'announcement', 'training'],
  // مشرفة / مديرة مشرفات: حالة الفريق + ترتيب + هدفها + إعلان
  supervisor:    ['attendance', 'teamStatus', 'myTarget', 'leaderboard', 'announcement'],
};

export function homeBlocksForRole(role) {
  return HOME_LAYOUT[homeArchetype(role)] ?? HOME_LAYOUT.seller;
}
