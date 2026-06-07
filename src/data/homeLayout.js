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
    case ROLES.MANAGER:        return 'manager';
    case ROLES.SALES_MANAGER:  return 'sales_manager';
    case ROLES.SOCIAL_MANAGER:
    case ROLES.MEDIA_BUYER:    return 'media';
    case 'storage':            return 'storage';
    default:                   return 'seller';
  }
}

// Ordered list of block keys per archetype.
export const HOME_LAYOUT = {
  seller:        ['attendance', 'myTasks', 'myTarget', 'announcement', 'celebration', 'training'],
  manager:       ['attendance', 'myTasks', 'teamStatus', 'salesChart', 'attendanceChart', 'leaderboard', 'currency', 'announcement'],
  sales_manager: ['attendance', 'myTasks', 'salesChart', 'leaderboard', 'currency', 'campaignsLink', 'announcement'],
  media:         ['attendance', 'myTasks', 'campaignsLink', 'announcement', 'training'],
  storage:       ['attendance', 'myTasks', 'lowStock', 'announcement'],
};

export function homeBlocksForRole(role) {
  return HOME_LAYOUT[homeArchetype(role)] ?? HOME_LAYOUT.seller;
}
