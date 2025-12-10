import { ExternalLink, Star } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Business } from '@/types/business';

interface ResultsTableProps {
  results: Business[];
}

export function ResultsTable({ results }: ResultsTableProps) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Endereço</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Site</TableHead>
            <TableHead>Avaliação</TableHead>
            <TableHead>Cidade/UF</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((business, index) => (
            <TableRow key={`${business.place_id}-${index}`}>
              <TableCell className="font-medium max-w-[200px] truncate">
                {business.name}
              </TableCell>
              <TableCell className="max-w-[250px] truncate text-muted-foreground">
                {business.address}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {business.phone || '-'}
              </TableCell>
              <TableCell>
                {business.website ? (
                  <a
                    href={business.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ver
                  </a>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell>
                {business.rating ? (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    {business.rating}
                    {business.reviews && (
                      <span className="text-muted-foreground text-xs">
                        ({business.reviews})
                      </span>
                    )}
                  </span>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {business.city}, {business.state}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
