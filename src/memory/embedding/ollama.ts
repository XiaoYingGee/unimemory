import { EmbeddingProvider, EmbeddingError } from './types';

/**
 * Ollama Embedding Provider
 * 本地运行，零 API key，完全离线。
 *
 * 推荐模型：
 *   nomic-embed-text  (768维，性价比高)
 *   mxbai-embed-large (1024维，精度更高)
 *
 * 启动 ollama：
 *   ollama pull nomic-embed-text
 *   ollama serve
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(options?: {
    baseUrl?: string;
    model?: string;
    dimensions?: number;
  }) {
    this.baseUrl = (
      options?.baseUrl ??
      process.env.UNIMEMORY_OLLAMA_BASE_URL ??
      'http://localhost:11434'
    ).replace(/\/$/, '');

    this.model = options?.model ?? process.env.UNIMEMORY_EMBEDDING_MODEL ?? 'nomic-embed-text';
    this.dimensions = options?.dimensions ?? (Number(process.env.UNIMEMORY_EMBEDDING_DIMENSIONS) || 768);
    this.name = `ollama/${this.model}`;
  }

  async generate(text: string): Promise<number[]> {
    const url = `${this.baseUrl}/api/embeddings`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new EmbeddingError(
          `Ollama HTTP ${res.status}: ${body}`,
          'ollama'
        );
      }

      const data = await res.json() as { embedding: number[] };

      if (!data.embedding || data.embedding.length === 0) {
        throw new EmbeddingError(
          `Ollama returned empty embedding for model "${this.model}". Is the model pulled?`,
          'ollama'
        );
      }

      return data.embedding;
    } catch (err) {
      if (err instanceof EmbeddingError) throw err;
      throw new EmbeddingError(
        `Ollama request failed: ${(err as Error).message}. Is ollama running at ${this.baseUrl}?`,
        'ollama',
        err
      );
    }
  }
}
