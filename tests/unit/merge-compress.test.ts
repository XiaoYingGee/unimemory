/**
 * B3 LLM Merge-Compress Pipeline 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock DB ──────────────────────────────────────────────────────────────────
const mockQuery = vi.fn();
const mockDb = { query: mockQuery };

vi.mock('../../src/db/connection', () => ({
  getDb: vi.fn(() => Promise.resolve(mockDb)),
}));

vi.mock('../../src/memory/embedding', () => ({
  generateEmbedding: vi.fn(() => Promise.resolve(new Array(1536).fill(0.1))),
  getEmbeddingModelName: vi.fn(() => 'text-embedding-3-small'),
}));

import { mergeMemories, getMergeSources, MergeRequest } from '../../src/memory/merge-compress';
import { LLMClient } from '../../src/conflict/llm-client';

// ── Mock LLM Client ───────────────────────────────────────────────────────────
const mockLLMClient: LLMClient = {
  complete: vi.fn(() => Promise.resolve('合并后的精炼记忆内容')),
};

const baseMemories = [
  {
    id: 'uuid-1',
    content: '张三喜欢喝绿茶',
    memory_type: 'preference',
    importance_score: 0.6,
    scope: 'global',
    created_at: new Date('2026-03-01'),
  },
  {
    id: 'uuid-2',
    content: '张三不喜欢喝红茶',
    memory_type: 'preference',
    importance_score: 0.5,
    scope: 'global',
    created_at: new Date('2026-03-05'),
  },
];

beforeEach(() => {
  mockQuery.mockReset();
  vi.mocked(mockLLMClient.complete).mockResolvedValue('合并后的精炼记忆内容');
});

// ── TC-B3-01: 基本合并流程 ────────────────────────────────────────────────────
describe('TC-B3-01: mergeMemories — 基本合并流程', () => {
  it('should merge memories and return merged_memory_id', async () => {
    // SELECT 原记忆
    mockQuery.mockResolvedValueOnce({ rows: baseMemories });
    // BEGIN
    mockQuery.mockResolvedValueOnce({});
    // INSERT 新记忆
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'merged-uuid' }] });
    // UPDATE 归档原记忆
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // COMMIT
    mockQuery.mockResolvedValueOnce({});

    const req: MergeRequest = {
      memory_ids: ['uuid-1', 'uuid-2'],
      scope: 'global',
      triggered_by: 'biyao',
    };

    const result = await mergeMemories(req, mockLLMClient);

    expect(result.merged_memory_id).toBe('merged-uuid');
    expect(result.archived_memory_ids).toEqual(['uuid-1', 'uuid-2']);
    expect(result.source_count).toBe(2);
    expect(result.merged_content).toBe('合并后的精炼记忆内容');
  });

  it('should call LLM with memory content', async () => {
    mockQuery.mockResolvedValueOnce({ rows: baseMemories });
    mockQuery.mockResolvedValueOnce({});
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'merged-uuid' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({});

    const freshClient: LLMClient = { complete: vi.fn(() => Promise.resolve('合并后的精炼记忆内容')) };
    await mergeMemories({ memory_ids: ['uuid-1', 'uuid-2'] }, freshClient);

    expect(freshClient.complete).toHaveBeenCalledOnce();
    const prompt = vi.mocked(freshClient.complete).mock.calls[0][0];
    expect(prompt).toContain('张三喜欢喝绿茶');
    expect(prompt).toContain('张三不喜欢喝红茶');
  });

  it('should archive original memories after merge', async () => {
    mockQuery.mockResolvedValueOnce({ rows: baseMemories });
    mockQuery.mockResolvedValueOnce({});
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'merged-uuid' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({});

    await mergeMemories({ memory_ids: ['uuid-1', 'uuid-2'] }, mockLLMClient);

    // 第 4 次 query 是 UPDATE 归档
    const archiveCall = mockQuery.mock.calls[3];
    expect(archiveCall[0]).toContain('archived_at = NOW()');
    expect(archiveCall[0]).toContain('merged into');
  });
});

// ── TC-B3-02: 输入校验 ────────────────────────────────────────────────────────
describe('TC-B3-02: mergeMemories — 输入校验', () => {
  it('should throw when less than 2 memory_ids', async () => {
    await expect(
      mergeMemories({ memory_ids: ['uuid-1'] }, mockLLMClient)
    ).rejects.toThrow('至少需要 2 条');
  });

  it('should throw when more than 20 memory_ids', async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `uuid-${i}`);
    await expect(
      mergeMemories({ memory_ids: ids }, mockLLMClient)
    ).rejects.toThrow('最多支持合并 20 条');
  });

  it('should throw when some memories not found or archived', async () => {
    // DB 只返回 1 条（少于请求的 2 条）
    mockQuery.mockResolvedValueOnce({ rows: [baseMemories[0]] });

    await expect(
      mergeMemories({ memory_ids: ['uuid-1', 'uuid-missing'] }, mockLLMClient)
    ).rejects.toThrow('不存在或已归档');
  });
});

// ── TC-B3-03: 事务回滚 ────────────────────────────────────────────────────────
describe('TC-B3-03: mergeMemories — 事务回滚', () => {
  it('should rollback on INSERT failure', async () => {
    mockQuery.mockResolvedValueOnce({ rows: baseMemories });
    mockQuery.mockResolvedValueOnce({}); // BEGIN
    mockQuery.mockRejectedValueOnce(new Error('DB insert failed')); // INSERT 失败
    mockQuery.mockResolvedValueOnce({}); // ROLLBACK

    await expect(
      mergeMemories({ memory_ids: ['uuid-1', 'uuid-2'] }, mockLLMClient)
    ).rejects.toThrow('DB insert failed');

    // 确认 ROLLBACK 被调用
    const rollbackCall = mockQuery.mock.calls.find((c) => c[0] === 'ROLLBACK');
    expect(rollbackCall).toBeTruthy();
  });
});

// ── TC-B3-04: LLM 降级 ────────────────────────────────────────────────────────
describe('TC-B3-04: mergeMemories — LLM 降级', () => {
  it('should fallback to concatenation when no LLM client', async () => {
    mockQuery.mockResolvedValueOnce({ rows: baseMemories });
    mockQuery.mockResolvedValueOnce({});
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'merged-uuid' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({});

    // 不传 llmClient
    const result = await mergeMemories({ memory_ids: ['uuid-1', 'uuid-2'] });

    // 降级时内容是原始内容拼接
    expect(result.merged_content).toContain('张三喜欢喝绿茶');
    expect(result.merged_content).toContain('张三不喜欢喝红茶');
  });
});

// ── TC-B3-05: importance_score 取最大值 ──────────────────────────────────────
describe('TC-B3-05: mergeMemories — importance_score 推断', () => {
  it('should use max importance_score from source memories', async () => {
    const memoriesWithDiffImportance = [
      { ...baseMemories[0], importance_score: 0.4 },
      { ...baseMemories[1], importance_score: 0.9 },
    ];

    mockQuery.mockResolvedValueOnce({ rows: memoriesWithDiffImportance });
    mockQuery.mockResolvedValueOnce({});
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'merged-uuid' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({});

    await mergeMemories({ memory_ids: ['uuid-1', 'uuid-2'] }, mockLLMClient);

    // INSERT 调用中 importance_score 应为 0.9
    const insertCall = mockQuery.mock.calls[2];
    const params = insertCall[1];
    expect(params[5]).toBe(0.9);
  });
});

// ── TC-B3-06: getMergeSources 回溯 ───────────────────────────────────────────
describe('TC-B3-06: getMergeSources — 回溯查询', () => {
  it('should return merged memory and its sources', async () => {
    const mergedMem = { id: 'merged-uuid', content: '合并内容', created_at: new Date() };
    const sourceMems = [
      { id: 'uuid-1', content: '原始1', archived_at: new Date() },
      { id: 'uuid-2', content: '原始2', archived_at: new Date() },
    ];

    mockQuery
      .mockResolvedValueOnce({ rows: [mergedMem] })
      .mockResolvedValueOnce({ rows: sourceMems });

    const result = await getMergeSources('merged-uuid');

    expect(result.merged.id).toBe('merged-uuid');
    expect(result.sources).toHaveLength(2);
  });

  it('should throw when merged memory not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(getMergeSources('nonexistent')).rejects.toThrow('不存在');
  });
});
