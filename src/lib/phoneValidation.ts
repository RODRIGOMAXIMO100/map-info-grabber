/**
 * Validação de telefones brasileiros
 * Identifica se é celular ou fixo e formata o número
 */

export interface PhoneValidation {
  isValid: boolean;
  isMobile: boolean;
  formattedNumber: string;
  ddd: string;
  normalizedDigits: string;
  displayFormat: string;
}

/**
 * Valida e classifica um telefone brasileiro
 * @param phone - Número de telefone em qualquer formato
 * @returns Informações de validação
 */
export function validateBrazilianPhone(phone: string | null | undefined): PhoneValidation {
  const invalid: PhoneValidation = {
    isValid: false,
    isMobile: false,
    formattedNumber: '',
    ddd: '',
    normalizedDigits: '',
    displayFormat: phone || '',
  };

  if (!phone) return invalid;

  // Remove tudo exceto dígitos
  let digits = phone.replace(/\D/g, '');
  
  // Remove código do país 55 se presente
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  // Número muito curto ou muito longo
  if (digits.length < 10 || digits.length > 11) {
    return { ...invalid, normalizedDigits: digits };
  }

  // Extrai DDD (sempre 2 dígitos)
  const ddd = digits.slice(0, 2);
  
  // DDDs válidos no Brasil: 11-99 (alguns não existem, mas não vamos ser tão restritivos)
  const dddNum = parseInt(ddd, 10);
  if (dddNum < 11 || dddNum > 99) {
    return { ...invalid, ddd, normalizedDigits: digits };
  }

  // Número após o DDD
  const numberPart = digits.slice(2);
  
  // Celulares têm 9 dígitos e começam com 9
  // Fixos têm 8 dígitos e começam com 2, 3, 4 ou 5
  const isMobile = numberPart.length === 9 && numberPart.startsWith('9');
  const isLandline = numberPart.length === 8 && /^[2-5]/.test(numberPart);

  // Aceita ambos como válidos
  const isValid = isMobile || isLandline;

  // Formato de exibição: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
  let displayFormat: string;
  if (isMobile) {
    displayFormat = `(${ddd}) ${numberPart.slice(0, 5)}-${numberPart.slice(5)}`;
  } else if (isLandline) {
    displayFormat = `(${ddd}) ${numberPart.slice(0, 4)}-${numberPart.slice(4)}`;
  } else {
    displayFormat = phone;
  }

  // Formato normalizado com código do país
  const formattedNumber = `55${digits}`;

  return {
    isValid,
    isMobile,
    formattedNumber,
    ddd,
    normalizedDigits: digits,
    displayFormat,
  };
}

/**
 * Retorna classe de cor para o badge do tipo de telefone
 */
export function getPhoneTypeBadgeClass(isMobile: boolean): string {
  return isMobile
    ? 'bg-green-100 text-green-700 border-green-200'
    : 'bg-gray-100 text-gray-600 border-gray-200';
}

/**
 * Retorna ícone e label para o tipo de telefone
 */
export function getPhoneTypeLabel(isMobile: boolean): { icon: string; label: string } {
  return isMobile
    ? { icon: '📱', label: 'Celular' }
    : { icon: '☎️', label: 'Fixo' };
}
