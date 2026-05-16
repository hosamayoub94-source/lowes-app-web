// =============================================================
// EmployeeCard — team member tile (Team screen).
// =============================================================
import { cn } from '@utils/classNames';
import { Card } from '@components/ui/Card';
import { Badge } from '@components/ui/Badge';
import { Avatar } from '@components/ui/Avatar';
import { ROLE_LABELS, TEAMS } from '@data/teams';

export function EmployeeCard({
  employee,
  onClick,
  className = '',
}) {
  if (!employee) return null;
  const { name, role_type, team, avatar_url, position, points = 0, status = 'active' } = employee;
  const teamLabel = team && TEAMS[team]?.name;
  const roleLabel = ROLE_LABELS[role_type] || role_type;

  return (
    <Card
      as={onClick ? 'button' : 'div'}
      variant="default"
      padding="md"
      onClick={onClick}
      className={cn(
        'text-start w-full transition-colors',
        onClick && 'hover:border-teal/40 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/30',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar name={name} src={avatar_url} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">{name}</div>
          <div className="text-xs text-muted truncate">{position || roleLabel}</div>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {roleLabel && <Badge tone="teal">{roleLabel}</Badge>}
            {teamLabel && <Badge tone="neutral">{teamLabel}</Badge>}
            {status === 'inactive' && <Badge tone="red">غير نشط</Badge>}
          </div>
        </div>
        {points > 0 && (
          <div className="shrink-0 text-end">
            <div className="text-xs text-muted">النقاط</div>
            <div className="text-base font-extrabold text-teal">{points}</div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default EmployeeCard;
