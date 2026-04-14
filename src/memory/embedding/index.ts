/**
 * Embedding Provider Factory
 *
 * 根据环境变量 UNIMEMORY_EMBEDDING_PROVIDER 选择实现。
 * 默认使用 openai。
 *
 * 使用示例：
 *   import { getEmbeddingProvider, generateEmbedding } from './embedding';
 *
 *   // 直接用全局单例（推荐）
 *   const embedding = await generateEmbedding('some text');
 *
 *   // 或手动创建指定 provider
 *   const provider = createEmbeddingProvider('ollama');
 */

import { EmbeddingProvider } from './types';
import { OpenAIEmbeddingProvider } from './openai';
import { OllamaEmbeddingProvider } from './ollama';
import { CompatibleEmbeddingProvider } from './compatible';

export type ProviderKind = 'openai' | 'ollama' | 'compatible';

export { EmbeddingProvider, EmbeddingError } from './types';
export { OpenAIEmbeddingProvider } from './openai';
export { OllamaEmbeddingProvider } from './ollama';
export { CompatibleEmbeddingProvider } from './compatible';

/**
 * Factory 函数：创建指定 provider 实例
 */
export function createEmbeddingProvider(kind?: ProviderKind): EmbeddingProvider {
  const providerKind = kind ?? (process.env.UNIMEMORY_EMBEDDING_PROVIDER as ProviderKind) ?? 'openai';

  switch (providerKind) {
    case 'openai':
      return new OpenAIEmbeddingProvider();
    case 'ollama':
      return new OllamaEmbeddingProvider();
    case 'compatible':
      return new CompatibleEmbeddingProvider();
    default:
      throw new Error(
        `Unknown embedding provider: "${providerKind}". ` +
        'Valid options: openai, ollama, compatible'
      );
  }
}

// 全局单例（懒初始化，第一次调用时创建）
let _provider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!_provider) {
    _provider = createEmbeddingProvider();
  }
  return _provider;
}

/** 方便直接调用，不用管 provider 细节 */
export async function generateEmbedding(text: string): Promise<number[]> {
  return getEmbeddingProvider().generate(text);
}

/** embedding_model 字段值，写入 DB */
export function getEmbeddingModelName(): string {
  return getEmbeddingProvider().name;
}

/** 当前 provider 的向量维度 */
export function getEmbeddingDimensions(): number {
  return getEmbeddingProvider().dimensions;
}

/** 测试用：重置单例（方便单元测试切换 provider） */
export function _resetProviderForTest(): void {
  _provider = null;
}
