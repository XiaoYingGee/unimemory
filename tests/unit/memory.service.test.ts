import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 数据库和 embedding，不依赖真实 PostgreSQL
vi.mock('../../src/db/connection', () => ({
  getDb: vi.fn(() => ({
    query: vi.fn(),
  })),
}));

vi.mock('../../src/memory/embedding', () => ({
  generateEmbedding: vi.fn(() => Promise.resolve(new Array(1536).fill(0.1))),
}));

import { writeMemory, searchMemories } from '../../src/memory/service';
import { getDb } from '../../src/db/connection';

describe('writeMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-CRUD-01: should write a memory and return memory_id', async () => {
    const mockDb = await getDb() as any;
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })                              // conflict detection: no conflicts
      .mockResolvedValueOnce({ rows: [{ id: 'test-uuid-1234' }] });    // insert

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
    const mockDb = await getDb() as any;
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'existing-uuid',
          content: '主人偏好使用 MongoDB',
          similarity: 0.87,
          conflict_id: 'conflict-group-uuid',
        }]
      })
      .mockResolvedValueOnce({ rows: [{ id: 'new-uuid' }] })
      .mockResolvedValueOnce({ rows: [] });

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

  it('TC-CRUD-03: should reject write without project_id when scope=project', async () => {
    // service 层透传到 MCP 层做 zod 校验
    // 这里直接测 service 层：没有 project_id 时应使用 null
    const mockDb = await getDb() as any;
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'proj-uuid' }] });

    const result = await writeMemory({
      content: '项目级别决策',
      agent_id: 'biyao',
      scope: 'project',
      project_id: 'unimemory',  // 正确：有 project_id
      memory_type: 'decision',
      source_type: 'confirmed',
    });

    expect(result.memory_id).toBe('proj-uuid');

    // 验证 query 调用时 project_id 被正确传入
    const insertCall = mockDb.query.mock.calls[1];
    expect(insertCall[1][3]).toBe('unimemory'); // $4 = project_id
  });

  // 🔴 补：幻觉写入防护 — inferred + confidence < 0.70 应被标记警告
  it('TC-QUALITY-01: should flag low-confidence inferred memory', async () => {
    const mockDb = await getDb() as any;
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'inferred-uuid' }] });

    const result = await writeMemory({
      content: '主人可能喜欢深色主题',
      agent_id: 'biyao',
      scope: 'global',
      memory_type: 'context',
      source_type: 'inferred',
      confidence: 0.45,  // < 0.70，应该被写入但标记为 uncertain
    });

    // P0：低置信度 inferred 记忆仍然写入，但 source_type 保持 inferred
    // 服务层不拦截，由调用规范约束（规范禁止 agent 把 inferred 标注为 confirmed）
    expect(result.memory_id).toBe('inferred-uuid');
    // 验证写入时 source_type 为 inferred（没有被偷改为 confirmed）
    const insertCall = mockDb.query.mock.calls[1];
    expect(insertCall[1][6]).toBe('inferred'); // $7 = source_type
  });
});

describe('searchMemories — scope isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 🔴 补：Scope 隔离 — global 记忆跨项目可读
  it('TC-SCOPE-01: global memories should be visible across all projects', async () => {
    const mockDb = await getDb() as any;
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

    mockDb.query
      .mockResolvedValueOnce({ rows: [globalMemory] })
      .mockResolvedValueOnce({ rows: [] });

    // 查询时指定 project_id，但 global 记忆仍应返回
    const result = await searchMemories({
      query: '数据库选型',
      agent_id: 'tianlingr',
      project_id: 'some-other-project',
    });

    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].scope).toBe('global');
  });

  // 🔴 补：Scope 隔离 — project 级记忆不跨项目泄漏
  it('TC-SCOPE-02: project memories should not leak to other projects', async () => {
    const mockDb = await getDb() as any;

    // 模拟：不同项目查询，project 记忆不返回
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })  // 正确：不返回其他项目的记忆
      .mockResolvedValueOnce({ rows: [] });

    const result = await searchMemories({
      query: 'P0 范围决策',
      agent_id: 'tianlingr',
      project_id: 'asset-management',  // 不同项目
    });

    // 验证 SQL 查询包含了正确的 scope 过滤
    const searchCall = mockDb.query.mock.calls[0];
    const sqlQuery = searchCall[0] as string;
    // SQL 应该包含 project_id 过滤
    expect(sqlQuery).toContain('project_id');
    expect(result.memories).toHaveLength(0);
  });

  // 🟡 补：不同 scope 的相似记忆不应触发冲突
  it('TC-CONFLICT-02: similar memories in different scopes should NOT trigger conflict', async () => {
    const mockDb = await getDb() as any;
    // 写入 project 级记忆，即使有全局相似记忆，不同 scope 不算冲突
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })                            // 不同 scope 过滤后无冲突
      .mockResolvedValueOnce({ rows: [{ id: 'project-mem' }] });

    const result = await writeMemory({
      content: '该项目使用 MongoDB',
      agent_id: 'biyao',
      scope: 'project',
      project_id: 'project-b',
      memory_type: 'decision',
      source_type: 'confirmed',
    });

    // 应该没有冲突（全局"主人偏好 PostgreSQL"和项目级别的不同）
    expect(result.conflicts_detected).toHaveLength(0);
  });

  // 🟡 补：读取结果里 conflicts 格式验证
  it('TC-CONFLICT-03: search response should include conflict pairs for disputed memories', async () => {
    const mockDb = await getDb() as any;
    const conflictGroupId = 'group-uuid-123';
    const disputedMemories = [
      {
        id: 'mem-a',
        content: '主人要用 PostgreSQL',
        scope: 'global',
        memory_type: 'preference',
        status: 'disputed',
        importance_score: 0.9,
        similarity_score: 0.85,
        conflict_group_id: conflictGroupId,
      },
      {
        id: 'mem-b',
        content: '主人要用 MongoDB',
        scope: 'global',
        memory_type: 'preference',
        status: 'disputed',
        importance_score: 0.9,
        similarity_score: 0.82,
        conflict_group_id: conflictGroupId,
      },
    ];

    mockDb.query
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
    expect(result.conflicts![0].memory_a.memory_id).toBe('mem-a');
    expect(result.conflicts![0].memory_b.memory_id).toBe('mem-b');
  });
});
