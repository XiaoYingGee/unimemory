#!/usr/bin/env node
/**
 * LoCoMo Baseline Benchmark Runner
 * 
 * Tests UniMemory recall accuracy against the LoCoMo dataset.
 * Dataset: https://github.com/snap-research/LoCoMo
 * Paper: https://arxiv.org/abs/2402.17753 (ACL 2024)
 * 
 * Usage:
 *   npx ts-node benchmarks/locomo/run.ts [--sample N] [--conversation-id ID]
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
  evidence_turn_ids: number[];  // Which turns contain the evidence
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

// ---- Core Logic ----

/**
 * Ingest a conversation into UniMemory.
 * Each session's turns are summarized into memory entries.
 */
async function ingestConversation(conv: LoCoMoConversation): Promise<void> {
  // Group turns by session
  const sessions = new Map<number, LoCoMoTurn[]>();
  for (const turn of conv.turns) {
    if (!sessions.has(turn.session_id)) sessions.set(turn.session_id, []);
    sessions.get(turn.session_id)!.push(turn);
  }

  for (const [sessionId, turns] of sessions) {
    // Write each turn as a separate memory (simple ingestion strategy)
    for (const turn of turns) {
      if (!turn.text || turn.text.trim().length < 10) continue; // Skip empty or very short turns

      const req: WriteMemoryRequest = {
        content: `[Session ${sessionId}, ${turn.speaker}]: ${turn.text}`,
        agent_id: 'locomo-benchmark',
        scope: 'project',
        project_id: `locomo-${conv.conversation_id}`,
        memory_type: 'context',
        source_type: 'confirmed',
        confidence: 0.9,
        importance_score: 0.5,
        entity_tags: [`session:${sessionId}`, `speaker:${turn.speaker}`],
        source_context: `LoCoMo turn ${turn.turn_id}`,
      };

      await writeMemory(req);
    }
  }
}

/**
 * Evaluate recall: search UniMemory for evidence related to each QA pair.
 * Returns true if at least one relevant memory was retrieved in top-K.
 */
async function evaluateQA(
  qa: LoCoMoQA,
  conversationId: string,
  topK: number = 5
): Promise<{ correct: boolean; retrievalMs: number }> {
  const start = Date.now();

  const results = await searchMemories({
    query: qa.question,
    agent_id: 'locomo-benchmark',
    scope_filter: ['project'],
    project_id: `locomo-${conversationId}`,
    top_k: topK,
    min_similarity: 0.5,  // Lower threshold for benchmark to test retrieval range
  });

  const retrievalMs = Date.now() - start;

  // Check if retrieved memories contain the expected evidence
  // Simple heuristic: does the answer appear in any retrieved memory?
  const answerTokens = String(qa.answer ?? '').toLowerCase().split(/\s+/).filter(t => t.length > 3);
  const correct = results.memories.some(mem => {
    const content = mem.content.toLowerCase();
    // At least 50% of answer tokens should appear in the retrieved memory
    const matchCount = answerTokens.filter(t => content.includes(t)).length;
    return matchCount / answerTokens.length >= 0.5;
  });

  return { correct, retrievalMs };
}

// ---- Runner ----

async function runBenchmark(options: {
  dataPath: string;
  sampleSize?: number;
  conversationId?: string;
}): Promise<BenchmarkResult[]> {
  const { dataPath, sampleSize, conversationId } = options;

  const rawData: any[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  // Normalize LoCoMo format to internal format
  let conversations: LoCoMoConversation[] = rawData.map((sample: any) => {
    // Build turns from session_1, session_2, ... keys
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

    // Normalize QA pairs — guard against non-string fields in the dataset
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

  const results: BenchmarkResult[] = [];

  for (const conv of conversations) {
    console.log(`\n[LoCoMo] Processing conversation ${conv.conversation_id}...`);
    console.log(`  Turns: ${conv.turns.length}, QA pairs: ${conv.qa_pairs.length}`);

    // Ingest conversation into UniMemory
    await ingestConversation(conv);
    console.log(`  ✓ Ingested ${conv.turns.length} turns`);

    // Evaluate each QA pair
    let correct = 0;
    let totalMs = 0;
    const byCategory: Record<string, { total: number; correct: number; accuracy: number }> = {};

    for (const qa of conv.qa_pairs) {
      const { correct: isCorrect, retrievalMs } = await evaluateQA(qa, conv.conversation_id);
      totalMs += retrievalMs;
      if (isCorrect) correct++;

      // Track by category
      if (!byCategory[qa.category]) {
        byCategory[qa.category] = { total: 0, correct: 0, accuracy: 0 };
      }
      byCategory[qa.category].total++;
      if (isCorrect) byCategory[qa.category].correct++;
    }

    // Calculate category accuracies
    for (const cat of Object.values(byCategory)) {
      cat.accuracy = cat.total > 0 ? cat.correct / cat.total : 0;
    }

    const result: BenchmarkResult = {
      conversation_id: conv.conversation_id,
      total_qa: conv.qa_pairs.length,
      correct,
      accuracy: conv.qa_pairs.length > 0 ? correct / conv.qa_pairs.length : 0,
      by_category: byCategory,
      avg_retrieval_ms: conv.qa_pairs.length > 0 ? totalMs / conv.qa_pairs.length : 0,
    };

    results.push(result);
    console.log(`  Accuracy: ${(result.accuracy * 100).toFixed(1)}% (${correct}/${conv.qa_pairs.length})`);
  }

  return results;
}

function printSummary(results: BenchmarkResult[]): void {
  console.log('\n' + '='.repeat(60));
  console.log('LoCoMo Benchmark Results — UniMemory Baseline');
  console.log('='.repeat(60));

  const totalQA = results.reduce((s, r) => s + r.total_qa, 0);
  const totalCorrect = results.reduce((s, r) => s + r.correct, 0);
  const overallAccuracy = totalQA > 0 ? totalCorrect / totalQA : 0;
  const avgMs = results.reduce((s, r) => s + r.avg_retrieval_ms, 0) / results.length;

  console.log(`\nOverall Accuracy : ${(overallAccuracy * 100).toFixed(1)}% (${totalCorrect}/${totalQA})`);
  console.log(`Avg Retrieval    : ${avgMs.toFixed(0)}ms`);
  console.log(`Target (P1)      : > 70%`);
  console.log(`Status           : ${overallAccuracy >= 0.7 ? '✅ PASS' : '⚠️  BELOW TARGET'}`);

  console.log('\nPer-conversation breakdown:');
  for (const r of results) {
    const pct = (r.accuracy * 100).toFixed(1);
    console.log(`  ${r.conversation_id.padEnd(20)} ${pct}% (${r.correct}/${r.total_qa})`);
  }

  // Category breakdown (aggregate across conversations)
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

  console.log('\n' + '='.repeat(60));
}

// ---- Entry point ----

async function main() {
  const args = process.argv.slice(2);
  const sampleArg = args.find(a => a.startsWith('--sample='));
  const convArg = args.find(a => a.startsWith('--conversation-id='));

  const dataPath = path.join(__dirname, 'data', 'locomo.json');

  if (!fs.existsSync(dataPath)) {
    console.error(`\n❌ LoCoMo data not found at: ${dataPath}`);
    console.error('Download with: npm run benchmark:locomo:download');
    process.exit(1);
  }

  const results = await runBenchmark({
    dataPath,
    sampleSize: sampleArg ? parseInt(sampleArg.split('=')[1]) : undefined,
    conversationId: convArg ? convArg.split('=')[1] : undefined,
  });

  printSummary(results);

  // Save results to file
  const outPath = path.join(__dirname, 'results', `baseline-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ results, timestamp: new Date().toISOString() }, null, 2));
  console.log(`\nResults saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
