/**
 * LLM Client Implementations
 * 支持 OpenAI / compatible endpoint（同样用 Strategy Pattern）
 *
 * 环境变量（复用 embedding 配置）：
 *   UNIMEMORY_LLM_PROVIDER=openai|compatible   (默认 openai)
 *   OPENAI_API_KEY
 *   UNIMEMORY_LLM_BASE_URL   (compatible provider)
 *   UNIMEMORY_LLM_API_KEY    (compatible provider)
 *   UNIMEMORY_LLM_MODEL      (默认 gpt-4o-mini，成本低)
 */

import { LLMClient } from './classifier';

export class OpenAILLMClient implements LLMClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.model = options?.model ?? process.env.UNIMEMORY_LLM_MODEL ?? 'gpt-4o-mini';
    this.baseUrl = (options?.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is required for OpenAILLMClient');
    }
  }

  async complete(prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,       // 分类任务要确定性，不要随机性
        max_tokens: 150,      // JSON 响应很短
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LLM API ${res.status}: ${body}`);
    }

    const data = await res.json() as {
      choices: { message: { content: string } }[];
    };
    return data.choices[0].message.content;
  }
}

/**
 * Compatible LLM Client（兼容 OpenAI chat completions 格式）
 * 支持 copilot-gateway、Azure OpenAI、LocalAI 等
 */
export class CompatibleLLMClient extends OpenAILLMClient {
  constructor() {
    const baseUrl = process.env.UNIMEMORY_LLM_BASE_URL;
    if (!baseUrl) {
      throw new Error('UNIMEMORY_LLM_BASE_URL is required for compatible LLM provider');
    }
    super({
      baseUrl,
      apiKey: process.env.UNIMEMORY_LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? '',
      model: process.env.UNIMEMORY_LLM_MODEL ?? 'gpt-4o-mini',
    });
  }
}

/**
 * Factory：根据环境变量创建 LLM client
 */
export function createLLMClient(): LLMClient {
  const provider = process.env.UNIMEMORY_LLM_PROVIDER ?? 'openai';
  switch (provider) {
    case 'openai':
      return new OpenAILLMClient();
    case 'compatible':
      return new CompatibleLLMClient();
    default:
      throw new Error(`Unknown LLM provider: "${provider}". Valid: openai, compatible`);
  }
}

let _llmClient: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!_llmClient) _llmClient = createLLMClient();
  return _llmClient;
}

/** 测试用：重置单例 */
export function _resetLLMClientForTest(): void {
  _llmClient = null;
}
