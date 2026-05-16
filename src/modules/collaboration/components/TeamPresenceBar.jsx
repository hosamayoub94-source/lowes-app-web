// =============================================================
// TeamPresenceBar — shows who's online in the workspace
// =============================================================
import { useState } from 'react';
import { useTeamPresence } from '../hooks/useTeamPresence';

const SECTION_LABELS = {
  workspace:  'الرئيسية',
  tasks:      'المهام',
  attendance: 'الحضور',
  crm:        'CRM',
  files:      'الملفات',
  team:       'الفريق',
  accounting: 'الحسابات',
};

function PresenceAvatar({ user, getStatusColor, getLastSeenLabel }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className="relative cursor-pointer"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Avatar circle */}
      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center border-2 border-white shadow-sm">
        {user.userName?.[0] ?? '?'}
      </div>

      {/* Status dot */}
      <span
        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${getStatusColor(user.status)}`}
      />

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full mb-2 right-0 z-50 bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
          <p className="font-medium">{user.userName}</p>
          {user.section && (
            <p className="text-gray-400 mt-0.5">
              في {SECTION_LABELS[user.section] ?? user.section}
            </p>
          )}
          <p className="text-gray-500 mt-0.5">{getLastSeenLabel(user.last_seen)}</p>
          {/* Tooltip arrow */}
          <div className="absolute top-full right-3 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

export function TeamPresenceBar({ maxVisible = 6 }) {
  const { users, online, onlineCount, getStatusColor, getLastSeenLabel } = useTeamPresence();

  const visibleOnline = online.slice(0, maxVisible);
  const overflow      = Math.max(0, online.length - maxVisible);

  if (onlineCount === 0) return null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 bg-white rounded-xl border border-gray-100 shadow-sm"
      dir="rtl"
    >
      {/* Label */}
      <span className="text-xs text-gray-500 flex-none">
        <span className="font-semibold text-green-600">{onlineCount}</span> متصل الآن
      </span>

      {/* Avatars */}
      <div className="flex items-center -space-x-1.5 space-x-reverse">
        {visibleOnline.map((user) => (
          <PresenceAvatar
            key={user.userId}
            user={user}
            getStatusColor={getStatusColor}
            getLastSeenLabel={getLastSeenLabel}
          />
        ))}

        {/* Overflow */}
        {overflow > 0 && (
          <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center border-2 border-white">
            +{overflow}
          </div>
        )}
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-1 flex-none mr-auto">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span className="text-xs text-gray-400">مباشر</span>
      </div>
    </div>
  );
}

export default TeamPresenceBar;
