#!/usr/bin/env npx ts-node --transpile-only
/**
 * OPT-3 Step A: Build Event Index from LoCoMo dataset
 *
 * Extracts session_summary and event_summary fields (with date prefixes)
 * into a JSONL file for embedding into pgvector (locomo-events- prefix).
 *
 * Output: benchmarks/locomo/data/event-index.jsonl
 * Each record: { sample_id, session_id, kind, text, date, source }
 */

import * as path from 'path';
import * as fs from 'fs';

const DATA_PATH = path.resolve(__dirname, 'data/locomo.json');
const OUT_PATH = path.resolve(__dirname, 'data/event-index.jsonl');

interface EventRecord {
  sample_id: string;
  session_id: string;
  kind: 'session_summary' | 'event';
  text: string;
  date: string;
  source: 'session_summary' | 'event_summary';
  speaker?: string;
}

function buildEventIndex(): void {
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const samples: any[] = Array.isArray(raw) ? raw : Object.values(raw);

  const records: EventRecord[] = [];

  for (const sample of samples) {
    const sampleId: string = sample.sample_id ?? 'unknown';

    // --- session_summary (primary: already contains date) ---
    if (sample.session_summary && typeof sample.session_summary === 'object') {
      for (const [key, text] of Object.entries(sample.session_summary)) {
        // key: "session_1_summary", "session_2_summary", etc.
        const match = key.match(/session_(\d+)_summary/);
        const sessionId = match ? `session_${match[1]}` : key;

        // Extract date from text (e.g. "on 8 May 2023 at 1:56 pm")
        const dateMatch = (text as string).match(/on (\d+ \w+ \d{4})/);
        const date = dateMatch ? dateMatch[1] : '';

        records.push({
          sample_id: sampleId,
          session_id: sessionId,
          kind: 'session_summary',
          text: text as string,
          date,
          source: 'session_summary',
        });
      }
    }

    // --- event_summary (prefix date for temporal anchor) ---
    if (sample.event_summary && typeof sample.event_summary === 'object') {
      for (const [key, sessionEvents] of Object.entries(sample.event_summary)) {
        // key: "events_session_1", etc.
        const match = key.match(/events_session_(\d+)/);
        const sessionId = match ? `session_${match[1]}` : key;

        const evObj = sessionEvents as { [speaker: string]: string[] | string } & { date?: string };
        const date: string = evObj.date ?? '';

        for (const [speaker, eventsRaw] of Object.entries(evObj)) {
          if (speaker === 'date') continue;

          const events: string[] = Array.isArray(eventsRaw)
            ? eventsRaw
            : typeof eventsRaw === 'string'
              ? [eventsRaw]
              : [];

          for (const eventText of events) {
            if (!eventText.trim()) continue;
            // Prefix date for temporal anchoring
            const text = date ? `[${date}] ${eventText}` : eventText;

            records.push({
              sample_id: sampleId,
              session_id: sessionId,
              kind: 'event',
              text,
              date,
              source: 'event_summary',
              speaker,
            });
          }
        }
      }
    }
  }

  // Write JSONL
  const lines = records.map(r => JSON.stringify(r));
  fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf-8');

  // Stats
  const summaryCount = records.filter(r => r.kind === 'session_summary').length;
  const eventCount = records.filter(r => r.kind === 'event').length;
  console.log(`✓ Built event index: ${records.length} records total`);
  console.log(`  session_summary: ${summaryCount}`);
  console.log(`  event:          ${eventCount}`);
  console.log(`  samples:        ${samples.length}`);
  console.log(`  output:         ${OUT_PATH}`);
}

buildEventIndex();
