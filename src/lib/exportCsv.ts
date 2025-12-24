import { Business } from '@/types/business';
import { calculateLeadScore } from './leadScoring';

export function exportToCSV(businesses: Business[], filename: string = 'empresas') {
  const headers = [
    'Nome',
    'Endereço',
    'Cidade',
    'Estado',
    'Telefone',
    'WhatsApp',
    'Email',
    'Instagram',
    'Facebook',
    'LinkedIn',
    'Twitter',
    'Site',
    'Categoria',
    'Avaliação',
    'Avaliações',
    'Fonte',
    'Score',
    'Qualidade'
  ];
  
  const rows = businesses.map(b => {
    const { score, level } = calculateLeadScore(b);
    return [
      b.name || '',
      b.address || '',
      b.city || '',
      b.state || '',
      b.phone || '',
      b.whatsapp || '',
      b.email || '',
      b.instagram || '',
      b.facebook || '',
      b.linkedin || '',
      b.twitter || '',
      b.website || '',
      b.category || '',
      b.rating?.toString() || '',
      b.reviews?.toString() || '',
      b.source === 'google_maps' ? 'Google Maps' : b.source === 'instagram' ? 'Instagram' : '',
      score.toString(),
      level === 'alta' ? 'Alta' : level === 'media' ? 'Média' : 'Baixa'
    ];
  });

  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(';'))
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
