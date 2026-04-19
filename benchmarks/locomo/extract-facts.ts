/**
 * OPT-6: mem0 ADD-only fact extraction
 * Extracts structured facts from raw conversation content using LLM
 */

import OpenAI from 'openai';

const EXTRACT_FACTS_PROMPT = `From the following conversation excerpt, extract key facts as a JSON array.
Each fact must be:
- A standalone, concise statement (one sentence, ≤ 80 chars)
- About a specific person, event, preference, or relationship
- Factual, not interpretive
- Written in third-person (e.g., "Sarah works as a software engineer.")

Conversation:
{content}

Output ONLY a JSON array of strings. Example:
["Sarah works as a software engineer.","Jake enjoys rock climbing on weekends."]

If no clear facts can be extracted, return: []`;

export async function extractFacts(
  content: string,
  llm: OpenAI,
  model: string = process.env.UNIMEMORY_EXTRACTION_MODEL ?? 'gpt-4o-mini'
): Promise<string[]> {
  try {
    const resp = await llm.chat.completions.create({
      model,
      messages: [{ role: 'user', content: EXTRACT_FACTS_PROMPT.replace('{content}', content) }],
      max_completion_tokens: 500,
      temperature: 0,
    });
    const raw = resp.choices[0].message.content?.trim() ?? '[]';
    // Strip markdown code blocks if present
    const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
    const facts = JSON.parse(cleaned);
    return Array.isArray(facts)
      ? facts.filter((f: unknown) => typeof f === 'string' && f.length > 0 && f.length <= 200)
      : [];
  } catch {
    // Graceful degradation: return empty, caller will fall back to raw content
    return [];
  }
}
