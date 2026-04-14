-- UniMemory: Initial Schema
-- P0 版本：核心记忆表

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE memories (
  -- 主键
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- 内容
  content TEXT NOT NULL,
  embedding vector(1536),           -- OpenAI text-embedding-3-small 维度

  -- Scope（多级 scope 树）
  scope VARCHAR(20) NOT NULL        -- global / project / agent
    CHECK (scope IN ('global', 'project', 'agent')),
  project_id VARCHAR(100),          -- scope=project 时必填
  agent_id VARCHAR(50) NOT NULL,    -- 写入者

  -- 类型与质量
  memory_type VARCHAR(20) NOT NULL  -- preference/decision/fact/context/temp
    CHECK (memory_type IN ('preference', 'decision', 'fact', 'context', 'temp')),
  source_type VARCHAR(20) NOT NULL  -- confirmed/inferred/uncertain
    CHECK (source_type IN ('confirmed', 'inferred', 'uncertain'))
    DEFAULT 'confirmed',
  confidence FLOAT DEFAULT 0.5
    CHECK (confidence BETWEEN 0 AND 1),
  importance_score FLOAT DEFAULT 0.5
    CHECK (importance_score BETWEEN 0 AND 1),
  entity_tags TEXT[] DEFAULT '{}',  -- 实体标签（用于冲突检测）

  -- 生命周期
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'disputed', 'archived', 'superseded')),
  access_count INT DEFAULT 0,
  last_accessed_at TIMESTAMP,
  archived_at TIMESTAMP,            -- NULL=热记忆，有值=冷归档

  -- 冲突检测
  conflict_group_id UUID,           -- 同组冲突记忆共享同一 group_id
  conflict_type VARCHAR(20),        -- P1 填值: supersede/contradiction/refinement

  -- 溯源
  source_context TEXT,              -- 写入时的上下文摘要
  embedding_model VARCHAR(50) DEFAULT 'text-embedding-3-small',

  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引：热记忆向量检索（HNSW，只索引活跃记忆）
CREATE INDEX memories_hot_hnsw ON memories
  USING hnsw (embedding vector_cosine_ops)
  WHERE archived_at IS NULL AND status = 'active';

-- 索引：按 agent + scope 查询
CREATE INDEX memories_agent_scope ON memories (agent_id, scope, status);
CREATE INDEX memories_project ON memories (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX memories_entity_tags ON memories USING gin (entity_tags);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER memories_updated_at
  BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
