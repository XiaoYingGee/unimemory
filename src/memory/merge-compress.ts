/**
 * B3 LLM Merge-Compress Pipeline
 *
 * 将多条相关记忆合并压缩成一条更精炼的记忆。
 *
 * 流程：
 *   1. 接收 memory_ids（2~20 条）
 *   2. 用 LLM 合并内容，生成一条精炼摘要
 *   3. 写入新合并记忆（status=active）
 *   4. 原记忆全部 archived_at=NOW()（可回溯，不删除）
 *   5. 返回新记忆 ID + 原记忆 ID 列表
 *
 * 设计原则：
 *   - Manually triggered：不自动运行，需显式调用
 *   - 原记忆保留：archived_at 标记，通过 merged_into_id 关联新记忆
 *   - LLM 失败不写入：事务保障，失败则回滚
 *   - 合并至少需要 2 条，最多 20 条（防止超 token）
 */

import { getDb } from '../db/connection';
import { generateEmbedding, getEmbeddingModelName } from '../memory/embedding/index';
import { LLMClient } from '../conflict/classifier';

export interface MergeRequest {
  memory_ids: string[];           // 要合并的记忆 ID（2~20）
  agent_id?: string;              // 合并后记忆的归属 agent
  project_id?: string;            // 合并后记忆的 project（可选）
  scope?: 'global' | 'agent' | 'project';  // 合并后记忆的 scope
  triggered_by?: string;          // 谁触发了合并（审计用）
}

export interface MergeResult {
  merged_memory_id: string;       // 新合并记忆的 ID
  archived_memory_ids: string[];  // 被归档的原记忆 ID 列表
  merged_content: string;         // 合并后的内容
  source_count: number;           // 合并了几条
}

export interface MergeMemoryRecord {
  id: string;
  content: string;
  memory_type: string;
  importance_score: number;
  scope: string;
  created_at: Date;
}

const MERGE_PROMPT_TEMPLATE = `你是一个记忆管理助手。以下是多条相关记忆，请将它们合并压缩成一条更精炼、信息完整的记忆。

要求：
1. 保留所有关键信息，不遗漏重要细节
2. 去除重复内容
3. 语言简洁清晰
4. 直接输出合并后的内容，不加任何前缀或解释

---
{memories}
---

合并后的记忆：`;

/**
 * 主入口：合并多条记忆
 */
export async function mergeMemories(
  req: MergeRequest,
  llmClient?: LLMClient
): Promise<MergeResult> {
  if (req.memory_ids.length < 2) {
    throw new Error('至少需要 2 条记忆才能合并');
  }
  if (req.memory_ids.length > 20) {
    throw new Error('最多支持合并 20 条记忆（防止超出 LLM token 限制）');
  }

  const db = await getDb();

  // 1. 加载原记忆（验证存在且都是 active）
  const result = await db.query(
    `SELECT id, content, memory_type, importance_score, scope, created_at
     FROM memories
     WHERE id = ANY($1::uuid[])
       AND archived_at IS NULL
       AND status IN ('active', 'disputed')
     ORDER BY created_at ASC`,
    [req.memory_ids]
  );

  const records: MergeMemoryRecord[] = result.rows;

  if (records.length !== req.memory_ids.length) {
    const foundIds = records.map((r) => r.id);
    const missing = req.memory_ids.filter((id) => !foundIds.includes(id));
    throw new Error(`以下记忆不存在或已归档：${missing.join(', ')}`);
  }

  // 2. 用 LLM 合并内容
  const mergedContent = await callLLMForMerge(records, llmClient);

  // 3. 生成新记忆的 embedding
  const embedding = await generateEmbedding(mergedContent);

  // 4. 事务：写入新记忆 + 归档原记忆
  await db.query('BEGIN');
  try {
    // 推断合并后的 memory_type（取最常见的）
    const typeCount = records.reduce<Record<string, number>>((acc, r) => {
      acc[r.memory_type] = (acc[r.memory_type] ?? 0) + 1;
      return acc;
    }, {});
    const mergedType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0][0];

    // 推断 importance_score（取最大值）
    const maxImportance = Math.max(...records.map((r) => r.importance_score ?? 0.5));

    // 写入新合并记忆
    const insertResult = await db.query(
      `INSERT INTO memories (
        content, memory_type, scope, agent_id, project_id,
        importance_score, embedding, embedding_model,
        source_type, source_context, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, 'merge', $9, 'active')
      RETURNING id`,
      [
        mergedContent,
        mergedType,
        req.scope ?? records[0].scope,
        req.agent_id ?? null,
        req.project_id ?? null,
        maxImportance,
        JSON.stringify(embedding),
        getEmbeddingModelName(),
        `Merged from: ${req.memory_ids.join(', ')}${req.triggered_by ? ` by ${req.triggered_by}` : ''}`,
      ]
    );

    const mergedMemoryId: string = insertResult.rows[0].id;

    // 归档原记忆（archived_at = NOW()，source_context 记录合并去向）
    await db.query(
      `UPDATE memories
       SET archived_at = NOW(),
           source_context = COALESCE(source_context || ' ', '') || '[merged into ' || $1 || ']'
       WHERE id = ANY($2::uuid[])`,
      [mergedMemoryId, req.memory_ids]
    );

    await db.query('COMMIT');

    return {
      merged_memory_id: mergedMemoryId,
      archived_memory_ids: req.memory_ids,
      merged_content: mergedContent,
      source_count: records.length,
    };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

/**
 * 调用 LLM 合并记忆内容
 */
async function callLLMForMerge(
  records: MergeMemoryRecord[],
  llmClient?: LLMClient
): Promise<string> {
  const memoriesText = records
    .map((r, i) => `[${i + 1}] (${r.memory_type}, ${r.created_at.toISOString().slice(0, 10)})\n${r.content}`)
    .join('\n\n');

  const prompt = MERGE_PROMPT_TEMPLATE.replace('{memories}', memoriesText);

  if (llmClient) {
    return llmClient.complete(prompt);
  }

  // 默认降级：简单拼接（当 LLM 不可用时）
  console.warn('[MergeCompress] No LLM client, falling back to concatenation');
  return records.map((r) => r.content).join('\n\n---\n\n');
}

/**
 * 回溯：查看某条合并记忆的原始来源
 */
export async function getMergeSources(mergedMemoryId: string): Promise<{
  merged: { id: string; content: string; created_at: Date };
  sources: { id: string; content: string; archived_at: Date }[];
}> {
  const db = await getDb();

  // 查合并记忆本体
  const mergedResult = await db.query(
    `SELECT id, content, created_at FROM memories WHERE id = $1`,
    [mergedMemoryId]
  );
  if (mergedResult.rows.length === 0) {
    throw new Error(`记忆 ${mergedMemoryId} 不存在`);
  }

  // 查被归档的原记忆（source_context 里包含 merged into <id>）
  const sourcesResult = await db.query(
    `SELECT id, content, archived_at
     FROM memories
     WHERE source_context LIKE $1
       AND archived_at IS NOT NULL
     ORDER BY archived_at DESC`,
    [`%[merged into ${mergedMemoryId}]%`]
  );

  return {
    merged: mergedResult.rows[0],
    sources: sourcesResult.rows,
  };
}
