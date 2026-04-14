/**
 * EmbeddingProvider — Strategy Pattern
 *
 * 所有 embedding 实现都必须满足这个接口。
 * 切换 provider 只需修改环境变量，不改业务代码。
 *
 * 环境变量：
 *   UNIMEMORY_EMBEDDING_PROVIDER=openai|ollama|compatible   (默认 openai)
 *
 * compatible provider 额外配置：
 *   UNIMEMORY_EMBEDDING_BASE_URL=https://copilot.example.com/v1
 *   UNIMEMORY_EMBEDDING_API_KEY=xxx
 *   UNIMEMORY_EMBEDDING_MODEL=text-embedding-3-small
 *   UNIMEMORY_EMBEDDING_DIMENSIONS=1536
 *
 * ollama provider 额外配置：
 *   UNIMEMORY_OLLAMA_BASE_URL=http://localhost:11434   (默认)
 *   UNIMEMORY_EMBEDDING_MODEL=nomic-embed-text         (默认)
 *   UNIMEMORY_EMBEDDING_DIMENSIONS=768                 (nomic 默认)
 */

export interface EmbeddingProvider {
  /** Provider 标识符，写入 memories.embedding_model 字段 */
  readonly name: string;

  /** 向量维度，必须和数据库 Schema 里的 vector(N) 一致 */
  readonly dimensions: number;

  /**
   * 生成文本 embedding
   * @param text 输入文本（建议 < 8192 tokens）
   * @returns 长度为 dimensions 的浮点数组
   * @throws EmbeddingError — API 失败、超时、key 缺失等情况
   */
  generate(text: string): Promise<number[]>;
}

/**
 * 可区分错误来源的 Error 子类
 */
export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}
