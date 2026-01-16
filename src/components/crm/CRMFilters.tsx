import { Filter, Clock, Bot, Flame, Search, Bell, UserCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type PeriodFilter = 'all' | 'today' | 'week' | 'month';
export type AIStatusFilter = 'all' | 'ai_active' | 'manual';
export type UrgencyFilter = 'all' | 'hot' | 'warm' | 'cold';
export type SortOption = 'recent' | 'oldest' | 'bant' | 'value';

interface AvailableUser {
  user_id: string;
  full_name: string;
  role: string;
}

interface CRMFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  periodFilter: PeriodFilter;
  onPeriodChange: (value: PeriodFilter) => void;
  aiStatusFilter: AIStatusFilter;
  onAIStatusChange: (value: AIStatusFilter) => void;
  urgencyFilter: UrgencyFilter;
  onUrgencyChange: (value: UrgencyFilter) => void;
  sortOption: SortOption;
  onSortChange: (value: SortOption) => void;
  showRemindersOnly?: boolean;
  onRemindersFilterChange?: (value: boolean) => void;
  pendingRemindersCount?: number;
  // Admin-only filter
  isAdmin?: boolean;
  availableUsers?: AvailableUser[];
  assignedToFilter?: string;
  onAssignedToChange?: (value: string) => void;
}

export function CRMFilters({
  searchQuery,
  onSearchChange,
  periodFilter,
  onPeriodChange,
  aiStatusFilter,
  onAIStatusChange,
  urgencyFilter,
  onUrgencyChange,
  sortOption,
  onSortChange,
  showRemindersOnly = false,
  onRemindersFilterChange,
  pendingRemindersCount = 0,
  isAdmin = false,
  availableUsers = [],
  assignedToFilter = 'all',
  onAssignedToChange,
}: CRMFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative flex-1 min-w-[150px] max-w-[250px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar lead..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* Reminders Filter Button */}
      {onRemindersFilterChange && (
        <Button
          variant={showRemindersOnly ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-8 text-xs gap-1.5",
            showRemindersOnly && "bg-primary"
          )}
          onClick={() => onRemindersFilterChange(!showRemindersOnly)}
        >
          <Bell className="h-3.5 w-3.5" />
          Lembretes
          {pendingRemindersCount > 0 && (
            <span className={cn(
              "ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium",
              showRemindersOnly 
                ? "bg-primary-foreground text-primary" 
                : "bg-primary text-primary-foreground"
            )}>
              {pendingRemindersCount}
            </span>
          )}
        </Button>
      )}

      {/* Period Filter */}
      <Select value={periodFilter} onValueChange={(v) => onPeriodChange(v as PeriodFilter)}>
        <SelectTrigger className="h-8 w-auto min-w-[100px] text-xs">
          <Clock className="h-3.5 w-3.5 mr-1" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todo período</SelectItem>
          <SelectItem value="today">Hoje</SelectItem>
          <SelectItem value="week">Últimos 7 dias</SelectItem>
          <SelectItem value="month">Este mês</SelectItem>
        </SelectContent>
      </Select>

      {/* AI Status Filter */}
      <Select value={aiStatusFilter} onValueChange={(v) => onAIStatusChange(v as AIStatusFilter)}>
        <SelectTrigger className="h-8 w-auto min-w-[100px] text-xs">
          <Bot className="h-3.5 w-3.5 mr-1" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos Status</SelectItem>
          <SelectItem value="ai_active">🤖 IA Ativa</SelectItem>
          <SelectItem value="manual">👤 Manual</SelectItem>
        </SelectContent>
      </Select>

      {/* Urgency Filter */}
      <Select value={urgencyFilter} onValueChange={(v) => onUrgencyChange(v as UrgencyFilter)}>
        <SelectTrigger className="h-8 w-auto min-w-[100px] text-xs">
          <Flame className="h-3.5 w-3.5 mr-1" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas Urgências</SelectItem>
          <SelectItem value="hot">🔥 Quentes (&lt;1h)</SelectItem>
          <SelectItem value="warm">🟡 Mornos (1-24h)</SelectItem>
          <SelectItem value="cold">❄️ Frios (&gt;24h)</SelectItem>
        </SelectContent>
      </Select>

      {/* Sort */}
      <Select value={sortOption} onValueChange={(v) => onSortChange(v as SortOption)}>
        <SelectTrigger className="h-8 w-auto min-w-[110px] text-xs">
          <Filter className="h-3.5 w-3.5 mr-1" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="recent">Mais recentes</SelectItem>
          <SelectItem value="oldest">Mais antigos</SelectItem>
          <SelectItem value="value">Maior valor</SelectItem>
        </SelectContent>
      </Select>

      {/* Assigned To Filter (Admin only) */}
      {isAdmin && onAssignedToChange && (
        <Select value={assignedToFilter} onValueChange={onAssignedToChange}>
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
            <UserCheck className="h-3.5 w-3.5 mr-1" />
            <SelectValue placeholder="Vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos vendedores</SelectItem>
            <SelectItem value="unassigned">Não atribuídos</SelectItem>
            {availableUsers.map(user => (
              <SelectItem key={user.user_id} value={user.user_id}>
                {user.role === 'sdr' ? '🎯' : '💰'} {user.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
