/**
 * Formats a phone number for display in a consistent way across the app.
 * Handles Brazilian numbers, US/Canada numbers, WhatsApp group IDs, and international formats.
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  
  const digits = phone.replace(/\D/g, '');
  
  // WhatsApp Group IDs are very long numbers (16+ digits)
  if (digits.length > 15) {
    return 'Grupo';
  }
  
  // Brazilian format with country code: 55 + DDD (2) + Number (8-9)
  // Total: 12 or 13 digits
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const number = digits.slice(4);
    if (number.length === 9) {
      return `(${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`;
    }
    return `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
  }
  
  // Brazilian format without country code: DDD (2) + Number (8-9)
  // Total: 10 or 11 digits
  // Only apply if it doesn't look like a US number (starting with 1)
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('1')) {
    const ddd = digits.slice(0, 2);
    const number = digits.slice(2);
    if (number.length === 9) {
      return `(${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`;
    }
    return `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
  }
  
  // US/Canada format: 1 + Area Code (3) + Number (7)
  // Total: 11 digits starting with 1
  if (digits.startsWith('1') && digits.length === 11) {
    const areaCode = digits.slice(1, 4);
    const firstPart = digits.slice(4, 7);
    const secondPart = digits.slice(7);
    return `+1 (${areaCode}) ${firstPart}-${secondPart}`;
  }
  
  // US/Canada format without country code: Area Code (3) + Number (7)
  // Total: 10 digits starting with area codes typically 2-9
  if (digits.length === 10 && digits.startsWith('1')) {
    const areaCode = digits.slice(0, 3);
    const firstPart = digits.slice(3, 6);
    const secondPart = digits.slice(6);
    return `+1 (${areaCode}) ${firstPart}-${secondPart}`;
  }
  
  // Other international numbers - just add + prefix
  if (digits.length > 11 && !digits.startsWith('55')) {
    return `+${digits}`;
  }
  
  // Fallback: return as-is
  return phone;
}
