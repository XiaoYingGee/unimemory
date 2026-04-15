// UniMemory API client
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface Memory {
  id: string;
  content: string;
  scope: 'global' | 'project' | 'agent';
  project_id?: string;
  agent_id: string;
  memory_type: 'preference' | 'decision' | 'fact' | 'context' | 'temp';
  source_type: 'confirmed' | 'inferred' | 'uncertain';
  confidence: number;
  importance_score: number;
  entity_tags: string[];
  status: 'active' | 'disputed' | 'archived' | 'superseded';
  conflict_group_id?: string;
  conflict_type?: 'supersede' | 'contradiction' | 'refinement';
  source_context?: string;
  access_count: number;
  last_accessed_at?: string;
  archived_at?: string;
  created_at: string;
  updated_at: string;
  embedding_model: string;
}

export interface ColdMemory {
  id: string;
  content: string;
  memory_type: string;
  importance_score: number;
  archived_at: string;
  last_accessed_at: string | null;
  access_count: number;
}

export interface MemoryListResponse {
  memories: Memory[];
  total: number;
  page: number;
  limit: number;
}

export interface ColdListResponse {
  memories: ColdMemory[];
  total: number;
  page: number;
  limit: number;
}

export interface ConflictGroup {
  conflict_group_id: string;
  memory_count: number;
  latest_at: string;
  memories: Memory[];
}

export interface Stats {
  active: string;
  disputed: string;
  archived: string;
  superseded: string;
  global_count: string;
  project_count: string;
  agent_count: string;
  hotCount: number;
  coldCount: number;
  coldRatio: number;
}

export interface ProviderConfig {
  provider: string;
  model: string;
  baseUrl: string | null;
  coldAfterDays: number;
  importanceThreshold: number;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? 'API Error');
  }
  return res.json();
}

export const api = {
  listMemories: (params: Record<string, string | number | undefined> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return apiFetch<MemoryListResponse>(`/api/memories${qs ? `?${qs}` : ''}`);
  },

  getMemory: (id: string) => apiFetch<Memory>(`/api/memories/${id}`),

  updateMemory: (id: string, body: Partial<Pick<Memory, 'status' | 'content'>>) =>
    apiFetch<{ id: string; status: string }>(`/api/memories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  searchMemories: (query: string, agent_id: string, params: Record<string, string | number | boolean | undefined> = {}) => {
    const qs = new URLSearchParams(
      Object.entries({ query, agent_id, ...params })
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return apiFetch<{ memories: Memory[]; conflicts?: unknown[] }>(`/api/memories/search?${qs}`);
  },

  listConflicts: () => apiFetch<{ conflicts: ConflictGroup[] }>('/api/conflicts'),

  resolveConflict: (body: {
    conflict_group_id: string;
    resolution: 'keep_new' | 'keep_old' | 'keep_both' | 'merge';
    winner_memory_id?: string;
  }) =>
    apiFetch('/api/conflicts/resolve', { method: 'POST', body: JSON.stringify(body) }),

  getStats: () => apiFetch<Stats>('/api/stats'),

  // L4: Cold/Archive
  listArchive: (params: Record<string, string | number | undefined> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return apiFetch<ColdListResponse>(`/api/archive${qs ? `?${qs}` : ''}`);
  },

  warmUp: (id: string) =>
    apiFetch<{ warmed: boolean; memory_id: string }>(`/api/archive/${id}/warmup`, { method: 'POST' }),

  runArchive: () =>
    apiFetch<{ archived: number; warmedUp: number }>('/api/archive/run', { method: 'POST' }),

  // L5: Provider config
  getProvider: () => apiFetch<ProviderConfig>('/api/provider'),
};
