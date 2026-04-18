#!/usr/bin/env node
/**
 * LoCoMo Parallel Benchmark Runner
 * 
 * Tests UniMemory recall accuracy against the LoCoMo dataset.
 * Dataset: https://github.com/snap-research/LoCoMo
 * Paper: https://arxiv.org/abs/2402.17753 (ACL 2024)
 * 
 * Usage:
 *   npx ts-node benchmarks/locomo/run.ts [--sample N] [--top-k K] [--concurrency C] [--conversation-id ID]
 * 
 * Environment:
 *   DATABASE_URL, UNIMEMORY_EMBEDDING_PROVIDER, etc. (same as main app)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { writeMemory, searchMemories } from '../../src/memory/service';
import { getDb } from '../../src/db/connection';
import { WriteMemoryRequest } from '../../src/memory/types';
import * as fs from 'fs';

// ---- LLM Answer Helper (OPT-2) ----

/**
 * LLM semantic judge: does `generated` answer correctly answer the question given `expected`?
 * Returns true/false. Uses same retry/backoff as callLLMForAnswer.
 */
async function judgeAnswer(expected: string, generated: string, question: string): Promise<boolean> {
  const exp = expected.toLowerCase().trim();
  const gen = generated.toLowerCase().trim();
  // adversarial / unanswerable: expected empty or 'none' means question should be refused
  const UNANSWERABLE = ['none', '', 'n/a'];
  const REFUSAL = ['none', '', 'n/a', "i don't know", 'unknown', 'not mentioned', 'not specified'];
  if (UNANSWERABLE.includes(exp)) {
    return REFUSAL.some(r => r !== '' && gen.includes(r)) || gen === '';
  }

  const prompt = `You are an answer evaluation assistant. Decide if the generated answer correctly answers the question, given the expected answer as ground truth.

Question: ${question}
Expected answer: ${expected}
Generated answer: ${generated}

IMPORTANT: When the expected answer is "None" or empty, the question is unanswerable; if the generated answer also indicates inability to answer (None / N\/A / I don't know / unknown), treat as CORRECT.
Be lenient with paraphrasing and synonyms — if the meaning matches, it is correct.

First explain your reasoning step by step, then on the last line output exactly:
VERDICT: CORRECT
or
VERDICT: WRONG`;

  try {
    const raw = await callLLMForJudge(prompt);
    // Parse CoT response: take the last line with VERDICT:
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const verdictLine = [...lines].reverse().find(l => l.toUpperCase().startsWith('VERDICT:'));
    if (!verdictLine) throw new Error('No VERDICT line found');
    return verdictLine.toUpperCase().includes('CORRECT');
  } catch {
    // fallback to token overlap if judge fails
    const answerTokens = exp.split(/\s+/).filter(t => t.length > 2);
    if (answerTokens.length === 0) return false;
    const matchCount = answerTokens.filter(t => gen.includes(t)).length;
    return matchCount / answerTokens.length >= 0.5;
  }
}

/**
 * Call LLM for JSON judge response (with retry)
 */
async function callLLMForJudge(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY ?? '';
  const baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  // Judge model: gpt-5.4 for highest accuracy (JUDGE_MODEL override)
  const model = process.env.JUDGE_MODEL ?? 'gpt-5.4';

  const maxRetries = 5;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          max_completion_tokens: 300,
          // CoT: plain text response, not JSON mode
        }),
      });
      if (res.status === 429 || res.status === 499) {
        const retryAfter = res.headers.get('retry-after');
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(2000 * Math.pow(2, attempt), 30000);
        lastErr = new Error(`LLM judge ${res.status}`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      if (!res.ok) throw new Error(`LLM judge ${res.status}: ${await res.text()}`);
      const data = await res.json() as { choices: { message: { content: string } }[] };
      return data.choices[0].message.content.trim();
    } catch (err) {
      lastErr = err;
      const msg = (err as Error).message ?? '';
      if (!msg.includes('429') && !msg.includes('499')) throw err;
      await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(2, attempt), 30000)));
    }
  }
  throw lastErr;
}

/**
 * Call LLM for open-ended answer generation
 * Uses retry with exponential backoff for 429/499
 */
async function callLLMForAnswer(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY ?? '';
  const baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.UNIMEMORY_LLM_MODEL ?? 'gpt-4o-mini';

  const maxRetries = 5;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
          max_completion_tokens: 100,
        }),
      });

      if (res.status === 429 || res.status === 499) {
        const retryAfter = res.headers.get('retry-after');
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(2000 * Math.pow(2, attempt), 30000);
        lastErr = new Error(`LLM API ${res.status}`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`LLM API ${res.status}: ${body}`);
      }

      const data = await res.json() as { choices: { message: { content: string } }[] };
      return data.choices[0].message.content.trim();
    } catch (err) {
      lastErr = err;
      const msg = (err as Error).message ?? '';
      if (!msg.includes('429') && !msg.includes('499')) throw err;
      await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(2, attempt), 30000)));
    }
  }
  throw lastErr;
}

// ---- Types ----

interface LoCoMoTurn {
  speaker: string;   // "human" | "assistant"
  text: string;
  session_id: number;
  turn_id: number;
}

interface LoCoMoQA {
  question: string;
  answer: string;
  evidence_turn_ids: number[];
  category: 'single_hop' | 'multi_hop' | 'temporal' | 'open_domain' | 'adversarial';
}

interface LoCoMoConversation {
  conversation_id: string;
  turns: LoCoMoTurn[];
  qa_pairs: LoCoMoQA[];
}

interface BenchmarkResult {
  conversation_id: string;
  total_qa: number;
  correct: number;
  accuracy: number;
  f1_correct: number;
  f1_accuracy: number;
  by_category: Record<string, { total: number; correct: number; f1Correct: number; accuracy: number; f1Accuracy: number }>;
  avg_retrieval_ms: number;
}

// ---- Concurrency Utilities ----

/**
 * Run tasks with controlled concurrency
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: (T | null)[] = new Array(tasks.length).fill(null);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      try {
        results[i] = await tasks[i]();
      } catch (err) {
        console.error(`Task ${i} failed:`, (err as Error).message);
        results[i] = null;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results as T[];
}

// ---- Core Logic ----

/**
 * Ingest a conversation into UniMemory.
 */
async function ingestConversation(conv: LoCoMoConversation): Promise<void> {
  const sessions = new Map<number, LoCoMoTurn[]>();
  for (const turn of conv.turns) {
    if (!sessions.has(turn.session_id)) sessions.set(turn.session_id, []);
    sessions.get(turn.session_id)!.push(turn);
  }

  for (const [sessionId, turns] of sessions) {
    for (const turn of turns) {
      if (!turn.text || turn.text.trim().length < 10) continue;

      const req: WriteMemoryRequest = {
        content: `[Session ${sessionId}, ${turn.speaker}]: ${turn.text}`,
        agent_id: `locomo-${conv.conversation_id}`,
        scope: 'project',
        project_id: `locomo-${conv.conversation_id}`,
        memory_type: 'context',
        source_type: 'confirmed',
        confidence: 0.9,
        importance_score: 0.5,
        entity_tags: [`session:${sessionId}`, `speaker:${turn.speaker}`],
        source_context: `LoCoMo turn ${turn.turn_id}`,
        skipConflictCheck: true,
      };

      await writeMemory(req);
    }
  }
}

/**
 * Evaluate a single QA pair with configurable top-k
 */
/** Search event index directly by agent_id (bypasses scope filter) */
async function searchEventMemories(
  query: string,
  agentId: string,
  topK: number = 5,
  minSimilarity: number = 0.5
): Promise<{ content: string }[]> {
  const { generateEmbedding } = await import('../../src/memory/embedding/index');
  const db = await getDb();
  const emb = await generateEmbedding(query);
  const result = await db.query(
    `SELECT content, 1 - (embedding <=> $1::vector) AS sim
     FROM memories
     WHERE agent_id = $2
       AND status = 'active'
       AND archived_at IS NULL
       AND 1 - (embedding <=> $1::vector) > $3
     ORDER BY sim DESC
     LIMIT $4`,
    [JSON.stringify(emb), agentId, minSimilarity, topK]
  );
  return result.rows;
}

async function evaluateQA(
  qa: LoCoMoQA,
  conversationId: string,
  topK: number = 5,
  useLLM: boolean = false,
  useEvents: boolean = true
): Promise<{ correct: boolean; f1Correct: boolean; retrievalMs: number }> {
  const start = Date.now();

  let results: Awaited<ReturnType<typeof searchMemories>>;
  let eventMemories: { content: string }[] = [];
  try {
    // Parallel retrieval: chunks + event index (skip events if useEvents=false)
    const eventPromise = useEvents
      ? searchEventMemories(qa.question, `locomo-events-${conversationId}`, 5, 0.5).catch(() => [])
      : Promise.resolve([]);
    [results, eventMemories] = await Promise.all([
      searchMemories({
        query: qa.question,
        agent_id: `locomo-${conversationId}`,
        scope_filter: ['project'],
        project_id: `locomo-${conversationId}`,
        top_k: topK,
        min_similarity: 0.5,
      }),
      eventPromise,
    ]);
  } catch (err) {
    console.warn(`    [evaluateQA] searchMemories failed: ${(err as Error).message}`);
    return { correct: false, f1Correct: false, retrievalMs: Date.now() - start };
  }

  const retrievalMs = Date.now() - start;

  // F1 token-overlap (always computed as sanity check / mem0 standard)
  const answerTokens = String(qa.answer ?? '').toLowerCase().split(/\s+/).filter(t => t.length > 3);
  const f1Correct = answerTokens.length > 0 && results.memories.some(mem => {
    const content = mem.content.toLowerCase();
    const matchCount = answerTokens.filter(t => content.includes(t)).length;
    return matchCount / answerTokens.length >= 0.5;
  });

  if (useLLM && results.memories.length > 0) {
    // OPT-3: LLM 回答层 + event index (events first for temporal anchoring)
    try {
      const eventContext = eventMemories.length
        ? `[Events with timestamps - reference for time-related questions]\n` +
          eventMemories.map((m, i) => `[E${i + 1}] ${m.content}`).join('\n')
        : '';
      const chunkContext = results.memories
        .map((m, i) => `[${i + 1}] ${m.content}`)
        .join('\n');
      const context = eventContext
        ? `${eventContext}\n\n[Conversation excerpts]\n${chunkContext}`
        : chunkContext;
      const prompt = `You are a question answering assistant. Based on the following context from a conversation history, answer the question concisely.\n\nContext:\n${context}\n\nQuestion: ${qa.question}\n\nIf the answer cannot be determined from the context, respond with "None".\nRespond with ONLY the answer (a few words), no explanation.`;

      const llmAnswer = await callLLMForAnswer(prompt);
      // Use semantic judge (CoT v3) as main metric
      const correct = await judgeAnswer(String(qa.answer ?? ''), llmAnswer, qa.question);
      return { correct, f1Correct, retrievalMs };
    } catch (err) {
      console.warn(`    [evaluateQA] LLM answer failed: ${(err as Error).message}, falling back to token match`);
    }
  }

  // Baseline: use F1 token match as main metric
  return { correct: f1Correct, f1Correct, retrievalMs };
}

/**
 * Evaluate all QA pairs for a conversation in parallel
 */
async function evaluateConversationQAs(
  conv: LoCoMoConversation,
  topK: number,
  qaParallelism: number,
  useLLM: boolean = false,
  useEvents: boolean = true
): Promise<{
  correct: number;
  f1Correct: number;
  totalMs: number;
  byCategory: Record<string, { total: number; correct: number; f1Correct: number; accuracy: number; f1Accuracy: number }>;
}> {
  const byCategory: Record<string, { total: number; correct: number; f1Correct: number; accuracy: number; f1Accuracy: number }> = {};
  let correct = 0;
  let f1Correct = 0;
  let totalMs = 0;

  const tasks = conv.qa_pairs.map((qa) => async () => {
    const { correct: isCorrect, f1Correct: isF1Correct, retrievalMs } = await evaluateQA(qa, conv.conversation_id, topK, useLLM, useEvents);
    return { isCorrect, isF1Correct, retrievalMs, category: qa.category };
  });

  const evalResults = await runWithConcurrency(tasks, qaParallelism);

  for (const result of evalResults) {
    if (!result) continue;
    if (result.isCorrect) correct++;
    if (result.isF1Correct) f1Correct++;
    totalMs += result.retrievalMs;

    if (!byCategory[result.category]) {
      byCategory[result.category] = { total: 0, correct: 0, f1Correct: 0, accuracy: 0, f1Accuracy: 0 };
    }
    byCategory[result.category].total++;
    if (result.isCorrect) byCategory[result.category].correct++;
    if (result.isF1Correct) byCategory[result.category].f1Correct++;
  }

  for (const cat of Object.values(byCategory)) {
    cat.accuracy = cat.total > 0 ? cat.correct / cat.total : 0;
    cat.f1Accuracy = cat.total > 0 ? cat.f1Correct / cat.total : 0;
  }

  return { correct, f1Correct, totalMs, byCategory };
}

/**
 * Ingest multiple conversations in parallel
 */
async function ingestConversationsParallel(
  conversations: LoCoMoConversation[],
  concurrency: number
): Promise<void> {
  const tasks = conversations.map((conv) => async () => {
    try {
      await ingestConversation(conv);
    } catch (err) {
      console.error(`  Ingestion failed for ${conv.conversation_id}:`, err);
    }
  });

  await runWithConcurrency(tasks, concurrency);
}

// ---- Runner ----

async function runBenchmark(options: {
  dataPath: string;
  sampleSize?: number;
  topK?: number;
  concurrency?: number;
  conversationId?: string;
  useLLM?: boolean;
  useEvents?: boolean;
}): Promise<BenchmarkResult[]> {
  const { dataPath, sampleSize, topK = 5, concurrency = 3, conversationId, useLLM = false, useEvents = true } = options;

  const rawData: any[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  let conversations: LoCoMoConversation[] = rawData.map((sample: any) => {
    const turns: LoCoMoTurn[] = [];
    let turnId = 0;
    let sessionId = 1;
    while (sample.conversation[`session_${sessionId}`]) {
      const session = sample.conversation[`session_${sessionId}`];
      if (Array.isArray(session)) {
        for (const msg of session) {
          turns.push({
            speaker: msg.speaker ?? (turnId % 2 === 0 ? 'human' : 'assistant'),
            text: msg.text ?? String(msg),
            session_id: sessionId,
            turn_id: turnId++,
          });
        }
      }
      sessionId++;
    }

    const qa_pairs: LoCoMoQA[] = (sample.qa ?? []).map((q: any) => ({
      question: String(q.question ?? ''),
      answer: String(q.answer ?? ''),
      evidence_turn_ids: [],
      category: (['single_hop', 'multi_hop', 'temporal', 'open_domain', 'adversarial'][q.category - 1] ?? 'adversarial') as LoCoMoQA['category'],
    }));

    return {
      conversation_id: sample.sample_id ?? sample.conversation_id ?? 'unknown',
      turns,
      qa_pairs,
    };
  });

  if (conversationId) {
    conversations = conversations.filter(c => c.conversation_id === conversationId);
  }

  if (sampleSize) {
    conversations = conversations.slice(0, sampleSize);
  }

  console.log(`\n[Benchmark] Ingesting ${conversations.length} conversations with concurrency=${concurrency}...`);
  
  // Parallel ingestion
  for (let i = 0; i < conversations.length; i += concurrency) {
    const batch = conversations.slice(i, i + concurrency);
    for (const conv of batch) {
      console.log(`  Ingesting ${conv.conversation_id} (${conv.turns.length} turns)...`);
    }
    await ingestConversationsParallel(batch, concurrency);
    for (const conv of batch) {
      console.log(`    ✓ ${conv.conversation_id} ingested`);
    }
  }

  console.log(`\n[Benchmark] Evaluating QAs with top_k=${topK}${useLLM ? ' + LLM answer layer' : ''}...`);

  const results: BenchmarkResult[] = [];

  for (const conv of conversations) {
    const { correct, f1Correct, totalMs, byCategory } = await evaluateConversationQAs(conv, topK, 2, useLLM, useEvents);

    const result: BenchmarkResult = {
      conversation_id: conv.conversation_id,
      total_qa: conv.qa_pairs.length,
      correct,
      accuracy: conv.qa_pairs.length > 0 ? correct / conv.qa_pairs.length : 0,
      f1_correct: f1Correct,
      f1_accuracy: conv.qa_pairs.length > 0 ? f1Correct / conv.qa_pairs.length : 0,
      by_category: byCategory,
      avg_retrieval_ms: conv.qa_pairs.length > 0 ? totalMs / conv.qa_pairs.length : 0,
    };

    results.push(result);
    console.log(`  ${conv.conversation_id}: judge=${(result.accuracy * 100).toFixed(1)}% f1=${(result.f1_accuracy * 100).toFixed(1)}% (${correct}/${conv.qa_pairs.length})`);
  }

  return results;
}

function printSummary(results: BenchmarkResult[], topK: number): void {
  console.log('\n' + '='.repeat(70));
  console.log(`LoCoMo Benchmark Results — UniMemory (top_k=${topK})`);
  console.log('='.repeat(70));

  const totalQA = results.reduce((s, r) => s + r.total_qa, 0);
  const totalCorrect = results.reduce((s, r) => s + r.correct, 0);
  const overallAccuracy = totalQA > 0 ? totalCorrect / totalQA : 0;
  const avgMs = results.reduce((s, r) => s + r.avg_retrieval_ms, 0) / results.length;

  console.log(`\nOverall Accuracy : ${(overallAccuracy * 100).toFixed(1)}% (${totalCorrect}/${totalQA})`);
  console.log(`Avg Retrieval    : ${avgMs.toFixed(0)}ms`);

  console.log('\nPer-conversation breakdown:');
  for (const r of results) {
    const pct = (r.accuracy * 100).toFixed(1);
    console.log(`  ${r.conversation_id.padEnd(20)} ${pct}% (${r.correct}/${r.total_qa})`);
  }

  const allCategories = new Set(results.flatMap(r => Object.keys(r.by_category)));
  if (allCategories.size > 0) {
    console.log('\nBy category:');
    for (const cat of allCategories) {
      const catTotal = results.reduce((s, r) => s + (r.by_category[cat]?.total ?? 0), 0);
      const catCorrect = results.reduce((s, r) => s + (r.by_category[cat]?.correct ?? 0), 0);
      const catAcc = catTotal > 0 ? (catCorrect / catTotal * 100).toFixed(1) : 'N/A';
      console.log(`  ${cat.padEnd(20)} ${catAcc}% (${catCorrect}/${catTotal})`);
    }
  }

  console.log('\n' + '='.repeat(70));
}

// ---- Entry point ----

async function main() {
  const args = process.argv.slice(2);
  const sampleArg = args.find(a => a.startsWith('--sample='));
  const topKArg = args.find(a => a.startsWith('--top-k='));
  const concArg = args.find(a => a.startsWith('--concurrency='));
  const convArg = args.find(a => a.startsWith('--conversation-id='));

  const dataPath = path.join(__dirname, 'data', 'locomo.json');

  if (!fs.existsSync(dataPath)) {
    console.error(`\n❌ LoCoMo data not found at: ${dataPath}`);
    console.error('Download with: npm run benchmark:locomo:download');
    process.exit(1);
  }

  const topK = topKArg ? parseInt(topKArg.split('=')[1]) : 5;
  const concurrency = concArg ? parseInt(concArg.split('=')[1]) : 3;

  const useLLM = args.includes('--llm');
  const useEvents = !args.includes('--no-events');

  const results = await runBenchmark({
    dataPath,
    sampleSize: sampleArg ? parseInt(sampleArg.split('=')[1]) : undefined,
    topK,
    concurrency,
    conversationId: convArg ? convArg.split('=')[1] : undefined,
    useLLM,
    useEvents,
  });

  printSummary(results, topK);

  const suffix = useLLM ? (useEvents ? `llm-events-topk${topK}` : `llm-topk${topK}`) : `parallel-topk${topK}`;
  const outPath = path.join(__dirname, 'results', `${suffix}-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ results, topK, useLLM, timestamp: new Date().toISOString() }, null, 2));
  console.log(`Results saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
