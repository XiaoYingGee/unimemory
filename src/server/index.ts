import express from 'express';
import cors from 'cors';
import { writeMemory, searchMemories, resolveConflict } from '../memory/service';
import { listColdMemories, warmUpMemory, archiveColdMemories, getColdStorageStats } from '../memory/hot-cold';
import { getDb } from '../db/connection';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.HTTP_PORT ?? 3001;

// ── Health ────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// ── Write Memory ──────────────────────────────────────────────────────────
app.post('/api/memories', async (req, res) => {
  try {
    const result = await writeMemory(req.body);
    res.json(result);
  } catch (err: any) {
    const status = err.code === 'SENSITIVE_CONTENT_BLOCKED' ? 422 : 500;
    res.status(status).json({ error: err.code ?? 'INTERNAL_ERROR', message: err.message });
  }
});

// ── Search Memories ───────────────────────────────────────────────────────
app.get('/api/memories/search', async (req, res) => {
  try {
    const { query, agent_id, scope_filter, project_id, top_k, min_similarity, min_confidence, include_archived } = req.query;
    const result = await searchMemories({
      query: query as string,
      agent_id: agent_id as string,
      scope_filter: scope_filter ? (scope_filter as string).split(',') as any : undefined,
      project_id: project_id as string | undefined,
      top_k: top_k ? Number(top_k) : undefined,
      min_similarity: min_similarity ? Number(min_similarity) : undefined,
      min_confidence: min_confidence ? Number(min_confidence) : undefined,
      include_archived: include_archived === 'true',
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── List Memories (browse) ────────────────────────────────────────────────
app.get('/api/memories', async (req, res) => {
  try {
    const db = await getDb();
    const { scope, status, agent_id, project_id, page = '1', limit = '20' } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];

    if (scope) { params.push(scope); conditions.push(`scope = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    if (agent_id) { params.push(agent_id); conditions.push(`agent_id = $${params.length}`); }
    if (project_id) { params.push(project_id); conditions.push(`project_id = $${params.length}`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [rows, countRow] = await Promise.all([
      db.query(
        `SELECT id, content, scope, project_id, agent_id, memory_type, source_type,
                confidence, importance_score, entity_tags, status, conflict_group_id,
                conflict_type, source_context, access_count, last_accessed_at,
                archived_at, created_at, updated_at, embedding_model
         FROM memories ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, Number(limit), offset]
      ),
      db.query(`SELECT COUNT(*) FROM memories ${where}`, params),
    ]);

    res.json({ memories: rows.rows, total: Number(countRow.rows[0].count), page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── Get Single Memory ─────────────────────────────────────────────────────
app.get('/api/memories/:id', async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.query(
      `SELECT id, content, scope, project_id, agent_id, memory_type, source_type,
              confidence, importance_score, entity_tags, status, conflict_group_id,
              conflict_type, source_context, access_count, last_accessed_at,
              archived_at, created_at, updated_at, embedding_model
       FROM memories WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── Update Memory Status ──────────────────────────────────────────────────
app.patch('/api/memories/:id', async (req, res) => {
  try {
    const db = await getDb();
    const { status, content } = req.body;
    const fields: string[] = [];
    const params: any[] = [];

    if (status) { params.push(status); fields.push(`status = $${params.length}`); }
    if (content) { params.push(content); fields.push(`content = $${params.length}`); }
    if (fields.length === 0) return res.status(400).json({ error: 'NO_FIELDS' });

    params.push(req.params.id);
    const result = await db.query(
      `UPDATE memories SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING id, status`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── Resolve Conflict ──────────────────────────────────────────────────────
app.post('/api/conflicts/resolve', async (req, res) => {
  try {
    const { conflict_group_id, winner_memory_id, resolution_note } = req.body;
    const result = await resolveConflict(conflict_group_id, winner_memory_id, resolution_note);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── List Conflicts ────────────────────────────────────────────────────────
app.get('/api/conflicts', async (req, res) => {
  try {
    const db = await getDb();
    const result = await db.query(
      `SELECT DISTINCT conflict_group_id,
              COUNT(*) as memory_count,
              MAX(created_at) as latest_at
       FROM memories
       WHERE status = 'disputed' AND conflict_group_id IS NOT NULL
       GROUP BY conflict_group_id
       ORDER BY latest_at DESC
       LIMIT 50`
    );
    const conflicts = await Promise.all(
      result.rows.map(async (row: any) => {
        const members = await db.query(
          `SELECT id, content, agent_id, scope, memory_type, confidence,
                  source_type, conflict_type, created_at
           FROM memories WHERE conflict_group_id = $1`,
          [row.conflict_group_id]
        );
        return { conflict_group_id: row.conflict_group_id, memory_count: Number(row.memory_count), latest_at: row.latest_at, memories: members.rows };
      })
    );
    res.json({ conflicts });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── Stats ─────────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const db = await getDb();
    const [summary, coldStats] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'disputed') as disputed,
          COUNT(*) FILTER (WHERE status = 'archived') as archived,
          COUNT(*) FILTER (WHERE status = 'superseded') as superseded,
          COUNT(*) FILTER (WHERE scope = 'global') as global_count,
          COUNT(*) FILTER (WHERE scope = 'project') as project_count,
          COUNT(*) FILTER (WHERE scope = 'agent') as agent_count
        FROM memories
      `),
      getColdStorageStats(),
    ]);
    res.json({ ...summary.rows[0], ...coldStats });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── Cold Storage: List ────────────────────────────────────────────────────
app.get('/api/archive', async (req, res) => {
  try {
    const { agent_id, project_id, scope, page = '1', limit = '20' } = req.query;
    const result = await listColdMemories({
      agentId: agent_id as string | undefined,
      projectId: project_id as string | undefined,
      scope: scope as string | undefined,
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
    });
    res.json({ ...result, page: Number(page), limit: Number(limit) });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── Cold Storage: Warm Up ─────────────────────────────────────────────────
app.post('/api/archive/:id/warmup', async (req, res) => {
  try {
    const warmed = await warmUpMemory(req.params.id);
    if (!warmed) return res.status(404).json({ error: 'NOT_FOUND_OR_ALREADY_HOT' });
    res.json({ warmed: true, memory_id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── Cold Storage: Manual Archive Run ─────────────────────────────────────
app.post('/api/archive/run', async (req, res) => {
  try {
    const result = await archiveColdMemories();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// ── Provider Config ───────────────────────────────────────────────────────
app.get('/api/provider', (_req, res) => {
  res.json({
    provider: process.env.EMBEDDING_PROVIDER ?? 'openai',
    model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
    baseUrl: process.env.EMBEDDING_BASE_URL ?? null,
    coldAfterDays: Number(process.env.UNIMEMORY_COLD_AFTER_DAYS ?? 30),
    importanceThreshold: Number(process.env.UNIMEMORY_IMPORTANCE_THRESHOLD ?? 0.8),
  });
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`UniMemory HTTP API running on http://localhost:${PORT}`);
});

export default app;
