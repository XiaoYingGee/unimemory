import { EmbeddingProvider, EmbeddingError } from './types';

/**
 * Compatible Embedding Provider
 * 兼容 OpenAI REST 格式的任意 endpoint（copilot-gateway、Azure OpenAI、LocalAI 等）
 * 不依赖 openai SDK，直接用 fetch，避免 SDK 的 User-Agent 被 WAF 拦截。
 */
export class CompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options?: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    dimensions?: number;
  }) {
    this.baseUrl = (
      options?.baseUrl ??
      process.env.UNIMEMORY_EMBEDDING_BASE_URL ??
      ''
    ).replace(/\/$/, '');

    if (!this.baseUrl) {
      throw new EmbeddingError(
        'UNIMEMORY_EMBEDDING_BASE_URL is required for compatible provider.',
        'compatible'
      );
    }

    this.apiKey = options?.apiKey ?? process.env.UNIMEMORY_EMBEDDING_API_KEY ?? '';
    this.model = options?.model ?? process.env.UNIMEMORY_EMBEDDING_MODEL ?? 'text-embedding-3-small';
    this.dimensions = options?.dimensions ?? (Number(process.env.UNIMEMORY_EMBEDDING_DIMENSIONS) || 1536);
    this.name = `compatible/${this.model}`;
  }

  async generate(text: string): Promise<number[]> {
    const url = `${this.baseUrl}/embeddings`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          input: [text],
          encoding_format: 'float',
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new EmbeddingError(
          `Compatible provider HTTP ${res.status}: ${body}`,
          'compatible'
        );
      }

      const data = await res.json() as { data: { embedding: number[] }[] };
      return data.data[0].embedding;
    } catch (err) {
      if (err instanceof EmbeddingError) throw err;
      throw new EmbeddingError(
        `Compatible provider request failed: ${(err as Error).message}`,
        'compatible',
        err
      );
    }
  }
}
