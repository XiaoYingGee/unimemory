import OpenAI from 'openai';
import { EmbeddingProvider, EmbeddingError } from './types';

/**
 * OpenAI Embedding Provider
 * 使用 text-embedding-3-small (1536维) 或可配置的其他模型
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options?: {
    apiKey?: string;
    model?: string;
    dimensions?: number;
  }) {
    const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new EmbeddingError(
        'OPENAI_API_KEY is not set. Provide it via env or constructor options.',
        'openai'
      );
    }

    this.model = options?.model ?? 'text-embedding-3-small';
    this.dimensions = options?.dimensions ?? 1536;
    this.name = `openai/${this.model}`;
    this.client = new OpenAI({ apiKey });
  }

  async generate(text: string): Promise<number[]> {
    const maxRetries = 5;
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.client.embeddings.create({
          model: this.model,
          input: [text],
          encoding_format: 'float',
          dimensions: this.dimensions,
        });
        return response.data[0].embedding;
      } catch (err) {
        lastErr = err;
        const msg = (err as Error).message ?? '';
        // 429 rate limit: exponential backoff
        if (msg.includes('429') || msg.includes('rate limit')) {
          const waitMs = Math.min(2000 * Math.pow(2, attempt), 30000);
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        // 其他错误直接抛
        break;
      }
    }
    throw new EmbeddingError(
      `OpenAI embedding failed: ${(lastErr as Error).message}`,
      'openai',
      lastErr
    );
  }
}
