import { useState } from 'react';
import { Users, X, ChevronLeft, ChevronRight, MapPin, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface SelectedLead {
  id: string;
  phone: string;
  name: string | null;
  lead_city: string | null;
  funnel_stage: string | null;
  last_message_at: string | null;
  broadcast_sent_at: string | null;
  followup_count: number | null;
}

interface SelectedLeadsPreviewProps {
  leads: SelectedLead[];
  excludedIds: Set<string>;
  onToggleExclude: (id: string) => void;
  onExcludeAll: () => void;
  onIncludeAll: () => void;
  loading?: boolean;
}

const PAGE_SIZE = 10;

export function SelectedLeadsPreview({
  leads,
  excludedIds,
  onToggleExclude,
  onExcludeAll,
  onIncludeAll,
  loading = false,
}: SelectedLeadsPreviewProps) {
  const [currentPage, setCurrentPage] = useState(0);

  const includedLeads = leads.filter(l => !excludedIds.has(l.id));
  const totalPages = Math.ceil(leads.length / PAGE_SIZE);
  const paginatedLeads = leads.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const formatPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    return phone;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Leads Selecionados</h3>
          <Badge variant="secondary" className="ml-2">
            {includedLeads.length} de {leads.length}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onIncludeAll}>
            Incluir Todos
          </Button>
          <Button variant="outline" size="sm" onClick={onExcludeAll}>
            Excluir Todos
          </Button>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhum lead encontrado com os filtros selecionados</p>
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={excludedIds.size === 0}
                      onCheckedChange={(checked) => {
                        if (checked) onIncludeAll();
                        else onExcludeAll();
                      }}
                    />
                  </TableHead>
                  <TableHead>Nome / Telefone</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Último Contato</TableHead>
                  <TableHead>Follow-ups</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLeads.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className={excludedIds.has(lead.id) ? 'opacity-50 bg-muted/50' : ''}
                  >
                    <TableCell>
                      <Checkbox
                        checked={!excludedIds.has(lead.id)}
                        onCheckedChange={() => onToggleExclude(lead.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{lead.name || 'Sem nome'}</p>
                        <p className="text-xs text-muted-foreground">{formatPhone(lead.phone)}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {lead.lead_city ? (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {lead.lead_city}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.funnel_stage ? (
                        <Badge variant="outline" className="text-xs">
                          {lead.funnel_stage}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.last_message_at ? (
                        <span className="text-xs">
                          {formatDistanceToNow(new Date(lead.last_message_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {lead.followup_count || 0}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Página {currentPage + 1} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
