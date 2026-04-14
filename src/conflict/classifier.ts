/**
 * Conflict Classifier (B1)
 * 使用 LLM 对检测到的冲突进行三分类：
 *
 *   supersede     — 新记忆取代旧记忆（信息更新，原内容过时）
 *                   例："主人用 Mac" → "主人换了 Windows"
 *
 *   contradiction — 两条记忆直接矛盾，无法共存（需要人工裁决）
 *                   例："主人喜欢喝茶" vs "主人不喝茶"
 *
 *   refinement    — 新记忆是旧记忆的补充/细化（两者都有价值）
 *                   例："主人用 PostgreSQL" → "主人用 PostgreSQL 16 + pgvector"
 *
 * P0 只检测（conflict_type = 'potential'），B1 在此基础上细分。
 * 分类结果写入 memories.conflict_type 字段。
 */

import { getEmbeddingProvider } from '../memory/embedding';

export type ConflictType = 'supersede' | 'contradiction' | 'refinement' | 'potential';

export interface ClassifyConflictInput {
  existing_content: string;
  new_content: string;
  memory_type: string;  // preference / decision / fact / context / temp
  similarity: number;   // 向量相似度，供 LLM 参考
}

export interface ClassifyConflictResult {
  conflict_type: ConflictType;
  confidence: number;    // 分类置信度 0-1
  reasoning: string;     // LLM 的简短推理（方便调试/审计）
}

// LLM 分类 prompt 模板
const CLASSIFY_PROMPT = (input: ClassifyConflictInput) => `You are a memory conflict classifier for an AI memory system.

Given two memory entries that are semantically similar (cosine similarity: ${input.similarity.toFixed(2)}), classify their relationship.

Memory type: ${input.memory_type}

EXISTING memory:
"${input.existing_content}"

NEW memory:
"${input.new_content}"

Classify the conflict as exactly one of:
- supersede: The new memory replaces/updates the existing one (existing is outdated)
- contradiction: Both cannot be true simultaneously, needs human resolution
- refinement: New memory adds detail/nuance to existing (both are valid and complementary)

Respond in JSON format only:
{
  "conflict_type": "supersede" | "contradiction" | "refinement",
  "confidence": 0.0-1.0,
  "reasoning": "one sentence explanation"
}`;

/**
 * 使用 LLM 对单个冲突对进行分类
 * 失败时降级为 'potential'（保守策略，不丢失冲突信息）
 */
export async function classifyConflict(
  input: ClassifyConflictInput,
  llmClient: LLMClient
): Promise<ClassifyConflictResult> {
  try {
    const response = await llmClient.complete(CLASSIFY_PROMPT(input));
    const cleaned = response.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(cleaned);

    const validTypes = ['supersede', 'contradiction', 'refinement'];
    if (!validTypes.includes(parsed.conflict_type)) {
      throw new Error(`Invalid conflict_type: ${parsed.conflict_type}`);
    }

    return {
      conflict_type: parsed.conflict_type as ConflictType,
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      reasoning: String(parsed.reasoning || ''),
    };
  } catch (err) {
    // 降级：LLM 失败不影响写入，保留 potential
    console.error('[ConflictClassifier] LLM classification failed, falling back to potential:', err);
    return {
      conflict_type: 'potential',
      confidence: 0,
      reasoning: `Classification failed: ${(err as Error).message}`,
    };
  }
}

/**
 * LLM Client 接口（Strategy Pattern，与 embedding provider 保持一致）
 * 允许注入不同的 LLM 实现（OpenAI、Anthropic、copilot-gateway 等）
 */
export interface LLMClient {
  complete(prompt: string): Promise<string>;
}
