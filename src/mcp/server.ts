import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { writeMemory, searchMemories, resolveConflict } from '../memory/service';

const server = new McpServer({
  name: 'unimemory',
  version: '0.1.0',
});

// ── memory_write ──────────────────────────────────────────────────────────
server.tool(
  'memory_write',
  'Write a memory to the unified memory store. Must be manually triggered — do not auto-write.',
  {
    content: z.string().describe('Memory content — one knowledge point per memory'),
    agent_id: z.string().describe('ID of the agent writing this memory'),
    scope: z.enum(['global', 'project', 'agent']).describe('Scope: global/project/agent'),
    project_id: z.string().optional().describe('Required when scope=project'),
    memory_type: z
      .enum(['preference', 'decision', 'fact', 'context', 'temp'])
      .describe('Type of memory'),
    source_type: z
      .enum(['confirmed', 'inferred', 'uncertain'])
      .default('confirmed')
      .describe('How certain is this memory'),
    confidence: z.number().min(0).max(1).default(0.5).optional(),
    importance_score: z.number().min(0).max(1).default(0.5).optional(),
    entity_tags: z.array(z.string()).optional().describe('Entity tags for conflict detection'),
    source_context: z.string().optional().describe('Context summary when writing'),
  },
  async (params) => {
    if (params.scope === 'project' && !params.project_id) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'PROJECT_ID_REQUIRED', message: 'project_id is required when scope=project' }) }],
        isError: true,
      };
    }

    const result = await writeMemory(params as Parameters<typeof writeMemory>[0]);

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }
);

// ── memory_read ───────────────────────────────────────────────────────────
server.tool(
  'memory_read',
  'Search memories by semantic similarity. Always check conflicts in the response.',
  {
    query: z.string().describe('Natural language description of what you are looking for'),
    agent_id: z.string().describe('ID of the requesting agent'),
    scope_filter: z
      .enum(['global', 'project', 'agent', 'all'])
      .default('all')
      .optional(),
    project_id: z.string().optional().describe('Filter by project'),
    top_k: z.number().int().min(1).max(20).default(5).optional(),
    min_confidence: z.number().min(0).max(1).default(0.3).optional(),
    include_conflicts: z.boolean().default(true).optional(),
  },
  async (params) => {
    const result = await searchMemories({
      query: params.query,
      agent_id: params.agent_id,
      scope_filter: params.scope_filter ? [params.scope_filter as 'global' | 'project' | 'agent'] : undefined,
      project_id: params.project_id,
      top_k: params.top_k,
      min_similarity: params.min_confidence,
      include_archived: params.include_conflicts,
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }
);

// ── memory_resolve_conflict ───────────────────────────────────────────────
server.tool(
  'memory_resolve_conflict',
  'Resolve a memory conflict. ONLY to be called by humans or 雪琪 on behalf of the user — never auto-called by agents.',
  {
    conflict_group_id: z.string().uuid().describe('The conflict group ID to resolve'),
    winner_memory_id: z.string().uuid().describe('The memory ID to keep'),
    resolution_note: z.string().optional().describe('Note explaining the resolution'),
  },
  async (params) => {
    const result = await resolveConflict(
      params.conflict_group_id,
      params.winner_memory_id,
      params.resolution_note
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  }
);

// ── Start server ──────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('UniMemory MCP Server running on stdio');
}

main().catch(console.error);
