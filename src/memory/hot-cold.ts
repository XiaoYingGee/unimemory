/**
 * Hot-Cold Storage Manager (B2)
 *
 * 热记忆（Hot）：archived_at IS NULL，参与 HNSW 索引实时检索
 * 冷记忆（Cold）：archived_at IS NOT NULL，不参与实时检索，只能按 ID 直接读取
 *
 * 冷却策略：
 *   - 超过 `coldAfterDays` 天未被访问（last_accessed_at）
 *   - 且 memory_type 不是 preference / decision（这两类免疫冷却）
 *   - 且 importance_score < importanceThreshold（重要记忆不冷却）
 *
 * 升温策略：
 *   - 冷记忆被显式读取时（getMemoryById）自动升温
 *   - 升温后重新参与实时检索
 *
 * 环境变量：
 *   UNIMEMORY_COLD_AFTER_DAYS=30        (默认)
 *   UNIMEMORY_IMPORTANCE_THRESHOLD=0.8  (高于此值不冷却)
 */

import { getDb } from '../db/connection';

export interface ColdStorageConfig {
  coldAfterDays: number;          // 超过此天数未访问 → 冷却（默认 30）
  importanceThreshold: number;    // 高于此值的记忆不冷却（默认 0.8）
  immuneTypes: string[];          // 免疫冷却的 memory_type（默认 preference/decision）
}

export interface ArchiveResult {
  archived: number;   // 本次冷却的记忆数量
  warmedUp: number;   // 本次升温的记忆数量（运行期间不会有，这里留 0）
}

export const DEFAULT_CONFIG: ColdStorageConfig = {
  coldAfterDays: Number(process.env.UNIMEMORY_COLD_AFTER_DAYS) || 30,
  importanceThreshold: Number(process.env.UNIMEMORY_IMPORTANCE_THRESHOLD) || 0.8,
  immuneTypes: ['preference', 'decision'],
};

/**
 * 批量冷却过期记忆（定期任务调用）
 * 将长时间未访问的记忆标记为 archived_at = NOW()
 *
 * @returns 本次冷却的记忆数量
 */
export async function archiveColdMemories(
  config: ColdStorageConfig = DEFAULT_CONFIG
): Promise<ArchiveResult> {
  const db = await getDb();

  const result = await db.query(
    `UPDATE memories
     SET archived_at = NOW()
     WHERE
       archived_at IS NULL
       AND status = 'active'
       AND memory_type != ALL($1::text[])
       AND importance_score < $2
       AND (
         last_accessed_at IS NULL AND created_at < NOW() - INTERVAL '1 day' * $3
         OR
         last_accessed_at < NOW() - INTERVAL '1 day' * $3
       )
     RETURNING id`,
    [config.immuneTypes, config.importanceThreshold, config.coldAfterDays]
  );

  return { archived: result.rows.length, warmedUp: 0 };
}

/**
 * 升温单条冷记忆（按 ID 读取时调用）
 * 清空 archived_at，使其重新参与实时检索
 */
export async function warmUpMemory(memoryId: string): Promise<boolean> {
  const db = await getDb();

  const result = await db.query(
    `UPDATE memories
     SET archived_at = NULL, last_accessed_at = NOW(), access_count = access_count + 1
     WHERE id = $1 AND archived_at IS NOT NULL
     RETURNING id`,
    [memoryId]
  );

  return result.rows.length > 0;
}

/**
 * 查询冷记忆（按 agent_id / scope 过滤）
 * 用于管理界面查看归档记忆
 */
export async function listColdMemories(options: {
  agentId?: string;
  projectId?: string;
  scope?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  memories: {
    id: string;
    content: string;
    memory_type: string;
    importance_score: number;
    archived_at: Date;
    last_accessed_at: Date | null;
    access_count: number;
  }[];
  total: number;
}> {
  const db = await getDb();

  const conditions: string[] = ['archived_at IS NOT NULL'];
  const params: (string | number)[] = [];

  if (options.agentId) {
    params.push(options.agentId);
    conditions.push(`agent_id = $${params.length}`);
  }
  if (options.projectId) {
    params.push(options.projectId);
    conditions.push(`project_id = $${params.length}`);
  }
  if (options.scope) {
    params.push(options.scope);
    conditions.push(`scope = $${params.length}`);
  }

  const where = conditions.join(' AND ');
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;

  const [rows, countRow] = await Promise.all([
    db.query(
      `SELECT id, content, memory_type, importance_score, archived_at, last_accessed_at, access_count
       FROM memories
       WHERE ${where}
       ORDER BY archived_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    db.query(
      `SELECT COUNT(*) as total FROM memories WHERE ${where}`,
      params
    ),
  ]);

  return {
    memories: rows.rows,
    total: Number(countRow.rows[0]?.total ?? 0),
  };
}

/**
 * 冷存储统计（监控用）
 */
export async function getColdStorageStats(): Promise<{
  hotCount: number;
  coldCount: number;
  coldRatio: number;
}> {
  const db = await getDb();

  const result = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE archived_at IS NULL AND status = 'active') AS hot,
      COUNT(*) FILTER (WHERE archived_at IS NOT NULL) AS cold
    FROM memories
  `);

  const hot = Number(result.rows[0]?.hot ?? 0);
  const cold = Number(result.rows[0]?.cold ?? 0);
  const total = hot + cold;

  return {
    hotCount: hot,
    coldCount: cold,
    coldRatio: total > 0 ? cold / total : 0,
  };
}
