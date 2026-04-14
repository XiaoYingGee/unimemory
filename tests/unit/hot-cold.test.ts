/**
 * B2 热冷分级存储 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock DB ──────────────────────────────────────────────────────────────────
const mockQuery = vi.fn();
const mockDb = { query: mockQuery };

vi.mock('../../src/db/connection', () => ({
  getDb: vi.fn(() => Promise.resolve(mockDb)),
}));

import {
  archiveColdMemories,
  warmUpMemory,
  listColdMemories,
  getColdStorageStats,
  DEFAULT_CONFIG,
  ColdStorageConfig,
} from '../../src/memory/hot-cold';

beforeEach(() => {
  mockQuery.mockReset();
});

// ── TC-B2-01: archiveColdMemories ────────────────────────────────────────────
describe('TC-B2-01: archiveColdMemories', () => {
  it('should archive cold memories and return count', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'uuid-1' }, { id: 'uuid-2' }, { id: 'uuid-3' }],
    });

    const result = await archiveColdMemories();

    expect(result.archived).toBe(3);
    expect(result.warmedUp).toBe(0);
  });

  it('should use default config (30 days, threshold 0.8)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await archiveColdMemories();

    const queryCall = mockQuery.mock.calls[0];
    const params = queryCall[1];

    expect(params[0]).toEqual(expect.arrayContaining(['preference', 'decision']));
    expect(params[1]).toBe(0.8);    // importanceThreshold
    expect(params[2]).toBe(30);     // coldAfterDays
  });

  it('should respect custom config', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-1' }] });

    const customConfig: ColdStorageConfig = {
      coldAfterDays: 7,
      importanceThreshold: 0.5,
      immuneTypes: ['preference'],
    };

    const result = await archiveColdMemories(customConfig);
    expect(result.archived).toBe(1);

    const params = mockQuery.mock.calls[0][1];
    expect(params[1]).toBe(0.5);
    expect(params[2]).toBe(7);
  });

  it('should return 0 when no memories to archive', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await archiveColdMemories();
    expect(result.archived).toBe(0);
  });
});

// ── TC-B2-02: warmUpMemory ────────────────────────────────────────────────────
describe('TC-B2-02: warmUpMemory', () => {
  it('should return true when memory is warmed up', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-1' }] });

    const result = await warmUpMemory('uuid-1');
    expect(result).toBe(true);
  });

  it('should return false when memory is already hot or not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await warmUpMemory('not-cold-uuid');
    expect(result).toBe(false);
  });

  it('should clear archived_at and update access_count', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'uuid-1' }] });

    await warmUpMemory('uuid-1');

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('archived_at = NULL');
    expect(sql).toContain('access_count = access_count + 1');
    expect(sql).toContain('last_accessed_at = NOW()');
  });
});

// ── TC-B2-03: listColdMemories ────────────────────────────────────────────────
describe('TC-B2-03: listColdMemories', () => {
  it('should return paginated cold memories', async () => {
    const mockMemory = {
      id: 'uuid-1',
      content: '旧的临时记忆',
      memory_type: 'context',
      importance_score: 0.3,
      archived_at: new Date('2026-03-01'),
      last_accessed_at: new Date('2026-02-01'),
      access_count: 2,
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [mockMemory] })
      .mockResolvedValueOnce({ rows: [{ total: '5' }] });

    const result = await listColdMemories({ agentId: 'biyao', limit: 10 });

    expect(result.memories).toHaveLength(1);
    expect(result.total).toBe(5);
    expect(result.memories[0].memory_type).toBe('context');
  });

  it('should include archived_at IS NOT NULL in WHERE clause', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] });

    await listColdMemories({});

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('archived_at IS NOT NULL');
  });
});

// ── TC-B2-04: getColdStorageStats ────────────────────────────────────────────
describe('TC-B2-04: getColdStorageStats', () => {
  it('should calculate cold ratio correctly', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ hot: '70', cold: '30' }],
    });

    const stats = await getColdStorageStats();

    expect(stats.hotCount).toBe(70);
    expect(stats.coldCount).toBe(30);
    expect(stats.coldRatio).toBeCloseTo(0.3);
  });

  it('should return coldRatio=0 when no memories', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ hot: '0', cold: '0' }],
    });

    const stats = await getColdStorageStats();
    expect(stats.coldRatio).toBe(0);
  });
});

// ── TC-B2-05: DEFAULT_CONFIG 值 ──────────────────────────────────────────────
describe('TC-B2-05: DEFAULT_CONFIG', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_CONFIG.coldAfterDays).toBe(30);
    expect(DEFAULT_CONFIG.importanceThreshold).toBe(0.8);
    expect(DEFAULT_CONFIG.immuneTypes).toContain('preference');
    expect(DEFAULT_CONFIG.immuneTypes).toContain('decision');
  });
});
