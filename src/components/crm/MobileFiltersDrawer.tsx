import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { CRMFilters, type PeriodFilter, type AIStatusFilter, type UrgencyFilter, type SortOption } from './CRMFilters';
import { Badge } from '@/components/ui/badge';

interface AvailableUser {
  user_id: string;
  full_name: string;
  role: string;
}

interface MobileFiltersDrawerProps {
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
  isAdmin?: boolean;
  availableUsers?: AvailableUser[];
  assignedToFilter?: string;
  onAssignedToChange?: (value: string) => void;
}

export function MobileFiltersDrawer(props: MobileFiltersDrawerProps) {
  const activeFiltersCount = [
    props.periodFilter !== 'all',
    props.aiStatusFilter !== 'all',
    props.urgencyFilter !== 'all',
    props.showRemindersOnly,
    props.assignedToFilter !== 'all',
  ].filter(Boolean).length;

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9 relative">
          <Filter className="h-4 w-4" />
          {activeFiltersCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Filtros</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 pb-8">
          <CRMFilters {...props} layout="vertical" />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
