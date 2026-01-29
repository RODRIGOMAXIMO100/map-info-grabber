import { Location } from '@/types/business';

export interface RegionGroup {
  id: string;
  name: string;
  locations: Location[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'prospecting_region_groups';

// Generate unique ID
function generateId(): string {
  return `region_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Get all saved region groups
export function getRegionGroups(): RegionGroup[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('Error loading region groups:', error);
    return [];
  }
}

// Save a new region group
export function saveRegionGroup(name: string, locations: Location[]): RegionGroup {
  console.log('[regionGroups] saveRegionGroup chamado', { name, locationsCount: locations.length });
  
  const groups = getRegionGroups();
  const now = new Date().toISOString();
  
  // Criar cópia profunda das locations para evitar mutação por referência
  const locationsCopy = locations.map(loc => ({ ...loc }));
  
  const newGroup: RegionGroup = {
    id: generateId(),
    name: name.trim(),
    locations: locationsCopy,
    createdAt: now,
    updatedAt: now,
  };
  
  groups.push(newGroup);
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
    console.log('[regionGroups] Grupo salvo no localStorage com sucesso:', newGroup.id);
  } catch (error) {
    console.error('[regionGroups] Erro ao salvar no localStorage:', error);
  }
  
  return newGroup;
}

// Update an existing region group
export function updateRegionGroup(id: string, updates: Partial<Pick<RegionGroup, 'name' | 'locations'>>): RegionGroup | null {
  const groups = getRegionGroups();
  const index = groups.findIndex(g => g.id === id);
  
  if (index === -1) return null;
  
  groups[index] = {
    ...groups[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  return groups[index];
}

// Delete a region group
export function deleteRegionGroup(id: string): boolean {
  const groups = getRegionGroups();
  const filtered = groups.filter(g => g.id !== id);
  
  if (filtered.length === groups.length) return false;
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

// Get a specific region group by ID
export function getRegionGroupById(id: string): RegionGroup | null {
  const groups = getRegionGroups();
  return groups.find(g => g.id === id) || null;
}
