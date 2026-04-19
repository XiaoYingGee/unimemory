#!/usr/bin/env node
/**
 * OPT-2.5 H1 Diagnosis: Check LLM answer patterns for open_domain errors
 * 
 * Runs 20 open_domain QAs from conv-49, compares baseline (no LLM) vs LLM answer
 * and categorizes LLM failures: None/refuse vs overgeneral vs wrong fact
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai').default;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-xxx',
  baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.UNIMEMORY_LLM_MODEL || 'gpt-4o-mini';

async function searchMemories(query, agentId, topK = 10) {
  const embRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const embedding = embRes.data[0].embedding;
  const vectorStr = '[' + embedding.join(',') + ']';

  const res = await pool.query(`
    SELECT content, 1 - (embedding <=> $1::vector) AS similarity
    FROM memories
    WHERE agent_id != 'private'
      AND status = 'active'
      AND archived_at IS NULL
      AND agent_id = $2
    ORDER BY 1 - (embedding <=> $1::vector) DESC
    LIMIT $3
  `, [vectorStr, agentId, topK]);
  return res.rows;
}

async function getLLMAnswer(chunks, question) {
  const context = chunks.map(c => c.content).join('\n\n---\n\n');
  const prompt = `You are a memory retrieval assistant. Based on the retrieved memory chunks below, answer the question concisely.

If the answer cannot be determined from the chunks, respond with "None".

Memory chunks:
${context}

Question: ${question}
Answer:`;

  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_completion_tokens: 100,
    temperature: 0,
  });
  return res.choices[0].message.content?.trim() || 'None';
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

function isNoneResponse(answer) {
  const lower = answer.toLowerCase();
  return lower.includes('none') || lower.includes('cannot') || lower.includes('not enough') ||
    lower.includes('unable') || lower.includes('no information') || lower.includes('not mentioned');
}

async function main() {
  // Load dataset
  const data = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'data/locomo.json'), 'utf-8'
  ));
  const conv49 = data.find(s => s.sample_id === 'conv-49');
  if (!conv49) throw new Error('conv-49 not found');

  const openDomainQAs = (conv49.qa || [])
    .filter(q => q.category === 4)  // 4 = open_domain (1=single_hop,2=multi_hop,3=temporal,4=open_domain,5=adversarial)
    .slice(0, 20);

  console.log(`Diagnosing ${openDomainQAs.length} open_domain QAs from conv-49\n`);

  const categories = { none_refuse: 0, overgeneral: 0, wrong_fact: 0, correct: 0 };
  const details = [];

  for (let i = 0; i < openDomainQAs.length; i++) {
    const qa = openDomainQAs[i];
    process.stdout.write(`[${i + 1}/${openDomainQAs.length}] ${qa.question.slice(0, 60)}...`);

    const chunks = await searchMemories(qa.question, 'locomo-conv-49', 10);
    const llmAnswer = await getLLMAnswer(chunks, qa.question);
    const expected = qa.answer;

    const normLLM = normalize(llmAnswer);
    const normExpected = normalize(String(expected));

    let category;
    if (isNoneResponse(llmAnswer)) {
      category = 'none_refuse';
    } else if (normLLM.split(' ').some(w => normExpected.split(' ').includes(w) && w.length > 3)) {
      category = 'correct';
    } else if (llmAnswer.length > 100) {
      category = 'overgeneral';
    } else {
      category = 'wrong_fact';
    }

    categories[category]++;
    details.push({ question: qa.question, expected, llmAnswer, category });
    console.log(` → ${category}`);
  }

  console.log('\n=== H1 Diagnosis Summary ===');
  console.log(`none_refuse:  ${categories.none_refuse}/${openDomainQAs.length} (${(categories.none_refuse/openDomainQAs.length*100).toFixed(1)}%) ← H1 target`);
  console.log(`overgeneral:  ${categories.overgeneral}/${openDomainQAs.length} (${(categories.overgeneral/openDomainQAs.length*100).toFixed(1)}%) ← H4 target`);
  console.log(`wrong_fact:   ${categories.wrong_fact}/${openDomainQAs.length} (${(categories.wrong_fact/openDomainQAs.length*100).toFixed(1)}%)`);
  console.log(`correct:      ${categories.correct}/${openDomainQAs.length} (${(categories.correct/openDomainQAs.length*100).toFixed(1)}%)`);

  console.log('\n=== Sample Failures ===');
  details.filter(d => d.category !== 'correct').slice(0, 5).forEach(d => {
    console.log(`\nQ: ${d.question}`);
    console.log(`Expected: ${d.expected}`);
    console.log(`LLM said: ${d.llmAnswer}`);
    console.log(`Category: ${d.category}`);
  });

  const outPath = path.join(__dirname, `results/opt2.5-h1-diagnosis-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ categories, details, timestamp: new Date().toISOString() }, null, 2));
  console.log(`\nFull results: ${outPath}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
