import { Business } from '@/types/business';

export interface LeadScore {
  score: number;
  level: 'alta' | 'media' | 'baixa';
  reasons: string[];
}

/**
 * Calcula uma pontuação de qualidade para o lead baseado nos canais de contato disponíveis.
 * Pontuação máxima: 5
 */
export function calculateLeadScore(business: Business): LeadScore {
  let score = 0;
  const reasons: string[] = [];

  // WhatsApp - canal mais valioso (2 pontos)
  if (business.whatsapp) {
    score += 2;
    reasons.push('WhatsApp disponível');
  }

  // Telefone (0.5 ponto)
  if (business.phone) {
    score += 0.5;
    reasons.push('Telefone disponível');
  }

  // Email (1 ponto)
  if (business.email) {
    score += 1;
    reasons.push('Email disponível');
  }

  // Instagram (0.5 ponto)
  if (business.instagram) {
    score += 0.5;
    reasons.push('Instagram disponível');
  }

  // Facebook ou LinkedIn (0.5 ponto cada)
  if (business.facebook) {
    score += 0.5;
    reasons.push('Facebook disponível');
  }
  if (business.linkedin) {
    score += 0.5;
    reasons.push('LinkedIn disponível');
  }

  // Website (0.25 ponto) - menos peso pois já é comum
  if (business.website && business.website.startsWith('http') && !business.website.includes('wa.me') && !business.website.includes('instagram.com')) {
    score += 0.25;
    reasons.push('Website disponível');
  }

  // Avaliações altas (bonus 0.25)
  if (business.rating && business.rating >= 4.5) {
    score += 0.25;
    reasons.push('Alta avaliação');
  }

  // Normaliza para máximo de 5
  const normalizedScore = Math.min(5, Math.round(score * 10) / 10);

  // Determina nível
  let level: 'alta' | 'media' | 'baixa';
  if (normalizedScore >= 3) {
    level = 'alta';
  } else if (normalizedScore >= 1.5) {
    level = 'media';
  } else {
    level = 'baixa';
  }

  return { score: normalizedScore, level, reasons };
}

/**
 * Aplica scoring a uma lista de businesses
 */
export function applyScoring(businesses: Business[]): Business[] {
  return businesses.map(business => {
    const { score } = calculateLeadScore(business);
    return { ...business, score };
  });
}

/**
 * Retorna cor do badge baseado no nível
 */
export function getScoreBadgeColor(level: 'alta' | 'media' | 'baixa'): string {
  switch (level) {
    case 'alta':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'media':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'baixa':
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}
