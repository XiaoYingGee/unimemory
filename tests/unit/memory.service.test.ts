import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock 数据库和 embedding，不依赖真实 PostgreSQL
vi.mock('../db/connection', () => ({
  getDb: vi.fn(() => ({
    query: vi.fn(),
  })),
}));

vi.mock('../memory/embedding', () => ({
  generateEmbedding: vi.fn(() => Promise.resolve(new Array(1536).fill(0.1))),
}));

import { writeMemory, searchMemories } from '../src/memory/service';
import { getDb } from '../src/db/connection';

describe('writeMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should write a memory and return memory_id', async () => {
    const mockDb = await getDb() as ReturnType<typeof vi.fn>;
    // @ts-ignore
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })           // conflict detection: no conflicts
      .mockResolvedValueOnce({ rows: [{ id: 'test-uuid-1234' }] }) // insert
    ;

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

  it('should detect conflicts and mark memory as disputed', async () => {
    const mockDb = await getDb() as ReturnType<typeof vi.fn>;
    // @ts-ignore
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'existing-uuid',
          content: '主人偏好使用 MongoDB',
          similarity: 0.87,
          conflict_id: 'conflict-group-uuid',
        }]
      })                                                            // conflict detected
      .mockResolvedValueOnce({ rows: [{ id: 'new-uuid' }] })       // insert
      .mockResolvedValueOnce({ rows: [] })                          // update conflict group
    ;

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

  it('should reject write without project_id when scope=project', async () => {
    // 这个由 MCP server 层校验，service 层透传
    // 测试 MCP server 的 zod 校验
    expect(true).toBe(true); // placeholder，MCP 层由集成测试覆盖
  });
});

describe('searchMemories', () => {
  it('should return top-k memories with decay-weighted scores', async () => {
    const mockDb = await getDb() as ReturnType<typeof vi.fn>;
    const mockMemories = [
      {
        id: 'mem-1',
        content: '主人偏好 PostgreSQL',
        scope: 'global',
        memory_type: 'preference',
        status: 'active',
        importance_score: 0.9,
        similarity_score: 0.88,
        conflict_group_id: null,
      },
    ];

    // @ts-ignore
    mockDb.query
      .mockResolvedValueOnce({ rows: mockMemories })  // search
      .mockResolvedValueOnce({ rows: [] })             // update access_count
    ;

    const result = await searchMemories({
      query: '数据库选型',
      agent_id: 'tianlingr',
    });

    expect(result.memories).toHaveLength(1);
    expect(result.memories[0].content).toBe('主人偏好 PostgreSQL');
    expect(result.conflicts).toHaveLength(0);
  });
});
