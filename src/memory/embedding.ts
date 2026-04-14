import OpenAI from 'openai';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

// 懒初始化：调用时才检查 key，避免 import 阶段 crash
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        'OPENAI_API_KEY is not set. ' +
        'Add it to .env or pass via environment variable.'
      );
    }
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL,  // 支持自定义 endpoint（如 copilot-gateway）
    });
  }
  return _openai;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: [text],  // copilot-gateway 要求数组格式
    encoding_format: 'float',  // copilot-gateway 不支持 base64（SDK 默认）
  });
  return response.data[0].embedding;
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
