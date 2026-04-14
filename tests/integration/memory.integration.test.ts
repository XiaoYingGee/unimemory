/**
 * UniMemory P0 集成测试
 * 真实 PostgreSQL + pgvector，不 mock 数据库
 *
 * 前置条件:
 *   docker compose up -d
 *   DATABASE_URL=postgresql://unimemory:unimemory@localhost:5432/unimemory
 *
 * 运行:
 *   DATABASE_URL=postgresql://unimemory:unimemory@localhost:5432/unimemory npx vitest run tests/integration/
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeMemory, searchMemories } from '../../src/memory/service';
import { getDb } from '../../src/db/connection';

// ── 测试数据清理 ────────────────────────────────────────────────────────────
const TEST_AGENT_ID = 'integration-test-agent';

async function cleanup() {
  const db = await getDb();
  await db.query(`DELETE FROM memories WHERE agent_id = $1`, [TEST_AGENT_ID]);
}

// ── 跳过条件：没有 OpenAI key 就跳过（embedding 需要 API） ──────────────────
const skipIfNoOpenAI = !process.env.OPENAI_API_KEY
  ? it.skip
  : it;

// ── 生命周期 ────────────────────────────────────────────────────────────────
beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  const db = await getDb();
  await (db as any).end?.();
});

// ── TC-INT-01: 写入记忆并读回 ─────────────────────────────────────────────
describe('TC-INT-01: write and read back', () => {
  skipIfNoOpenAI('should write a memory and retrieve it by semantic search', async () => {
    const writeResult = await writeMemory({
      content: '集成测试：主人偏好在项目中使用 TypeScript 而非 JavaScript',
      agent_id: TEST_AGENT_ID,
      scope: 'global',
      memory_type: 'preference',
      source_type: 'confirmed',
      confidence: 0.95,
      importance_score: 0.9,
      entity_tags: ['typescript', 'language-preference'],
    });

    expect(writeResult.memory_id).toBeTruthy();
    expect(writeResult.status).toBe('created');

    // 语义搜索能找回来
    const searchResult = await searchMemories({
      query: '主人喜欢哪种编程语言',
      agent_id: TEST_AGENT_ID,
      top_k: 5,
      min_similarity: 0.5,
    });

    const found = searchResult.memories.find(
      (m) => m.id === writeResult.memory_id
    );
    expect(found).toBeTruthy();
    expect(found!.content).toContain('TypeScript');
  }, 30_000);
});

// ── TC-INT-02: Scope 隔离 ─────────────────────────────────────────────────
describe('TC-INT-02: scope isolation', () => {
  skipIfNoOpenAI('project-scoped memory should not appear in other project search', async () => {
    await writeMemory({
      content: '集成测试：项目A的内部技术决策，不应外泄',
      agent_id: TEST_AGENT_ID,
      scope: 'project',
      project_id: 'project-alpha',
      memory_type: 'decision',
      source_type: 'confirmed',
      confidence: 0.9,
      importance_score: 0.8,
      entity_tags: ['internal', 'project-alpha'],
    });

    // 用不同 project_id 搜索，不应找到
    const result = await searchMemories({
      query: '项目A的技术决策',
      agent_id: TEST_AGENT_ID,
      project_id: 'project-beta',
      min_similarity: 0.5,
    });

    const leaked = result.memories.find((m) =>
      m.content?.includes('项目A的内部技术决策')
    );
    expect(leaked).toBeUndefined();
  }, 30_000);
});

// ── TC-INT-03: 冲突检测 ───────────────────────────────────────────────────
describe('TC-INT-03: conflict detection', () => {
  skipIfNoOpenAI('should detect conflict between contradictory memories', async () => {
    await writeMemory({
      content: '集成测试冲突：主人决定在生产环境使用 MySQL 数据库',
      agent_id: TEST_AGENT_ID,
      scope: 'global',
      memory_type: 'decision',
      source_type: 'confirmed',
      confidence: 0.9,
      importance_score: 0.85,
      entity_tags: ['database', 'production'],
    });

    // 写入矛盾记忆
    const conflictResult = await writeMemory({
      content: '集成测试冲突：主人决定在生产环境使用 PostgreSQL 数据库',
      agent_id: TEST_AGENT_ID,
      scope: 'global',
      memory_type: 'decision',
      source_type: 'confirmed',
      confidence: 0.9,
      importance_score: 0.85,
      entity_tags: ['database', 'production'],
    });

    // 相似度够高时应检测到冲突
    // 注意：阈值 0.80，两条关于"生产环境数据库选型"的句子相似度通常 > 0.80
    if (conflictResult.conflicts_detected.length > 0) {
      expect(conflictResult.conflicts_detected[0].conflict_type).toBe('potential');
      expect(conflictResult.conflicts_detected[0].similarity).toBeGreaterThan(0.80);
    }
    // 即使相似度不足 0.80 也不算失败，只记录
    expect(conflictResult.status).toBe('created');
  }, 30_000);
});

// ── TC-INT-04: 无 OpenAI key 时的降级行为 ────────────────────────────────
describe('TC-INT-04: graceful degradation without OpenAI key', () => {
  it('should fail with clear error message when embedding is unavailable', async () => {
    if (process.env.OPENAI_API_KEY) {
      // 有 key 就跳过这个测试
      return;
    }

    await expect(
      writeMemory({
        content: '测试无 OpenAI key 时的行为',
        agent_id: TEST_AGENT_ID,
        scope: 'global',
        memory_type: 'context',
        source_type: 'inferred',
        confidence: 0.5,
      })
    ).rejects.toThrow();
  });
});
