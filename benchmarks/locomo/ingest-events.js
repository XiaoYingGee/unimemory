#!/usr/bin/env node
/**
 * OPT-3 Step A: Ingest event-index.jsonl into pgvector
 *
 * Uses agent_id = 'locomo-events-<sample_id>' to isolate from chunks.
 * Runs with concurrency=3 + exponential backoff for 429/499.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { OpenAI } = require('openai');

const JSONL_PATH = path.resolve(__dirname, 'data/event-index.jsonl');
const CONCURRENCY = 3;
const MAX_RETRIES = 5;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
});

async function generateEmbedding(text, attempt = 0) {
  try {
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: [text],
      encoding_format: 'float',
      dimensions: 1536,
    });
    return res.data[0].embedding;
  } catch (err) {
    const status = err?.status ?? err?.response?.status;
    if ((status === 429 || status === 499 || status === 530) && attempt < MAX_RETRIES) {
      const delay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 30000);
      await new Promise(r => setTimeout(r, delay));
      return generateEmbedding(text, attempt + 1);
    }
    throw err;
  }
}

async function ingestRecord(record, idx, total) {
  const { sample_id, session_id, kind, text, date, source, speaker } = record;
  const agentId = `locomo-events-${sample_id}`;

  const embedding = await generateEmbedding(text);

  await pool.query(
    `INSERT INTO memories (
      content, embedding, scope, project_id, agent_id,
      memory_type, source_type, confidence, importance_score,
      entity_tags, status, embedding_model
    ) VALUES (
      $1, $2::vector, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, $12
    )`,
    [
      text,
      JSON.stringify(embedding),
      'agent',
      null,
      agentId,
      'fact',
      'confirmed',
      0.8,
      0.8,
      [kind, source, session_id],
      'active',
      'openai/text-embedding-3-small',
    ]
  );

  if (idx % 50 === 0 || idx === total - 1) {
    console.log(`  [${idx + 1}/${total}] ingested ${agentId} / ${session_id} (${kind})`);
  }
}

async function runWithConcurrency(tasks, concurrency) {
  const queue = [...tasks];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) await task();
    }
  });
  await Promise.all(workers);
}

async function main() {
  const lines = fs.readFileSync(JSONL_PATH, 'utf-8').trim().split('\n');
  const records = lines.map(l => JSON.parse(l));
  console.log(`Ingesting ${records.length} event records with concurrency=${CONCURRENCY}...`);

  // Clear existing events
  const del = await pool.query("DELETE FROM memories WHERE agent_id LIKE 'locomo-events-%'");
  console.log(`  Cleared ${del.rowCount} existing event records`);

  const tasks = records.map((r, i) => async () => {
    try {
      await ingestRecord(r, i, records.length);
    } catch (err) {
      console.error(`  [${i+1}/${records.length}] SKIP ERROR: ${err.message?.slice(0,100)}`);
    }
  });
  await runWithConcurrency(tasks, CONCURRENCY);

  console.log(`\n✓ Done! ${records.length} event records ingested.`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
