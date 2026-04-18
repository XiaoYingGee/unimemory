#!/usr/bin/env node
/**
 * Judge Calibration Script
 * 
 * Samples 25 QA pairs (5 per category), runs LLM answer generation + judge,
 * outputs a CSV for human annotation to compute confusion matrix.
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import * as fs from 'fs';
import { searchMemories } from '../../src/memory/service';

// ---- Types ----
interface LoCoMoQA {
  question: string;
  answer: string;
  evidence_turn_ids: number[];
  category: number; // 1-5
}

const CATEGORY_MAP: Record<number, string> = {
  1: 'single_hop',
  2: 'multi_hop',
  3: 'temporal',
  4: 'open_domain',
  5: 'adversarial',
};

// ---- LLM helpers ----

async function callLLM(prompt: string, jsonMode: boolean): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY ?? '';
  const baseUrl = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.UNIMEMORY_LLM_MODEL ?? 'gpt-4o-mini';

  const maxRetries = 5;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const body: any = {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: jsonMode ? 20 : 300,
      };
      if (jsonMode) body.response_format = { type: 'json_object' };

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });

      if (res.status === 429 || res.status === 499) {
        const retryAfter = res.headers.get('retry-after');
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(2000 * Math.pow(2, attempt), 30000);
        lastErr = new Error(`LLM ${res.status}`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
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

async function generateAnswer(question: string, conversationId: string, topK = 10): Promise<string> {
  const results = await searchMemories({
    query: question,
    agent_id: `locomo-${conversationId}`,
    scope_filter: ['project'],
    project_id: `locomo-${conversationId}`,
    top_k: topK,
    min_similarity: 0.5,
  });

  if (results.memories.length === 0) return 'None';

  const context = results.memories.map((m, i) => `[${i + 1}] ${m.content}`).join('\n');
  const prompt = `You are a question answering assistant. Based on the following context from a conversation history, answer the question concisely.

Context:
${context}

Question: ${question}

If the answer cannot be determined from the context, respond with "None".
Respond with ONLY the answer (a few words), no explanation.`;

  return callLLM(prompt, false);
}

async function judgeAnswer(expected: string, generated: string, question: string): Promise<{ verdict: boolean; raw: string }> {
  const exp = expected.toLowerCase().trim();
  const gen = generated.toLowerCase().trim();

  // adversarial / unanswerable: expected empty or 'none' = question should be refused
  const UNANSWERABLE = ['none', '', 'n/a'];
  const REFUSAL = ['none', '', 'n/a', "i don't know", 'unknown', 'not mentioned', 'not specified'];
  if (UNANSWERABLE.includes(exp)) {
    const verdict = REFUSAL.some(r => r !== '' && gen.includes(r)) || gen === '';
    return { verdict, raw: JSON.stringify({ correct: verdict }) };
  }

  const prompt = `You are an answer evaluation assistant. Decide if the generated answer correctly answers the question, given the expected answer as ground truth.

Question: ${question}
Expected answer: ${expected}
Generated answer: ${generated}

IMPORTANT: When the expected answer is "None" or empty, the question is unanswerable; if the generated answer also indicates inability to answer (None / N/A / I don't know / unknown), treat as CORRECT.
Be lenient with paraphrasing and synonyms — if the meaning matches, it is correct.

First explain your reasoning step by step, then on the last line output exactly:
VERDICT: CORRECT
or
VERDICT: WRONG`;

  const raw = await callLLM(prompt, false);
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const verdictLine = [...lines].reverse().find(l => l.toUpperCase().startsWith('VERDICT:'));
  const verdict = verdictLine ? verdictLine.toUpperCase().includes('CORRECT') : false;
  return { verdict, raw };
}

// ---- Main ----

async function main() {
  const dataFile = path.join(__dirname, 'data', 'locomo.json');
  const rawData: any[] = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));

  // Use conv-26 (first conversation, already ingested in DB)
  const convRaw = rawData[0];
  const conversationId = 'conv-26';

  // Extract QA pairs
  const qaPairs: { question: string; answer: string; category: string; idx: number }[] = [];
  const qaRaw: LoCoMoQA[] = convRaw.qa_list ?? convRaw.qa ?? convRaw.qa_pairs ?? [];

  for (let i = 0; i < qaRaw.length; i++) {
    const qa = qaRaw[i];
    qaPairs.push({
      question: qa.question,
      answer: String(qa.answer ?? ''),
      category: CATEGORY_MAP[qa.category] ?? String(qa.category),
      idx: i,
    });
  }

  // Sample 5 per category (or all if fewer)
  const SAMPLE_PER_CAT = 5;
  const categories = ['single_hop', 'multi_hop', 'temporal', 'open_domain', 'adversarial'];
  const sampled: typeof qaPairs = [];

  for (const cat of categories) {
    const inCat = qaPairs.filter(q => q.category === cat);
    // Pick evenly spaced samples
    const step = Math.max(1, Math.floor(inCat.length / SAMPLE_PER_CAT));
    for (let i = 0; i < inCat.length && sampled.filter(q => q.category === cat).length < SAMPLE_PER_CAT; i += step) {
      sampled.push(inCat[i]);
    }
  }

  console.log(`\nCalibrating judge on ${sampled.length} samples...`);
  console.log('Categories:', categories.map(c => `${c}:${sampled.filter(q => q.category === c).length}`).join(', '));

  // Run for each sample
  const rows: {
    idx: number;
    category: string;
    question: string;
    expected: string;
    generated: string;
    judge_verdict: boolean;
    judge_raw: string;
    token_overlap_correct: boolean;
    human_label?: string; // to be filled manually
  }[] = [];

  for (let i = 0; i < sampled.length; i++) {
    const qa = sampled[i];
    process.stdout.write(`  [${i + 1}/${sampled.length}] ${qa.category} #${qa.idx}... `);

    try {
      const generated = await generateAnswer(qa.question, conversationId);
      const { verdict, raw } = await judgeAnswer(qa.answer, generated, qa.question);

      // token overlap (old metric)
      const expTokens = qa.answer.toLowerCase().split(/\s+/).filter((t: string) => t.length > 3);
      const tokenCorrect = expTokens.length > 0 && expTokens.filter((t: string) => generated.toLowerCase().includes(t)).length / expTokens.length >= 0.5;

      rows.push({
        idx: qa.idx,
        category: qa.category,
        question: qa.question,
        expected: qa.answer,
        generated,
        judge_verdict: verdict,
        judge_raw: raw,
        token_overlap_correct: tokenCorrect,
      });

      console.log(`${verdict ? '✓' : '✗'} judge | ${tokenCorrect ? '✓' : '✗'} token | gen: "${generated.slice(0, 60)}"`);
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`);
      rows.push({
        idx: qa.idx,
        category: qa.category,
        question: qa.question,
        expected: qa.answer,
        generated: 'ERROR',
        judge_verdict: false,
        judge_raw: '',
        token_overlap_correct: false,
      });
    }
  }

  // Write JSON output for human annotation
  const outPath = path.join(__dirname, 'results', `judge-calibration-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ conversationId, samples: rows, timestamp: new Date().toISOString() }, null, 2));
  console.log(`\nCalibration data saved to: ${outPath}`);

  // Print summary table for quick review
  console.log('\n' + '='.repeat(90));
  console.log('CALIBRATION SAMPLES — add human_label (correct/wrong) to compute confusion matrix');
  console.log('='.repeat(90));
  for (const r of rows) {
    console.log(`\n[${r.category}] Q: ${r.question.slice(0, 80)}`);
    console.log(`  Expected : ${r.expected}`);
    console.log(`  Generated: ${r.generated}`);
    console.log(`  Judge    : ${r.judge_verdict ? 'CORRECT' : 'WRONG'} | Token: ${r.token_overlap_correct ? 'CORRECT' : 'WRONG'}`);
  }
  console.log('\n' + '='.repeat(90));
  console.log(`\nNext step: open ${outPath}, add "human_label": "correct"/"wrong" for each sample, then run compute-confusion-matrix.ts`);
}

main().catch(err => {
  console.error('Calibration failed:', err);
  process.exit(1);
});
