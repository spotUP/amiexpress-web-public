/**
 * ONE reader for the XIM log format.
 *
 * `xim-log.ts` and `XIMAnalyzer.loadMessages` both read the same JSONL, and
 * the file said so in its own header: "there are now two readers of one
 * format, and the next change to that format has to touch both. The
 * migration is: make XIMAnalyzer.loadMessages call loadXimLog and delete its
 * copy."
 *
 * This is that migration's proof. It drives the ANALYZER's public entry point
 * - `analyze()`, which is the only way in - over a fixture built out of the
 * three things the format actually does wrong in the wild:
 *
 *   a SYSTEM line, which neither reader may return;
 *   a torn final line, because a running board appends while you read;
 *   two doors, so the door filter has something to exclude.
 *
 * Run: npx tsx dev/scripts/lib/xim-one-reader.test.ts
 * (dev scripts have no CI suite - same footing as xim-report.test.ts.)
 */

/* eslint-disable no-console */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { loadXimLog, type XIMLogEntry } from './xim-log';
import { XIMAnalyzer } from '../xim-analyzer';

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  [OK] ${name}`); })
    .catch((err) => { failures.push(name); console.log(`  [FAIL] ${name}: ${String(err)}`); });
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const entry = (door: string, type: string, direction: 'send' | 'receive'): XIMLogEntry => ({
  timestamp: new Date().toISOString(),
  level: 'debug',
  direction,
  door,
  node: 1,
  message: { type, typeCode: 1, dataLen: 4, dataText: 'test' },
});

function writeFixture(dir: string): string {
  const file = path.join(dir, 'xim-debug.json');
  const lines = [
    JSON.stringify(entry('SYSTEM', 'XIM_INIT', 'send')),
    JSON.stringify(entry('WHO', 'XIM_TEXT', 'send')),
    JSON.stringify(entry('WHO', 'XIM_TEXT', 'receive')),
    JSON.stringify(entry('THEMEC', 'XIM_TEXT', 'send')),
    '',
    '{"timestamp":"2026-09-15T00:00:00.000Z","level":"deb',  // torn, mid-write
  ];
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  return file;
}

async function main(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xim-one-reader-'));
  const file = writeFixture(dir);

  try {
    await check('loadXimLog drops SYSTEM and the torn line', async () => {
      const all = await loadXimLog(file);
      assert(all.length === 3, `expected 3 entries, got ${all.length}`);
      assert(all.every((m) => m.door !== 'SYSTEM'), 'a SYSTEM entry came back');
    });

    await check('loadXimLog honours the door filter', async () => {
      const who = await loadXimLog(file, { door: 'WHO' });
      assert(who.length === 2, `expected 2 WHO entries, got ${who.length}`);
    });

    await check('includeSystem is the only way to see SYSTEM', async () => {
      const all = await loadXimLog(file, { includeSystem: true });
      assert(all.length === 4, `expected 4 entries, got ${all.length}`);
    });

    // The analyzer has no public reader - analyze() is the entry point, and
    // its NO_MESSAGES answer is exactly "the reader returned nothing". That
    // makes it a usable probe for what the reader let through.
    await check('the analyzer sees the same messages through its own entry point', async () => {
      const issues = await new XIMAnalyzer().analyze(file, 'WHO');
      assert(
        !issues.some((i) => i.pattern === 'NO_MESSAGES'),
        'the analyzer found no WHO messages, so its reader disagrees with loadXimLog',
      );
    });

    await check('the analyzer filters by door the same way', async () => {
      const issues = await new XIMAnalyzer().analyze(file, 'NOSUCHDOOR');
      assert(
        issues.some((i) => i.pattern === 'NO_MESSAGES'),
        'a door with no messages should read as NO_MESSAGES',
      );
    });

    await check('the analyzer does not count SYSTEM as a door', async () => {
      const issues = await new XIMAnalyzer().analyze(file, 'SYSTEM');
      assert(
        issues.some((i) => i.pattern === 'NO_MESSAGES'),
        'SYSTEM entries must never reach a caller of the analyzer',
      );
    });

    await check('a missing log is empty, never a throw', async () => {
      const none = await loadXimLog(path.join(dir, 'does-not-exist.json'));
      assert(none.length === 0, 'a missing file should read as no messages');
      const issues = await new XIMAnalyzer().analyze(path.join(dir, 'does-not-exist.json'));
      assert(issues.some((i) => i.pattern === 'NO_MESSAGES'), 'a missing file should read as NO_MESSAGES');
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

void main();
