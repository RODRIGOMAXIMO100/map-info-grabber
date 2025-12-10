import { Business } from '@/types/business';

export function exportToCSV(businesses: Business[], filename: string = 'empresas') {
  const headers = ['Nome', 'Endereço', 'Telefone', 'Site', 'Avaliação', 'Avaliações', 'Cidade', 'Estado'];
  
  const rows = businesses.map(b => [
    b.name,
    b.address,
    b.phone,
    b.website,
    b.rating?.toString() || '',
    b.reviews?.toString() || '',
    b.city,
    b.state,
  ]);

  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(';'))
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
