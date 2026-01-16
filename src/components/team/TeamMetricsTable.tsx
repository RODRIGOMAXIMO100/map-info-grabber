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
import { ArrowUpDown, ChevronRight } from 'lucide-react';

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
            <TableHead className="w-[200px]">Vendedor</TableHead>
            <TableHead className="text-center">
              <SortableHeader label="Leads" sortKeyName="leads_assigned" />
            </TableHead>
            <TableHead className="text-center">
              <SortableHeader label="Ativos" sortKeyName="leads_active" />
            </TableHead>
            <TableHead className="text-center">
              <SortableHeader label="Conversões" sortKeyName="leads_converted" />
            </TableHead>
            <TableHead className="text-center">
              <SortableHeader label="Taxa" sortKeyName="conversion_rate" />
            </TableHead>
            <TableHead className="text-right">
              <SortableHeader label="Valor Fechado" sortKeyName="closed_value" />
            </TableHead>
            <TableHead className="text-right">
              <SortableHeader label="Ticket Médio" sortKeyName="avg_ticket" />
            </TableHead>
            <TableHead className="text-center">
              <SortableHeader label="Mensagens" sortKeyName="messages_sent" />
            </TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((vendor, index) => (
            <TableRow
              key={vendor.user_id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onSelectVendor(vendor)}
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium">{vendor.full_name}</p>
                    {getRoleBadge(vendor.role)}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-center font-medium">
                {vendor.leads_assigned}
              </TableCell>
              <TableCell className="text-center">
                {vendor.leads_active}
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
              <TableCell className="text-right text-muted-foreground">
                {formatCurrency(vendor.avg_ticket)}
              </TableCell>
              <TableCell className="text-center text-muted-foreground">
                {vendor.messages_sent}
              </TableCell>
              <TableCell>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
