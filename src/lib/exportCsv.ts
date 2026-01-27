import { Business } from '@/types/business';
import { calculateLeadScore } from './leadScoring';
import { validateBrazilianPhone } from './phoneValidation';
import * as XLSX from 'xlsx';

/**
 * Export businesses to CSV file
 */
export function exportToCSV(businesses: Business[], filename: string = 'empresas') {
  const headers = [
    'Nome',
    'Endereço',
    'Cidade',
    'Estado',
    'Telefone',
    'Tipo Telefone',
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
    const phoneValidation = validateBrazilianPhone(b.phone);
    return [
      b.name || '',
      b.address || '',
      b.city || '',
      b.state || '',
      phoneValidation.displayFormat || b.phone || '',
      phoneValidation.isValid ? (phoneValidation.isMobile ? 'Celular' : 'Fixo') : 'Desconhecido',
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
      b.source === 'google_maps' ? 'Google Maps' : '',
      score.toString(),
      level === 'alta' ? 'Alta' : level === 'media' ? 'Média' : 'Baixa'
    ];
  });

  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(';'))
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}_${getDateSuffix()}.csv`);
}

/**
 * Export businesses to Excel file with formatting
 */
export function exportToExcel(businesses: Business[], filename: string = 'empresas') {
  const data = businesses.map(b => {
    const { score, level } = calculateLeadScore(b);
    const phoneValidation = validateBrazilianPhone(b.phone);
    return {
      'Nome': b.name || '',
      'Endereço': b.address || '',
      'Cidade': b.city || '',
      'Estado': b.state || '',
      'Telefone': phoneValidation.displayFormat || b.phone || '',
      'Tipo': phoneValidation.isValid ? (phoneValidation.isMobile ? '📱 Celular' : '☎️ Fixo') : '?',
      'WhatsApp': b.whatsapp ? 'Sim' : '',
      'Email': b.email || '',
      'Instagram': b.instagram || '',
      'Facebook': b.facebook || '',
      'LinkedIn': b.linkedin || '',
      'Site': b.website || '',
      'Categoria': b.category || '',
      'Avaliação': b.rating || '',
      'Qtd Avaliações': b.reviews || '',
      'Score': score,
      'Qualidade': level === 'alta' ? '🟢 Alta' : level === 'media' ? '🟡 Média' : '⚪ Baixa',
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 35 },  // Nome
    { wch: 40 },  // Endereço
    { wch: 15 },  // Cidade
    { wch: 5 },   // Estado
    { wch: 18 },  // Telefone
    { wch: 10 },  // Tipo
    { wch: 8 },   // WhatsApp
    { wch: 30 },  // Email
    { wch: 25 },  // Instagram
    { wch: 25 },  // Facebook
    { wch: 25 },  // LinkedIn
    { wch: 30 },  // Site
    { wch: 20 },  // Categoria
    { wch: 8 },   // Avaliação
    { wch: 12 },  // Qtd Avaliações
    { wch: 6 },   // Score
    { wch: 12 },  // Qualidade
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  
  XLSX.writeFile(wb, `${filename}_${getDateSuffix()}.xlsx`);
}

/**
 * Export phone numbers as a simple list for WhatsApp Web
 * Returns only mobile numbers in the format 5511999887766
 */
export function exportWhatsAppList(businesses: Business[], filename: string = 'numeros'): string {
  const numbers: string[] = [];
  
  businesses.forEach(b => {
    // Try WhatsApp link first
    if (b.whatsapp) {
      const match = b.whatsapp.match(/wa\.me\/(\d+)/);
      if (match) {
        numbers.push(match[1]);
        return;
      }
    }
    
    // Fall back to phone
    if (b.phone) {
      const validation = validateBrazilianPhone(b.phone);
      if (validation.isValid && validation.isMobile) {
        numbers.push(validation.formattedNumber);
      }
    }
  });

  const uniqueNumbers = [...new Set(numbers)];
  const content = uniqueNumbers.join('\n');

  // Create and download file
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  downloadBlob(blob, `${filename}_whatsapp_${getDateSuffix()}.txt`);

  return content;
}

/**
 * Copy phone numbers to clipboard for pasting in WhatsApp
 */
export async function copyPhonesToClipboard(businesses: Business[]): Promise<{ count: number; success: boolean }> {
  const numbers: string[] = [];
  
  businesses.forEach(b => {
    if (b.whatsapp) {
      const match = b.whatsapp.match(/wa\.me\/(\d+)/);
      if (match) {
        numbers.push(match[1]);
        return;
      }
    }
    if (b.phone) {
      const validation = validateBrazilianPhone(b.phone);
      if (validation.isValid && validation.isMobile) {
        numbers.push(validation.formattedNumber);
      }
    }
  });

  const uniqueNumbers = [...new Set(numbers)];
  const content = uniqueNumbers.join('\n');

  try {
    await navigator.clipboard.writeText(content);
    return { count: uniqueNumbers.length, success: true };
  } catch {
    return { count: 0, success: false };
  }
}

// Helper to download a blob
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Helper to get date suffix
function getDateSuffix(): string {
  return new Date().toISOString().split('T')[0];
}
