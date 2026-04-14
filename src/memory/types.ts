// UniMemory: Core Type Definitions

export type MemoryScope = 'global' | 'project' | 'agent';
export type MemoryType = 'preference' | 'decision' | 'fact' | 'context' | 'temp';
export type SourceType = 'confirmed' | 'inferred' | 'uncertain';
export type MemoryStatus = 'active' | 'disputed' | 'archived' | 'superseded';
export type ConflictType = 'supersede' | 'contradiction' | 'refinement'; // P1

export interface Memory {
  id: string;
  content: string;
  embedding?: number[];

  // Scope
  scope: MemoryScope;
  project_id?: string;
  agent_id: string;

  // Type & Quality
  memory_type: MemoryType;
  source_type: SourceType;
  confidence: number;        // 0-1
  importance_score: number;  // 0-1, preference/decision 免疫衰减
  entity_tags: string[];

  // Lifecycle
  status: MemoryStatus;
  access_count: number;
  last_accessed_at?: Date;
  archived_at?: Date;

  // Conflict
  conflict_group_id?: string;
  conflict_type?: ConflictType; // P1

  // Provenance
  source_context?: string;
  embedding_model: string;

  created_at: Date;
  updated_at: Date;
}

// ---- MCP Request/Response Types ----

export interface WriteMemoryRequest {
  content: string;
  agent_id: string;
  scope: MemoryScope;
  project_id?: string;
  memory_type: MemoryType;
  source_type?: SourceType;
  confidence?: number;
  importance_score?: number;
  entity_tags?: string[];
  source_context?: string;
}

export interface WriteMemoryResponse {
  memory_id: string;
  status: 'created';
  conflicts_detected: ConflictDetected[];
}

export interface ConflictDetected {
  conflict_id: string;         // 冲突组 ID
  existing_memory_id: string;
  existing_content: string;
  similarity: number;
  conflict_type: 'potential';  // P0 只有 potential，P1 再细化
}

export interface SearchMemoryRequest {
  query: string;
  agent_id: string;
  scope_filter?: MemoryScope[];
  project_id?: string;
  top_k?: number;              // 默认 5
  min_similarity?: number;     // 默认 0.7，向量相似度阈值
  min_confidence?: number;     // 默认 0.0，过滤低质量记忆（雪琪 review 补充）
  include_archived?: boolean;  // 默认 false
}

export interface SearchMemoryResponse {
  memories: MemorySearchResult[];
  conflicts?: ConflictPair[];  // 检索结果中的冲突对
}

export interface MemorySearchResult extends Memory {
  similarity: number;
}

export interface ConflictPair {
  memory_a: string; // content
  memory_b: string;
  conflict_score: number;
}
