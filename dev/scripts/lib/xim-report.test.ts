/**
 * The report body, against a fixture.
 *
 * Run: npx tsx dev/scripts/lib/xim-report.test.ts
 * (dev scripts have no CI suite - same footing as managed-process.test.ts.)
 */

/* eslint-disable no-console */

import { summarise, type XIMLogEntry } from './xim-log';
import { renderHtml, renderMarkdown } from './xim-report';
import type { DetectedIssue } from '../xim-analyzer';

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  [OK] ${name}`); }
  catch (err) {
    failures.push(name);
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${err instanceof Error ? err.message : String(err)}`);
  }
}
function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }

const entry = (
  type: string,
  direction: 'send' | 'receive',
  level: XIMLogEntry['level'] = 'info',
  timestamp = '2026-09-15T10:00:00.000Z',
  door = 'WHO',
): XIMLogEntry => ({
  timestamp, level, direction, door, node: 1,
  message: { type, typeCode: 1, param: 0 },
});

check('summarise counts direction, levels, doors and nodes', () => {
  const s = summarise([
    entry('JH_INIT', 'send'),
    entry('JH_WRITE', 'send'),
    entry('JH_WRITE', 'receive', 'error'),
  ]);
  assert(s.total === 3, 'total');
  assert(s.sent === 2 && s.received === 1, 'directions');
  assert(s.errors === 1, 'errors');
  assert(s.doors.join() === 'WHO', 'doors');
  assert(s.nodes.join() === '1', 'nodes');
});

check('message types come back busiest first', () => {
  const s = summarise([
    entry('JH_INIT', 'send'),
    entry('JH_WRITE', 'send'),
    entry('JH_WRITE', 'send'),
  ]);
  assert(s.byType[0].type === 'JH_WRITE', `expected JH_WRITE first, got ${s.byType[0].type}`);
  assert(s.byType[0].total === 2, 'count');
});

check('duration comes from the first and last stamp, in any order', () => {
  const s = summarise([
    entry('B', 'send', 'info', '2026-09-15T10:00:05.000Z'),
    entry('A', 'send', 'info', '2026-09-15T10:00:00.000Z'),
  ]);
  assert(s.durationMs === 5000, `expected 5000, got ${s.durationMs}`);
});

check('an empty log summarises to zeroes, not to NaN', () => {
  const s = summarise([]);
  assert(s.total === 0 && s.durationMs === null, 'empty');
  assert(!Number.isNaN(s.sent) && !Number.isNaN(s.received), 'no NaN');
});

const issue = (severity: DetectedIssue['severity'], title: string, confidence = 90): DetectedIssue => ({
  pattern: 'TEST', severity, title, confidence,
  evidence: ['something happened'], suggestedFix: 'do the thing',
});

check('the headline says CRITICAL when there is one', () => {
  const md = renderMarkdown({
    stats: summarise([entry('JH_INIT', 'send')]),
    issues: [issue('critical', 'Door never initialised')],
    logFile: 'logs/x.json', door: 'WHO', generatedAt: 'NOW',
  });
  assert(md.includes('1 critical issue'), 'no critical headline');
  assert(md.includes('[CRITICAL]'), 'no ASCII severity token');
});

check('the headline says clean when nothing was found', () => {
  const md = renderMarkdown({
    stats: summarise([entry('JH_INIT', 'send')]),
    issues: [], logFile: 'logs/x.json', generatedAt: 'NOW',
  });
  assert(md.includes('Nothing detected'), 'no clean headline');
});

check('an EMPTY log never reads as a clean bill of health', () => {
  // The trap this guards: a report generated from a log with no messages
  // must not look like a door that was checked and found healthy.
  const md = renderMarkdown({
    stats: summarise([]), issues: [], logFile: 'logs/x.json', generatedAt: 'NOW',
  });
  assert(md.includes('No XIM messages'), 'empty log not called out');
  assert(!md.includes('Nothing detected'), 'empty log read as clean');
});

check('critical issues sort above warnings', () => {
  const md = renderMarkdown({
    stats: summarise([entry('JH_INIT', 'send')]),
    issues: [issue('warning', 'Later thing'), issue('critical', 'Earlier thing')],
    logFile: 'logs/x.json', generatedAt: 'NOW',
  });
  assert(md.indexOf('Earlier thing') < md.indexOf('Later thing'), 'not sorted by severity');
});

check('the report carries no emoji', () => {
  const md = renderMarkdown({
    stats: summarise([entry('JH_INIT', 'send')]),
    issues: [issue('critical', 'x'), issue('info', 'y')],
    logFile: 'logs/x.json', generatedAt: 'NOW',
  });
  assert(!/[\u{1F300}-\u{1FAFF}]/u.test(md), 'emoji found');
});

check('HTML escapes the log content instead of injecting it', () => {
  const html = renderHtml({
    stats: summarise([]), issues: [issue('critical', '<script>alert(1)</script>')],
    logFile: 'logs/x.json', generatedAt: 'NOW',
  });
  assert(!html.includes('<script>alert(1)</script>'), 'unescaped markup reached the page');
  assert(html.includes('&lt;script&gt;'), 'not escaped');
});

console.log('');
console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
