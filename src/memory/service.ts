import { getDb } from '../db/connection';
import { generateEmbedding } from './embedding';
import {
  Memory,
  WriteMemoryRequest,
  WriteMemoryResponse,
  SearchMemoryRequest,
  SearchMemoryResponse,
  ConflictDetected,
} from './types';

// 冲突检测阈值（参考 Mnemos: ingestion-time detection with cosine similarity）
// 金瓶儿建议 P0 用 0.80 宁可误报，Mnemos 原版用 0.85，取保守值
const CONFLICT_THRESHOLD = 0.80;

// MemoryBank (AAAI 2024) Ebbinghaus 遗忘曲线公式：
// strength(t) = importance × exp(-decay_rate × elapsed_days)
// decay_rate 参考 MemoryBank: preference/decision = 0.01（慢衰减），fact/context = 0.1，temp = 1.0
const DECAY_RATES: Record<string, number> = {
  preference: 0.01,  // 免疫衰减（几乎不衰减）
  decision:   0.01,  // 免疫衰减
  fact:       0.05,  // 慢衰减
  context:    0.15,  // 正常衰减
  temp:       1.0,   // 快速衰减
};

function computeDecayWeight(memoryType: string, lastAccessedAt: Date | null): number {
  if (!lastAccessedAt) return 1.0; // 从未被访问，不衰减
  const elapsedDays = (Date.now() - lastAccessedAt.getTime()) / (1000 * 86400);
  const rate = DECAY_RATES[memoryType] ?? 0.1;
  return Math.exp(-rate * elapsedDays);
}

export async function writeMemory(
  req: WriteMemoryRequest & { agent_id: string }
): Promise<WriteMemoryResponse> {
  const db = await getDb();
  const embedding = await generateEmbedding(req.content);

  // 1. 冲突检测（写入前检查）
  const conflicts = await detectConflicts(
    embedding,
    req.entity_tags ?? [],
    req.scope,
    req.project_id,
    db
  );

  // 2. 写入记忆
  const result = await db.query(
    `INSERT INTO memories (
      content, embedding, scope, project_id, agent_id,
      memory_type, source_type, confidence, importance_score,
      entity_tags, status, conflict_group_id, source_context, embedding_model
    ) VALUES (
      $1, $2::vector, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, $12, $13, $14
    ) RETURNING id`,
    [
      req.content,
      JSON.stringify(embedding),
      req.scope,
      req.project_id ?? null,
      req.agent_id,
      req.memory_type,
      req.source_type ?? 'confirmed',
      req.confidence ?? 0.5,
      req.importance_score ?? 0.5,
      req.entity_tags ?? [],
      conflicts.length > 0 ? 'disputed' : 'active',
      conflicts.length > 0 ? conflicts[0].conflict_id : null,
      req.source_context ?? null,
      'text-embedding-3-small',
    ]
  );

  const memoryId = result.rows[0].id;

  // 3. 如有冲突，更新已有记忆的 conflict_group_id
  if (conflicts.length > 0) {
    const groupId = conflicts[0].conflict_id;
    await db.query(
      `UPDATE memories SET conflict_group_id = $1, status = 'disputed'
       WHERE id = ANY($2::uuid[])`,
      [groupId, conflicts.map((c) => c.existing_memory_id)]
    );
  }

  return {
    memory_id: memoryId,
    status: 'created',
    conflicts_detected: conflicts,
  };
}

async function detectConflicts(
  embedding: number[],
  entityTags: string[],
  scope: string,
  projectId: string | undefined,
  db: Awaited<ReturnType<typeof getDb>>
): Promise<ConflictDetected[]> {
  // 向量相似度检索候选集（同 scope 过滤）
  const scopeFilter = projectId
    ? `AND (scope = 'global' OR (scope = 'project' AND project_id = $3))`
    : `AND scope = 'global'`;

  const query = `
    SELECT
      id,
      content,
      1 - (embedding <=> $1::vector) AS similarity,
      uuid_generate_v4() AS conflict_id
    FROM memories
    WHERE
      status = 'active'
      AND archived_at IS NULL
      ${scopeFilter}
      AND 1 - (embedding <=> $1::vector) > $2
    ORDER BY similarity DESC
    LIMIT 5
  `;

  const params: (string | number | string[])[] = [
    JSON.stringify(embedding),
    CONFLICT_THRESHOLD,
    ...(projectId ? [projectId] : []),
  ];

  const result = await db.query(query, params);

  return result.rows.map((row: {
    id: string;
    content: string;
    similarity: number;
    conflict_id: string;
  }) => ({
    conflict_id: row.conflict_id,
    existing_memory_id: row.id,
    existing_content: row.content,
    similarity: row.similarity,
    conflict_type: 'potential' as const,
  }));
}

export async function searchMemories(
  req: SearchMemoryRequest
): Promise<SearchMemoryResponse> {
  const db = await getDb();
  const queryEmbedding = await generateEmbedding(req.query);
  const topK = req.top_k ?? 5;
  const minSimilarity = req.min_similarity ?? 0.7;
  const minConfidence = req.min_confidence ?? 0.0; // 过滤低质量记忆（雪琪 review 补充）

  // scope 过滤：始终包含 global，按需包含 project
  const scopeCondition = req.project_id
    ? `AND (scope = 'global' OR (scope = 'project' AND project_id = $5))`
    : `AND scope = 'global'`;

  const query = `
    SELECT
      *,
      1 - (embedding <=> $1::vector) AS similarity_score
    FROM memories
    WHERE
      agent_id != 'private'
      AND archived_at IS NULL
      AND status IN ('active', 'disputed')
      AND confidence >= $4
      AND 1 - (embedding <=> $1::vector) > $2
      ${scopeCondition}
    ORDER BY
      -- MemoryBank Ebbinghaus 衰减排序：importance × exp(-decay × days) × similarity
      -- decay_rate 按 memory_type 分级：preference/decision=0.01, fact=0.05, context=0.15, temp=1.0
      (
        importance_score *
        EXP(
          -CASE memory_type
            WHEN 'preference' THEN 0.01
            WHEN 'decision'   THEN 0.01
            WHEN 'fact'       THEN 0.05
            WHEN 'context'    THEN 0.15
            WHEN 'temp'       THEN 1.0
            ELSE 0.1
          END
          * COALESCE(EXTRACT(EPOCH FROM (NOW() - last_accessed_at)) / 86400.0, 0)
        ) *
        (1 - (embedding <=> $1::vector))
      ) DESC
    LIMIT $3
  `;

  const params: (string | number)[] = [
    JSON.stringify(queryEmbedding),
    minSimilarity,
    topK,
    minConfidence,
    ...(req.project_id ? [req.project_id] : []),
  ];

  const result = await db.query(query, params);

  // 更新 access_count 和 last_accessed_at
  const ids = result.rows.map((r: { id: string }) => r.id);
  if (ids.length > 0) {
    await db.query(
      `UPDATE memories
       SET access_count = access_count + 1, last_accessed_at = NOW()
       WHERE id = ANY($1::uuid[])`,
      [ids]
    );
  }

  // 检测返回结果中的冲突对（始终运行，不管 include_archived 参数）
  const conflictPairs = detectConflictsInResults(result.rows);

  return {
    memories: result.rows,
    conflicts: conflictPairs,
  };
}

function detectConflictsInResults(memories: Memory[]): {
  memory_a: { memory_id: string; content: string };
  memory_b: { memory_id: string; content: string };
  conflict_score: number;
}[] {
  // 返回已标记为 disputed 的记忆对
  const disputed = memories.filter((m) => m.status === 'disputed' && m.conflict_group_id);
  const groups = new Map<string, Memory[]>();

  for (const m of disputed) {
    const gid = m.conflict_group_id!;
    if (!groups.has(gid)) groups.set(gid, []);
    groups.get(gid)!.push(m);
  }

  const pairs: {
    memory_a: { memory_id: string; content: string };
    memory_b: { memory_id: string; content: string };
    conflict_score: number;
  }[] = [];

  for (const group of groups.values()) {
    if (group.length >= 2) {
      pairs.push({
        memory_a: { memory_id: group[0].id, content: group[0].content },
        memory_b: { memory_id: group[1].id, content: group[1].content },
        conflict_score: 0.9, // P0 先用固定值，P1 再精确计算
      });
    }
  }

  return pairs;
}

export async function resolveConflict(
  conflictGroupId: string,
  winnerMemoryId: string,
  resolutionNote?: string
): Promise<{ resolved: boolean; winner: { memory_id: string; content: string }; archived: { memory_id: string; content: string }[] }> {
  const db = await getDb();

  // 获取冲突组所有记忆
  const result = await db.query(
    `SELECT id, content FROM memories WHERE conflict_group_id = $1`,
    [conflictGroupId]
  );

  const winner = result.rows.find((r: { id: string }) => r.id === winnerMemoryId);
  const losers = result.rows.filter((r: { id: string }) => r.id !== winnerMemoryId);

  // 胜者恢复 active，败者标记 superseded
  await db.query(
    `UPDATE memories SET status = 'active', conflict_group_id = NULL WHERE id = $1`,
    [winnerMemoryId]
  );

  await db.query(
    `UPDATE memories SET status = 'superseded' WHERE id = ANY($1::uuid[])`,
    [losers.map((l: { id: string }) => l.id)]
  );

  return {
    resolved: true,
    winner: { memory_id: winner.id, content: winner.content },
    archived: losers.map((l: { id: string; content: string }) => ({ memory_id: l.id, content: l.content })),
  };
}
