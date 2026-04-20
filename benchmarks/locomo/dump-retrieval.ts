/**
 * OPT-7 Debug: dump retrieval signals for a query
 * Usage: npx ts-node benchmarks/locomo/dump-retrieval.ts --conversation-id=conv-49 --query="..."
 * Or: pipe through run.ts with --dump-retrieval flag
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { generateEmbedding } from '../../src/memory/embedding/index';
import { getDb } from '../../src/db/connection';

interface SignalResult {
  id: string;
  content: string;
  vec_score: number;
  bm25_score: number;
  entity_score: number;
  hybrid_score: number;
  signals: string[];
}

export async function dumpRetrieval(
  query: string,
  conversationId: string,
  topK: number = 10
): Promise<SignalResult[]> {
  const db = await getDb();
  const queryEmbedding = await generateEmbedding(query);
  const weights = {
    vector: parseFloat(process.env.UNIMEMORY_WEIGHT_VECTOR ?? '0.6'),
    bm25:   parseFloat(process.env.UNIMEMORY_WEIGHT_BM25   ?? '0.3'),
    entity: parseFloat(process.env.UNIMEMORY_WEIGHT_ENTITY ?? '0.1'),
  };
  const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const entityHints = queryWords.map(w => `speaker:${w}`).concat(queryWords.map(w => `session:${w}`));

  const sql = `
    WITH base AS (
      SELECT
        id,
        LEFT(content, 200) AS content,
        1 - (embedding <=> $1::vector) AS vec_score,
        COALESCE(
          ts_rank_cd(to_tsvector('english', content), websearch_to_tsquery('english', $2)),
          0
        ) AS bm25_score,
        CASE WHEN entity_tags && $3::text[] THEN 1.0 ELSE 0.0 END AS entity_score
      FROM memories
      WHERE
        archived_at IS NULL
        AND status IN ('active', 'disputed')
        AND agent_id = $4
    )
    SELECT *,
      (vec_score * ${weights.vector} + bm25_score * ${weights.bm25} + entity_score * ${weights.entity}) AS hybrid_score
    FROM base
    WHERE vec_score > 0.2 OR bm25_score > 0 OR entity_score > 0
    ORDER BY hybrid_score DESC
    LIMIT $5
  `;

  const result = await db.query(sql, [
    JSON.stringify(queryEmbedding),
    query,
    entityHints,
    `locomo-${conversationId}`,
    topK * 3,
  ]);

  return result.rows.map((r: any) => ({
    id: r.id,
    content: r.content,
    vec_score: parseFloat(r.vec_score?.toFixed(3) ?? '0'),
    bm25_score: parseFloat(r.bm25_score?.toFixed(4) ?? '0'),
    entity_score: parseFloat(r.entity_score ?? '0'),
    hybrid_score: parseFloat(r.hybrid_score?.toFixed(4) ?? '0'),
    signals: [
      r.vec_score > 0.5 ? 'vector' : '',
      r.bm25_score > 0.001 ? 'bm25' : '',
      r.entity_score > 0 ? 'entity' : '',
    ].filter(Boolean),
  }));
}

// CLI mode
async function main() {
  const args = process.argv.slice(2);
  const convArg = args.find(a => a.startsWith('--conversation-id='));
  const queryArg = args.find(a => a.startsWith('--query='));
  const topKArg = args.find(a => a.startsWith('--top-k='));

  if (!convArg || !queryArg) {
    console.error('Usage: npx ts-node dump-retrieval.ts --conversation-id=conv-49 --query="..." [--top-k=10]');
    process.exit(1);
  }

  const conversationId = convArg.split('=')[1];
  const query = queryArg.split('=').slice(1).join('=');
  const topK = topKArg ? parseInt(topKArg.split('=')[1]) : 10;

  console.log(`\n=== Retrieval dump: conv=${conversationId}, top_k=${topK} ===`);
  console.log(`Query: "${query}"\n`);

  const results = await dumpRetrieval(query, conversationId, topK);

  console.log(`Weights: vector=${process.env.UNIMEMORY_WEIGHT_VECTOR ?? '0.6'} bm25=${process.env.UNIMEMORY_WEIGHT_BM25 ?? '0.3'} entity=${process.env.UNIMEMORY_WEIGHT_ENTITY ?? '0.1'}`);
  console.log(`\nTop ${Math.min(topK, results.length)} results:\n`);

  for (let i = 0; i < Math.min(topK, results.length); i++) {
    const r = results[i];
    const signalStr = r.signals.length ? `[${r.signals.join('+')}]` : '[none]';
    console.log(`${i + 1}. hybrid=${r.hybrid_score} vec=${r.vec_score} bm25=${r.bm25_score} ent=${r.entity_score} ${signalStr}`);
    console.log(`   "${r.content.replace(/\n/g, ' ').slice(0, 120)}..."`);
  }

  // Signal stats
  const vecOnly = results.filter(r => r.signals.length === 1 && r.signals[0] === 'vector').length;
  const bm25Hit = results.filter(r => r.signals.includes('bm25')).length;
  const entityHit = results.filter(r => r.signals.includes('entity')).length;
  console.log(`\nSignal stats (top ${results.length}):`);
  console.log(`  vector-only: ${vecOnly}  bm25-hit: ${bm25Hit}  entity-hit: ${entityHit}`);

  const db = await getDb();
  await db.end();
}

main().catch(err => { console.error(err); process.exit(1); });
