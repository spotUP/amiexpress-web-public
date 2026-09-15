/**
 * Reading an XIM debug log, and the statistics a report is made of.
 *
 * The log is JSONL: one `XIMLogEntry` per line, written by the backend when
 * XIM_DEBUG_JSON=1. Lines that are not JSON are skipped rather than fatal -
 * a log is appended to by a running board and the last line is routinely a
 * half-written one.
 *
 * DUPLICATION, STATED RATHER THAN HIDDEN: `xim-analyzer.ts` carries its own
 * private `loadMessages` over the same format. It is the older of the two and
 * it works, so it is not being rewritten from under a tool people rely on -
 * but there are now two readers of one format, and the next change to that
 * format has to touch both. The migration is: make XIMAnalyzer.loadMessages
 * call `loadXimLog` and delete its copy.
 */

import * as fs from 'fs';
import * as readline from 'readline';

import type { XIMLogEntry } from '../xim-analyzer';

export type { XIMLogEntry };

export interface LoadOptions {
  door?: string;
  /** Keep SYSTEM entries. Off by default, matching the analyzer. */
  includeSystem?: boolean;
}

export async function loadXimLog(logFile: string, options: LoadOptions = {}): Promise<XIMLogEntry[]> {
  const messages: XIMLogEntry[] = [];
  if (!fs.existsSync(logFile)) return messages;

  const rl = readline.createInterface({
    input: fs.createReadStream(logFile),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry: XIMLogEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // a torn final line, or a non-JSON line someone echoed in
    }
    if (!options.includeSystem && entry.door === 'SYSTEM') continue;
    if (options.door && entry.door !== options.door) continue;
    messages.push(entry);
  }
  return messages;
}

export interface MessageCount {
  type: string;
  sent: number;
  received: number;
  total: number;
}

export interface LogStats {
  total: number;
  sent: number;
  received: number;
  errors: number;
  warnings: number;
  doors: string[];
  nodes: number[];
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  durationMs: number | null;
  byType: MessageCount[];
}

/**
 * Pure: entries in, numbers out. No filesystem, no clock - which is what
 * makes the report's body testable against a fixture.
 */
export function summarise(messages: XIMLogEntry[]): LogStats {
  const byType = new Map<string, MessageCount>();
  const doors = new Set<string>();
  const nodes = new Set<number>();
  let sent = 0;
  let received = 0;
  let errors = 0;
  let warnings = 0;

  for (const m of messages) {
    const type = m.message?.type ?? 'UNKNOWN';
    const row = byType.get(type) ?? { type, sent: 0, received: 0, total: 0 };
    if (m.direction === 'send') { row.sent++; sent++; } else { row.received++; received++; }
    row.total++;
    byType.set(type, row);

    if (m.door) doors.add(m.door);
    if (typeof m.node === 'number') nodes.add(m.node);
    if (m.level === 'error') errors++;
    if (m.level === 'warn') warnings++;
  }

  const stamps = messages
    .map((m) => m.timestamp)
    .filter((t): t is string => typeof t === 'string' && !Number.isNaN(Date.parse(t)))
    .sort();
  const first = stamps[0] ?? null;
  const last = stamps[stamps.length - 1] ?? null;

  return {
    total: messages.length,
    sent,
    received,
    errors,
    warnings,
    doors: [...doors].sort(),
    nodes: [...nodes].sort((a, b) => a - b),
    firstTimestamp: first,
    lastTimestamp: last,
    durationMs: first && last ? Date.parse(last) - Date.parse(first) : null,
    // Busiest first: a report is read from the top, and the type that
    // dominates a session is usually the one being asked about.
    byType: [...byType.values()].sort((a, b) => b.total - a.total || a.type.localeCompare(b.type)),
  };
}
