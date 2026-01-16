import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, ChevronRight, AlertCircle } from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';

export interface VendorMetrics {
  user_id: string;
  full_name: string;
  role: string;
  leads_assigned: number;
  leads_active: number;
  leads_converted: number;
  conversion_rate: number;
  closed_value: number;
  avg_ticket: number;
  messages_sent: number;
  funnel_movements: number;
  // Novas métricas de atividade
  messages_today: number;
  first_activity_today: string | null;
  last_activity_today: string | null;
  leads_without_contact: number;
}

interface TeamMetricsTableProps {
  data: VendorMetrics[];
  onSelectVendor: (vendor: VendorMetrics) => void;
  loading?: boolean;
}

type SortKey = keyof VendorMetrics;

export default function TeamMetricsTable({ data, onSelectVendor, loading }: TeamMetricsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('leads_converted');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const sortedData = [...data].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return sortOrder === 'asc' 
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'sdr':
        return <Badge className="bg-blue-500 hover:bg-blue-600">SDR</Badge>;
      case 'closer':
        return <Badge className="bg-green-500 hover:bg-green-600">Closer</Badge>;
      default:
        return <Badge variant="secondary">{role}</Badge>;
    }
  };

  const getActivityStatus = (vendor: VendorMetrics) => {
    if (vendor.messages_today === 0) return 'inactive';
    if (vendor.last_activity_today) {
      const minutesSince = differenceInMinutes(new Date(), new Date(vendor.last_activity_today));
      if (minutesSince < 30) return 'active';
      if (minutesSince < 120) return 'recent';
    }
    return 'idle';
  };

  const formatTimeOnly = (dateStr: string | null) => {
    if (!dateStr) return '--:--';
    return format(new Date(dateStr), 'HH:mm');
  };

  const SortableHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => handleSort(sortKeyName)}
      className="h-8 px-2 -ml-2"
    >
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  if (loading) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        Carregando métricas...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        Nenhum vendedor encontrado com atividades no período.
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[180px]">Vendedor</TableHead>
            <TableHead className="text-center">
              <SortableHeader label="Hoje" sortKeyName="messages_today" />
            </TableHead>
            <TableHead className="text-center">Última Ativ.</TableHead>
            <TableHead className="text-center">
              <SortableHeader label="Leads" sortKeyName="leads_assigned" />
            </TableHead>
            <TableHead className="text-center">
              <SortableHeader label="Conv." sortKeyName="leads_converted" />
            </TableHead>
            <TableHead className="text-center">
              <SortableHeader label="Taxa" sortKeyName="conversion_rate" />
            </TableHead>
            <TableHead className="text-right">
              <SortableHeader label="Valor" sortKeyName="closed_value" />
            </TableHead>
            <TableHead className="text-center">Pendentes</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((vendor, index) => {
            const activityStatus = getActivityStatus(vendor);
            return (
              <TableRow
                key={vendor.user_id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onSelectVendor(vendor)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full font-medium text-sm",
                      activityStatus === 'active' && "bg-green-500/20 text-green-600",
                      activityStatus === 'recent' && "bg-yellow-500/20 text-yellow-600",
                      activityStatus === 'idle' && "bg-primary/10 text-primary",
                      activityStatus === 'inactive' && "bg-red-500/20 text-red-600"
                    )}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{vendor.full_name}</p>
                      {getRoleBadge(vendor.role)}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span className={cn(
                    "font-bold",
                    vendor.messages_today > 0 ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {vendor.messages_today}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span className={cn(
                    "text-sm",
                    activityStatus === 'active' && "text-green-600 font-medium",
                    activityStatus === 'recent' && "text-yellow-600",
                    activityStatus === 'inactive' && "text-muted-foreground"
                  )}>
                    {formatTimeOnly(vendor.last_activity_today)}
                  </span>
                </TableCell>
                <TableCell className="text-center font-medium">
                  {vendor.leads_assigned}
                </TableCell>
                <TableCell className="text-center">
                  <span className="font-bold text-green-600">{vendor.leads_converted}</span>
                </TableCell>
                <TableCell className="text-center">
                  <Badge 
                    variant="outline" 
                    className={
                      vendor.conversion_rate >= 30 
                        ? 'border-green-500 text-green-600' 
                        : vendor.conversion_rate >= 15 
                          ? 'border-yellow-500 text-yellow-600'
                          : 'border-red-500 text-red-600'
                    }
                  >
                    {vendor.conversion_rate.toFixed(1)}%
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(vendor.closed_value)}
                </TableCell>
                <TableCell className="text-center">
                  {vendor.leads_without_contact > 0 ? (
                    <div className="flex items-center justify-center gap-1 text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      <span className="font-medium">{vendor.leads_without_contact}</span>
                    </div>
                  ) : (
                    <span className="text-green-600">✓</span>
                  )}
                </TableCell>
                <TableCell>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
