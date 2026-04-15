import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../../src/db/connection';
import { writeMemory, searchMemory } from '../../src/memory/service';
import { mergeMemories } from '../../src/memory/merge-compress';

describe('Q3: Merge & Compress', () => {
  beforeEach(async () => {
    const db = getDb();
    await db.query('DELETE FROM memories WHERE agent_id = $1', ['test-agent']);
  });

  describe('Manual merge trigger', () => {
    it('TC-Q3-MERGE-01: Merge 2-20 memories into one', async () => {
      const memories = [];
      for (let i = 0; i < 5; i++) {
        const m = await writeMemory({
          agent_id: 'test-agent',
          type: 'context',
          content: `Related memory ${i}`,
          scope: 'project',
          source_context: 'test'
        });
        memories.push(m.id);
      }

      const merged = await mergeMemories('test-agent', memories, {
        mode: 'manual',
        context: 'These are related context memories'
      });

      expect(merged.new_memory_id).toBeDefined();
      expect(merged.archived_ids).toEqual(expect.arrayContaining(memories));
    });

    it('TC-Q3-MERGE-02: Merged memory includes source tracking', async () => {
      const m1 = await writeMemory({
        agent_id: 'test-agent',
        type: 'fact',
        content: 'Fact 1',
        scope: 'project',
        source_context: 'test'
      });

      const m2 = await writeMemory({
        agent_id: 'test-agent',
        type: 'fact',
        content: 'Fact 2',
        scope: 'project',
        source_context: 'test'
      });

      const merged = await mergeMemories('test-agent', [m1.id, m2.id], {
        mode: 'manual'
      });

      const result = await searchMemory('test-agent', 'merged', { include_archived: true });
      const merged_memory = result.find(m => m.id === merged.new_memory_id);
      
      expect(merged_memory.merge_sources).toContain(m1.id);
      expect(merged_memory.merge_sources).toContain(m2.id);
    });

    it.todo('TC-Q3-MERGE-03: Transaction rollback on LLM failure');
  });

  describe('LLM compression', () => {
    it.todo('TC-Q3-COMPRESS-01: LLM generates coherent summary');
    it.todo('TC-Q3-COMPRESS-02: Fallback to text concatenation when LLM fails');
  });

  describe('Merge traceability', () => {
    it('TC-Q3-TRACE-01: Original memories remain retrievable', async () => {
      const m1 = await writeMemory({
        agent_id: 'test-agent',
        type: 'fact',
        content: 'Original 1',
        scope: 'project',
        source_context: 'test'
      });

      await mergeMemories('test-agent', [m1.id], { mode: 'manual' });
      
      const archived = await searchMemory('test-agent', 'original', { include_archived: true });
      expect(archived.length).toBeGreaterThan(0);
    });

    it.todo('TC-Q3-TRACE-02: Get merge sources returns all ancestors');
  });
});
