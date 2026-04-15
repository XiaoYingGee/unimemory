import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock 设置 ────────────────────────────────────────────────────────────
const mockQuery = vi.fn();
const mockDb = { query: mockQuery };

vi.mock('../../src/db/connection', () => ({
  getDb: vi.fn(() => Promise.resolve(mockDb)),
}));

vi.mock('../../src/memory/embedding/index', () => ({
  generateEmbedding: vi.fn(() => Promise.resolve(new Array(1536).fill(0.1))),
  getEmbeddingModelName: vi.fn(() => 'mock/test-embedding'),
}));

vi.mock('../../src/memory/embedding', () => ({
  generateEmbedding: vi.fn(() => Promise.resolve(new Array(1536).fill(0.1))),
  getEmbeddingModelName: vi.fn(() => 'mock/test-embedding'),
}));

import { writeMemory, searchMemories } from '../../src/memory/service';

// ── writeMemory ───────────────────────────────────────────────────────────
describe('writeMemory', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('TC-CRUD-01: should write a memory and return memory_id', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })                               // conflict detection: no conflicts
      .mockResolvedValueOnce({ rows: [{ id: 'test-uuid-1234' }] });      // insert

    const result = await writeMemory({
      content: '主人偏好使用 PostgreSQL',
      agent_id: 'biyao',
      scope: 'global',
      memory_type: 'preference',
      source_type: 'confirmed',
      confidence: 0.95,
      importance_score: 0.9,
      entity_tags: ['db-choice', 'postgresql'],
    });

    expect(result.memory_id).toBe('test-uuid-1234');
    expect(result.status).toBe('created');
    expect(result.conflicts_detected).toHaveLength(0);
  });

  it('TC-CRUD-02: should detect conflicts and mark memory as disputed', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'existing-uuid',
          content: '主人偏好使用 MongoDB',
          similarity: 0.87,
          conflict_id: 'conflict-group-uuid',
        }]
      })                                                              // conflict detected
      .mockResolvedValueOnce({ rows: [{ id: 'new-uuid' }] })         // insert
      .mockResolvedValueOnce({ rows: [] });                           // update conflict group

    const result = await writeMemory({
      content: '主人偏好使用 PostgreSQL',
      agent_id: 'biyao',
      scope: 'global',
      memory_type: 'preference',
      source_type: 'confirmed',
    });

    expect(result.conflicts_detected).toHaveLength(1);
    expect(result.conflicts_detected[0].conflict_type).toBe('potential');
    expect(result.conflicts_detected[0].similarity).toBeGreaterThan(0.80);
  });

  it('TC-CRUD-03: should correctly pass project_id when scope=project', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'proj-uuid' }] });

    const result = await writeMemory({
      content: '项目级别决策',
      agent_id: 'biyao',
      scope: 'project',
      project_id: 'unimemory',
      memory_type: 'decision',
      source_type: 'confirmed',
    });

    expect(result.memory_id).toBe('proj-uuid');
    // 验证 insert query 中 project_id ($4) 被正确传入
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall[1][3]).toBe('unimemory');
  });

  it('TC-QUALITY-01: should preserve inferred source_type for low-confidence memory', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'inferred-uuid' }] });

    const result = await writeMemory({
      content: '主人可能喜欢深色主题',
      agent_id: 'biyao',
      scope: 'global',
      memory_type: 'context',
      source_type: 'inferred',
      confidence: 0.45,
    });

    expect(result.memory_id).toBe('inferred-uuid');
    // 验证写入时 source_type 保持为 inferred（$7 = source_type）
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall[1][6]).toBe('inferred');
  });
});

// ── searchMemories ─────────────────────────────────────────────────────────
describe('searchMemories — scope isolation', () => {
  beforeEach(() => {
    mockQuery.mockReset(); // reset 同时清除 call history 和 mock 实现
  });

  it('TC-SCOPE-01: global memories should be visible across all projects', async () => {
    const globalMemory = {
      id: 'global-mem-1',
      content: '主人偏好 PostgreSQL',
      scope: 'global',
      memory_type: 'preference',
      status: 'active',
      importance_score: 0.9,
      similarity_score: 0.88,
      conflict_group_id: null,
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [globalMemory] })   // search
      .mockResolvedValueOnce({ rows: [] });               // update access_count

    const result = await searchMemories({
      query: '数据库选型',
      agent_id: 'tianlingr',
      project_id: 'some-other-project',
    });

    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].scope).toBe('global');
  });

  it('TC-SCOPE-02: SQL should include project_id filter to prevent cross-project leakage', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })   // search returns empty (correct scoping)
      .mockResolvedValueOnce({ rows: [] });   // access_count update (no-op)

    await searchMemories({
      query: 'P0 范围决策',
      agent_id: 'tianlingr',
      project_id: 'asset-management',
    });

    // 验证 SQL 查询包含了 project_id 过滤条件
    const searchCall = mockQuery.mock.calls[0];
    const sqlQuery = searchCall[0] as string;
    expect(sqlQuery).toContain('project_id');
  });

  it('TC-CONFLICT-02: different-scope similar memories should NOT trigger conflict', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })                      // detectConflicts: no match
      .mockResolvedValueOnce({ rows: [{ id: 'project-mem' }] }); // insert

    const result = await writeMemory({
      content: '该项目使用 MongoDB',
      agent_id: 'biyao',
      scope: 'project',
      project_id: 'project-b',
      memory_type: 'decision',
      source_type: 'confirmed',
    });

    expect(result.conflicts_detected).toHaveLength(0);
    expect(result.memory_id).toBe('project-mem');
  });

  it('TC-CONFLICT-03: search response should include conflict pairs for disputed memories', async () => {
    const conflictGroupId = 'group-uuid-123';
    // 注意：mock 返回的对象需要与 Memory interface 字段完全匹配
    const disputedMemories = [
      {
        id: 'mem-a',
        content: '主人要用 PostgreSQL',
        scope: 'global' as const,
        agent_id: 'biyao',
        project_id: undefined,
        memory_type: 'preference' as const,
        source_type: 'confirmed' as const,
        confidence: 0.9,
        importance_score: 0.9,
        entity_tags: [],
        status: 'disputed' as const,
        access_count: 0,
        conflict_group_id: conflictGroupId,
        conflict_type: undefined,
        source_context: undefined,
        embedding_model: 'text-embedding-3-small',
        created_at: new Date(),
        updated_at: new Date(),
        last_accessed_at: undefined,
        archived_at: undefined,
        similarity_score: 0.85,
      },
      {
        id: 'mem-b',
        content: '主人要用 MongoDB',
        scope: 'global' as const,
        agent_id: 'biyao',
        project_id: undefined,
        memory_type: 'preference' as const,
        source_type: 'confirmed' as const,
        confidence: 0.9,
        importance_score: 0.9,
        entity_tags: [],
        status: 'disputed' as const,
        access_count: 0,
        conflict_group_id: conflictGroupId,
        conflict_type: undefined,
        source_context: undefined,
        embedding_model: 'text-embedding-3-small',
        created_at: new Date(),
        updated_at: new Date(),
        last_accessed_at: undefined,
        archived_at: undefined,
        similarity_score: 0.82,
      },
    ];

    mockQuery
      .mockResolvedValueOnce({ rows: disputedMemories })
      .mockResolvedValueOnce({ rows: [] });

    const result = await searchMemories({
      query: '数据库选型偏好',
      agent_id: 'tianlingr',
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts![0]).toHaveProperty('memory_a');
    expect(result.conflicts![0]).toHaveProperty('memory_b');
    expect(result.conflicts![0]).toHaveProperty('conflict_score');
    // memory_a/memory_b are content strings in ConflictPair
    expect(typeof result.conflicts![0].memory_a).toBe('string');
    expect(typeof result.conflicts![0].memory_b).toBe('string');
  });
});
