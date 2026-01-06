// Tipos para o sistema de múltiplos funis

export interface CRMFunnel {
  id: string;
  name: string;
  description?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CRMFunnelStage {
  id: string;
  funnel_id: string;
  name: string;
  color: string;
  stage_order: number;
  is_ai_controlled: boolean;
  created_at: string;
}
