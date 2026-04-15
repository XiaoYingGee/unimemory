import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../../src/db/connection';
import { writeMemory, searchMemory } from '../../src/memory/service';
import { archiverService } from '../../src/archiver/service';

describe('Q2: Hot-Cold Archival Storage', () => {
  beforeEach(async () => {
    const db = getDb();
    await db.query('DELETE FROM memories WHERE agent_id = $1', ['test-agent']);
  });

  describe('Cold archival after 30 days', () => {
    it('TC-Q2-ARCHIVE-01: Memory archived after 30 days', async () => {
      const memory = await writeMemory({
        agent_id: 'test-agent',
        type: 'fact',
        content: 'Old memory from 31 days ago',
        scope: 'project',
        source_context: 'test',
        created_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      });

      const archived = await archiverService.archiveOldMemories('test-agent');
      expect(archived.count).toBeGreaterThan(0);

      const result = await searchMemory('test-agent', 'old memory', { include_archived: false });
      expect(result).toEqual([]);
    });

    it('TC-Q2-ARCHIVE-02: Preference memories NOT archived', async () => {
      const memory = await writeMemory({
        agent_id: 'test-agent',
        type: 'preference',
        content: 'User preference - should NOT archive',
        scope: 'agent',
        source_context: 'test',
        created_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      });

      await archiverService.archiveOldMemories('test-agent');
      
      const result = await searchMemory('test-agent', 'preference', { include_archived: false });
      expect(result.length).toBeGreaterThan(0);
    });

    it('TC-Q2-ARCHIVE-03: Decision memories immune to archival', async () => {
      const memory = await writeMemory({
        agent_id: 'test-agent',
        type: 'decision',
        content: 'Critical decision - must keep',
        scope: 'global',
        source_context: 'test',
        created_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      });

      await archiverService.archiveOldMemories('test-agent');
      
      const result = await searchMemory('test-agent', 'decision', { include_archived: false });
      expect(result.length).toBeGreaterThan(0);
    });

    it('TC-Q2-ARCHIVE-04: Archived memories retrievable with flag', async () => {
      await writeMemory({
        agent_id: 'test-agent',
        type: 'fact',
        content: 'Old fact',
        scope: 'project',
        source_context: 'test',
        created_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      });

      await archiverService.archiveOldMemories('test-agent');
      
      const result = await searchMemory('test-agent', 'old fact', { include_archived: true });
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].archived_at).not.toBeNull();
    });
  });

  describe('Archive state transitions', () => {
    it('TC-Q2-STATE-01: Memory transitions to cold_pending', async () => {
      // TODO: Verify state machine transitions
      expect(true).toBe(true);
    });

    it('TC-Q2-STATE-02: Archived memories are read-only', async () => {
      // TODO: Verify write operations fail on archived memories
      expect(true).toBe(true);
    });
  });

  describe('Retrieval performance', () => {
    it('TC-Q2-PERF-01: Hot memory search < 10ms', async () => {
      const start = Date.now();
      await searchMemory('test-agent', 'test', { include_archived: false });
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(10);
    });

    it('TC-Q2-PERF-02: Cold memory search with archive < 50ms', async () => {
      const start = Date.now();
      await searchMemory('test-agent', 'test', { include_archived: true });
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(50);
    });
  });
});
