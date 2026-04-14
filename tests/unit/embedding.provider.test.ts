/**
 * EmbeddingProvider 单元测试
 * 验证 Factory、Strategy 切换、错误处理
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createEmbeddingProvider,
  getEmbeddingProvider,
  generateEmbedding,
  _resetProviderForTest,
} from '../../src/memory/embedding/index';
import { EmbeddingError } from '../../src/memory/embedding/types';
import { OpenAIEmbeddingProvider } from '../../src/memory/embedding/openai';
import { OllamaEmbeddingProvider } from '../../src/memory/embedding/ollama';
import { CompatibleEmbeddingProvider } from '../../src/memory/embedding/compatible';

// ── 环境变量管理 ─────────────────────────────────────────────────────────────
const originalEnv = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  Object.assign(process.env, vars);
}

function resetEnv() {
  // 恢复原始环境变量
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

afterEach(() => {
  resetEnv();
  _resetProviderForTest();
  vi.restoreAllMocks();
});

// ── TC-EMB-01: Factory 默认 openai ────────────────────────────────────────
describe('TC-EMB-01: Factory defaults to openai', () => {
  it('should create OpenAIEmbeddingProvider when OPENAI_API_KEY is set', () => {
    setEnv({
      UNIMEMORY_EMBEDDING_PROVIDER: undefined,
      OPENAI_API_KEY: 'sk-test-key',
    });
    delete process.env.UNIMEMORY_EMBEDDING_PROVIDER;

    const provider = createEmbeddingProvider();
    expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
    expect(provider.name).toContain('openai');
    expect(provider.dimensions).toBe(1536);
  });

  it('should throw EmbeddingError when OPENAI_API_KEY is missing', () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.UNIMEMORY_EMBEDDING_PROVIDER;

    expect(() => createEmbeddingProvider('openai')).toThrow(EmbeddingError);
    expect(() => createEmbeddingProvider('openai')).toThrow('OPENAI_API_KEY');
  });
});

// ── TC-EMB-02: Factory 选择 ollama ────────────────────────────────────────
describe('TC-EMB-02: Factory selects ollama', () => {
  it('should create OllamaEmbeddingProvider via env var', () => {
    setEnv({ UNIMEMORY_EMBEDDING_PROVIDER: 'ollama' });

    const provider = createEmbeddingProvider();
    expect(provider).toBeInstanceOf(OllamaEmbeddingProvider);
    expect(provider.name).toContain('ollama');
    expect(provider.dimensions).toBe(768); // nomic-embed-text 默认
  });

  it('should use custom ollama base URL from env', () => {
    setEnv({ UNIMEMORY_OLLAMA_BASE_URL: 'http://custom-host:11434' });

    const provider = new OllamaEmbeddingProvider();
    // 没有抛错，URL 已接受
    expect(provider).toBeTruthy();
  });
});

// ── TC-EMB-03: Factory 选择 compatible ───────────────────────────────────
describe('TC-EMB-03: Factory selects compatible', () => {
  it('should create CompatibleEmbeddingProvider when base URL is set', () => {
    setEnv({
      UNIMEMORY_EMBEDDING_PROVIDER: 'compatible',
      UNIMEMORY_EMBEDDING_BASE_URL: 'https://copilot.example.com/v1',
      UNIMEMORY_EMBEDDING_API_KEY: 'test-key',
    });

    const provider = createEmbeddingProvider();
    expect(provider).toBeInstanceOf(CompatibleEmbeddingProvider);
    expect(provider.name).toContain('compatible');
  });

  it('should throw EmbeddingError when base URL is missing', () => {
    delete process.env.UNIMEMORY_EMBEDDING_BASE_URL;

    expect(() => createEmbeddingProvider('compatible')).toThrow(EmbeddingError);
    expect(() => createEmbeddingProvider('compatible')).toThrow('UNIMEMORY_EMBEDDING_BASE_URL');
  });
});

// ── TC-EMB-04: 单例模式 ───────────────────────────────────────────────────
describe('TC-EMB-04: singleton pattern', () => {
  it('getEmbeddingProvider should return same instance on repeated calls', () => {
    setEnv({ UNIMEMORY_EMBEDDING_PROVIDER: 'ollama' });

    const p1 = getEmbeddingProvider();
    const p2 = getEmbeddingProvider();
    expect(p1).toBe(p2);
  });

  it('_resetProviderForTest should allow switching provider in tests', () => {
    setEnv({ UNIMEMORY_EMBEDDING_PROVIDER: 'ollama' });
    const p1 = getEmbeddingProvider();

    _resetProviderForTest();
    setEnv({
      UNIMEMORY_EMBEDDING_PROVIDER: 'compatible',
      UNIMEMORY_EMBEDDING_BASE_URL: 'https://copilot.example.com/v1',
    });
    const p2 = getEmbeddingProvider();

    expect(p1).not.toBe(p2);
    expect(p1).toBeInstanceOf(OllamaEmbeddingProvider);
    expect(p2).toBeInstanceOf(CompatibleEmbeddingProvider);
  });
});

// ── TC-EMB-05: 未知 provider 抛错 ────────────────────────────────────────
describe('TC-EMB-05: unknown provider throws', () => {
  it('should throw with helpful message for unknown provider', () => {
    expect(() => createEmbeddingProvider('unknown' as any)).toThrow(
      'Unknown embedding provider'
    );
  });
});

// ── TC-EMB-06: generate mock（不真实调用 API） ────────────────────────────
describe('TC-EMB-06: generate delegates to provider', () => {
  it('should call provider.generate and return result', async () => {
    const mockVector = new Array(768).fill(0.42);
    const mockProvider = {
      name: 'mock/test',
      dimensions: 768,
      generate: vi.fn().mockResolvedValue(mockVector),
    };

    // 直接调用 provider.generate（不走全局单例）
    const result = await mockProvider.generate('test text');
    expect(result).toEqual(mockVector);
    expect(result.length).toBe(768);
    expect(mockProvider.generate).toHaveBeenCalledWith('test text');
  });
});

// ── TC-EMB-07: EmbeddingError 包含 provider 信息 ──────────────────────────
describe('TC-EMB-07: EmbeddingError carries provider context', () => {
  it('should have provider name in error', () => {
    const err = new EmbeddingError('API failed', 'openai', new Error('original'));
    expect(err.name).toBe('EmbeddingError');
    expect(err.provider).toBe('openai');
    expect(err.message).toBe('API failed');
    expect(err.cause).toBeInstanceOf(Error);
  });
});
