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
import { WriteMemoryRequest } from '../../src/memory/types';
import * as fs from 'fs';

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
  category: 'single_hop' | 'multi_hop' | 'temporal' | 'open_domain';
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
  by_category: Record<string, { total: number; correct: number; accuracy: number }>;
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
  const results: T[] = [];
  const executing: Promise<any>[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const promise = (async () => {
      try {
        results[i] = await task();
      } catch (err) {
        console.error(`Task ${i} failed:`, (err as Error).message);
        results[i] = null as any;
      }
    })();

    executing.push(promise);
    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(executing.indexOf(promise), 1);
    }
  }

  await Promise.all(executing);
  return results;
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
async function evaluateQA(
  qa: LoCoMoQA,
  conversationId: string,
  topK: number = 5
): Promise<{ correct: boolean; retrievalMs: number }> {
  const start = Date.now();

  let results: Awaited<ReturnType<typeof searchMemories>>;
  try {
    results = await searchMemories({
      query: qa.question,
      agent_id: `locomo-${conversationId}`,
      scope_filter: ['project'],
      project_id: `locomo-${conversationId}`,
      top_k: topK,
      min_similarity: 0.5,
    });
  } catch (err) {
    console.warn(`    [evaluateQA] searchMemories failed: ${(err as Error).message}`);
    return { correct: false, retrievalMs: Date.now() - start };
  }

  const retrievalMs = Date.now() - start;

  const answerTokens = String(qa.answer ?? '').toLowerCase().split(/\s+/).filter(t => t.length > 3);
  const correct = results.memories.some(mem => {
    const content = mem.content.toLowerCase();
    const matchCount = answerTokens.filter(t => content.includes(t)).length;
    return matchCount / answerTokens.length >= 0.5;
  });

  return { correct, retrievalMs };
}

/**
 * Evaluate all QA pairs for a conversation in parallel
 */
async function evaluateConversationQAs(
  conv: LoCoMoConversation,
  topK: number,
  qaParallelism: number
): Promise<{
  correct: number;
  totalMs: number;
  byCategory: Record<string, { total: number; correct: number; accuracy: number }>;
}> {
  const byCategory: Record<string, { total: number; correct: number; accuracy: number }> = {};
  let correct = 0;
  let totalMs = 0;

  const tasks = conv.qa_pairs.map((qa) => async () => {
    const { correct: isCorrect, retrievalMs } = await evaluateQA(qa, conv.conversation_id, topK);
    return { isCorrect, retrievalMs, category: qa.category };
  });

  const evalResults = await runWithConcurrency(tasks, qaParallelism);

  for (const result of evalResults) {
    if (!result) continue;
    if (result.isCorrect) correct++;
    totalMs += result.retrievalMs;

    if (!byCategory[result.category]) {
      byCategory[result.category] = { total: 0, correct: 0, accuracy: 0 };
    }
    byCategory[result.category].total++;
    if (result.isCorrect) byCategory[result.category].correct++;
  }

  for (const cat of Object.values(byCategory)) {
    cat.accuracy = cat.total > 0 ? cat.correct / cat.total : 0;
  }

  return { correct, totalMs, byCategory };
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
}): Promise<BenchmarkResult[]> {
  const { dataPath, sampleSize, topK = 5, concurrency = 3, conversationId } = options;

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
      category: (['single_hop', 'multi_hop', 'temporal', 'open_domain'][q.category - 1] ?? 'single_hop') as LoCoMoQA['category'],
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

  console.log(`\n[Benchmark] Evaluating QAs with top_k=${topK}...`);

  const results: BenchmarkResult[] = [];

  for (const conv of conversations) {
    const { correct, totalMs, byCategory } = await evaluateConversationQAs(conv, topK, 5);

    const result: BenchmarkResult = {
      conversation_id: conv.conversation_id,
      total_qa: conv.qa_pairs.length,
      correct,
      accuracy: conv.qa_pairs.length > 0 ? correct / conv.qa_pairs.length : 0,
      by_category: byCategory,
      avg_retrieval_ms: conv.qa_pairs.length > 0 ? totalMs / conv.qa_pairs.length : 0,
    };

    results.push(result);
    console.log(`  ${conv.conversation_id}: ${(result.accuracy * 100).toFixed(1)}% (${correct}/${conv.qa_pairs.length})`);
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

  const results = await runBenchmark({
    dataPath,
    sampleSize: sampleArg ? parseInt(sampleArg.split('=')[1]) : undefined,
    topK,
    concurrency,
    conversationId: convArg ? convArg.split('=')[1] : undefined,
  });

  printSummary(results, topK);

  const outPath = path.join(__dirname, 'results', `parallel-topk${topK}-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ results, topK, timestamp: new Date().toISOString() }, null, 2));
  console.log(`Results saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
