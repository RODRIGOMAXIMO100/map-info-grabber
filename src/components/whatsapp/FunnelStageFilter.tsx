import { cn } from '@/lib/utils';
import { FUNNEL_STAGES, FunnelStageId } from './ConversationStatusBadges';

interface FunnelStageFilterProps {
  selectedStage: FunnelStageId | 'all';
  onStageChange: (stage: FunnelStageId | 'all') => void;
  stageCounts: Record<FunnelStageId | 'all', number>;
}

export function FunnelStageFilter({ selectedStage, onStageChange, stageCounts }: FunnelStageFilterProps) {
  return (
    <div className="flex items-center gap-1 p-2 bg-muted/50 overflow-x-auto">
      <button
        onClick={() => onStageChange('all')}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all whitespace-nowrap",
          selectedStage === 'all'
            ? "bg-primary text-primary-foreground"
            : "bg-background hover:bg-accent text-muted-foreground"
        )}
      >
        Todos ({stageCounts.all || 0})
      </button>
      
      {FUNNEL_STAGES.map((stage) => {
        const Icon = stage.icon;
        const count = stageCounts[stage.id] || 0;
        
        return (
          <button
            key={stage.id}
            onClick={() => onStageChange(stage.id)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all whitespace-nowrap",
              selectedStage === stage.id
                ? cn(stage.bgColor, stage.color, "ring-1 ring-current")
                : "bg-background hover:bg-accent text-muted-foreground"
            )}
          >
            <Icon className="h-3 w-3" />
            <span className="hidden sm:inline">{stage.label}</span>
            <span>({count})</span>
          </button>
        );
      })}
    </div>
  );
}
