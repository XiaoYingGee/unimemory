/**
 * B1 冲突三分类 单元测试
 * 验证 classifyConflict 的 LLM 调用、降级策略、三种类型判断
 */
import { describe, it, expect, vi } from 'vitest';
import { classifyConflict, LLMClient, ClassifyConflictInput } from '../../src/conflict/classifier';
import { createLLMClient, _resetLLMClientForTest } from '../../src/conflict/llm-client';

// ── 工具函数 ─────────────────────────────────────────────────────────────────
function makeMockLLM(response: string): LLMClient {
  return { complete: vi.fn().mockResolvedValue(response) };
}

const baseInput: ClassifyConflictInput = {
  existing_content: '主人使用 Mac mini 作为主力开发机',
  new_content: '主人换了 Windows PC 作为主力开发机',
  memory_type: 'preference',
  similarity: 0.88,
};

// ── TC-B1-01: supersede 分类 ──────────────────────────────────────────────
describe('TC-B1-01: supersede classification', () => {
  it('should classify update as supersede', async () => {
    const llm = makeMockLLM(JSON.stringify({
      conflict_type: 'supersede',
      confidence: 0.92,
      reasoning: 'New memory directly replaces the existing one with updated information.',
    }));

    const result = await classifyConflict(baseInput, llm);

    expect(result.conflict_type).toBe('supersede');
    expect(result.confidence).toBeCloseTo(0.92);
    expect(result.reasoning).toBeTruthy();
  });
});

// ── TC-B1-02: contradiction 分类 ─────────────────────────────────────────
describe('TC-B1-02: contradiction classification', () => {
  it('should classify direct contradiction correctly', async () => {
    const llm = makeMockLLM(JSON.stringify({
      conflict_type: 'contradiction',
      confidence: 0.95,
      reasoning: 'Both cannot be true simultaneously; needs human resolution.',
    }));

    const result = await classifyConflict({
      ...baseInput,
      existing_content: '主人喜欢喝茶',
      new_content: '主人从不喝茶，只喝咖啡',
    }, llm);

    expect(result.conflict_type).toBe('contradiction');
    expect(result.confidence).toBeGreaterThan(0.9);
  });
});

// ── TC-B1-03: refinement 分类 ────────────────────────────────────────────
describe('TC-B1-03: refinement classification', () => {
  it('should classify detail addition as refinement', async () => {
    const llm = makeMockLLM(JSON.stringify({
      conflict_type: 'refinement',
      confidence: 0.85,
      reasoning: 'New memory adds detail (pgvector) to existing, both are valid.',
    }));

    const result = await classifyConflict({
      ...baseInput,
      existing_content: '主人的项目使用 PostgreSQL',
      new_content: '主人的项目使用 PostgreSQL 16 + pgvector 扩展',
    }, llm);

    expect(result.conflict_type).toBe('refinement');
  });
});

// ── TC-B1-04: LLM 失败降级为 potential ──────────────────────────────────
describe('TC-B1-04: fallback to potential on LLM failure', () => {
  it('should handle markdown code block wrapping from LLM', async () => {
    const llm = makeMockLLM('```json\n' + JSON.stringify({
      conflict_type: 'supersede',
      confidence: 0.9,
      reasoning: 'LLM wrapped response in code block.',
    }) + '\n```');

    const result = await classifyConflict(baseInput, llm);
    expect(result.conflict_type).toBe('supersede');
  });

  it('should return potential when LLM throws', async () => {
    const llm: LLMClient = {
      complete: vi.fn().mockRejectedValue(new Error('API timeout')),
    };

    const result = await classifyConflict(baseInput, llm);

    expect(result.conflict_type).toBe('potential');
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toContain('Classification failed');
  });

  it('should return potential when LLM returns invalid JSON', async () => {
    const llm = makeMockLLM('This is not JSON at all');

    const result = await classifyConflict(baseInput, llm);
    expect(result.conflict_type).toBe('potential');
  });

  it('should return potential when LLM returns unknown conflict_type', async () => {
    const llm = makeMockLLM(JSON.stringify({
      conflict_type: 'unknown_type',
      confidence: 0.9,
      reasoning: 'something',
    }));

    const result = await classifyConflict(baseInput, llm);
    expect(result.conflict_type).toBe('potential');
  });
});

// ── TC-B1-05: confidence 边界值 ──────────────────────────────────────────
describe('TC-B1-05: confidence clamping', () => {
  it('should clamp confidence to [0, 1]', async () => {
    const llm = makeMockLLM(JSON.stringify({
      conflict_type: 'supersede',
      confidence: 1.5,   // 超过 1
      reasoning: 'test',
    }));

    const result = await classifyConflict(baseInput, llm);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it('should handle missing confidence field', async () => {
    const llm = makeMockLLM(JSON.stringify({
      conflict_type: 'refinement',
      // confidence 缺失
      reasoning: 'test',
    }));

    const result = await classifyConflict(baseInput, llm);
    expect(result.conflict_type).toBe('refinement');
    expect(result.confidence).toBe(0.5);   // 默认值
  });
});

// ── TC-B1-06: LLM Client Factory ────────────────────────────────────────
describe('TC-B1-06: LLM client factory', () => {
  it('should throw when OPENAI_API_KEY is missing for openai provider', () => {
    const orig = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.UNIMEMORY_LLM_PROVIDER;
    _resetLLMClientForTest();

    expect(() => createLLMClient()).toThrow('OPENAI_API_KEY');

    process.env.OPENAI_API_KEY = orig;
    _resetLLMClientForTest();
  });

  it('should throw when UNIMEMORY_LLM_BASE_URL missing for compatible provider', () => {
    const orig = process.env.UNIMEMORY_LLM_PROVIDER;
    process.env.UNIMEMORY_LLM_PROVIDER = 'compatible';
    delete process.env.UNIMEMORY_LLM_BASE_URL;
    _resetLLMClientForTest();

    expect(() => createLLMClient()).toThrow('UNIMEMORY_LLM_BASE_URL');

    process.env.UNIMEMORY_LLM_PROVIDER = orig;
    _resetLLMClientForTest();
  });
});
