/**
 * The XIM recording comparison.
 *
 * Run: npx tsx dev/scripts/lib/xim-regression.test.ts
 * (dev scripts have no CI suite - same footing as managed-process.test.ts.)
 *
 * The two properties worth the file: a sequence change is always caught, and
 * timing jitter is never reported as a regression. The second is what decides
 * whether anyone keeps running the tool.
 */

/* eslint-disable no-console */

import {
  compareRecordings,
  errorRate,
  failed,
  formatReport,
  type Recording,
  type RecordedMessage,
} from './xim-regression';

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  [OK] ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const msg = (type: string, param = 0, delay = 100, data = ''): RecordedMessage => ({
  type, param, data, delay, timestamp: '2026-09-15T10:00:00.000Z', comment: '',
});

const rec = (messages: RecordedMessage[], duration = 1): Recording => ({
  version: '1.0', door: 'WHO', recorded: '2026-09-15T10:00:00.000Z',
  duration, messageCount: messages.length, description: 'test', messages,
});

check('an identical recording is clean', () => {
  const r = compareRecordings(rec([msg('JH_INIT'), msg('JH_WRITE')]), rec([msg('JH_INIT'), msg('JH_WRITE')]));
  assert(r.ok, `expected clean, got ${JSON.stringify(r.findings)}`);
  assert(!failed(r, false), 'clean must not fail');
  assert(!failed(r, true), 'clean must not fail even strict');
});

check('a message that stopped being sent is caught', () => {
  const r = compareRecordings(rec([msg('JH_INIT'), msg('JH_WRITE')]), rec([msg('JH_INIT')]));
  assert(r.findings.some((f) => f.kind === 'missing-message'), 'no missing-message finding');
  assert(failed(r, false), 'a missing message must fail even without --strict');
});

check('a message that appeared is caught', () => {
  const r = compareRecordings(rec([msg('JH_INIT')]), rec([msg('JH_INIT'), msg('JH_CLOSE')]));
  assert(r.findings.some((f) => f.kind === 'extra-message'), 'no extra-message finding');
  assert(failed(r, false), 'an extra message must fail');
});

check('a changed type is reported once, not as type AND param', () => {
  const r = compareRecordings(rec([msg('JH_WRITE', 1)]), rec([msg('JH_READ', 9)]));
  assert(r.findings.length === 1, `expected 1 finding, got ${r.findings.length}`);
  assert(r.findings[0].kind === 'type-changed', 'wrong kind');
});

check('a changed param on the same message is caught', () => {
  const r = compareRecordings(rec([msg('JH_WRITE', 1)]), rec([msg('JH_WRITE', 2)]));
  assert(r.findings.some((f) => f.kind === 'param-changed'), 'no param-changed finding');
  assert(failed(r, false), 'a changed param must fail');
});

check('data is ignored unless asked for, because it carries names and clocks', () => {
  const quiet = compareRecordings(rec([msg('JH_WRITE', 0, 100, 'SPOT')]), rec([msg('JH_WRITE', 0, 100, 'ZAPHOD')]));
  assert(quiet.ok, 'data must not be compared by default');
  const loud = compareRecordings(
    rec([msg('JH_WRITE', 0, 100, 'SPOT')]),
    rec([msg('JH_WRITE', 0, 100, 'ZAPHOD')]),
    { compareData: true },
  );
  assert(loud.findings.some((f) => f.kind === 'data-changed'), 'compareData did not compare');
});

check('a real slowdown is reported', () => {
  const r = compareRecordings(rec([msg('JH_WRITE', 0, 100)]), rec([msg('JH_WRITE', 0, 200)]));
  assert(r.findings.some((f) => f.kind === 'timing-slower'), 'a doubling was not reported');
});

check('sub-millisecond jitter is NOT reported, however large the ratio', () => {
  // 0.1ms -> 0.4ms is +300%, and it means nothing at all.
  const r = compareRecordings(rec([msg('JH_WRITE', 0, 0.1)]), rec([msg('JH_WRITE', 0, 0.4)]));
  assert(r.ok, `jitter leaked through: ${JSON.stringify(r.findings)}`);
});

check('a slowdown under the ratio is not reported either', () => {
  const r = compareRecordings(rec([msg('JH_WRITE', 0, 1000)]), rec([msg('JH_WRITE', 0, 1050)]));
  assert(r.ok, `5% should be quiet: ${JSON.stringify(r.findings)}`);
});

check('getting FASTER is never a finding', () => {
  const r = compareRecordings(rec([msg('JH_WRITE', 0, 500)], 5), rec([msg('JH_WRITE', 0, 10)], 1));
  assert(r.ok, `speeding up was reported: ${JSON.stringify(r.findings)}`);
});

check('a timing finding warns but does not fail, until --strict', () => {
  const r = compareRecordings(rec([msg('JH_WRITE', 0, 100)]), rec([msg('JH_WRITE', 0, 400)]));
  assert(!failed(r, false), 'timing alone must not fail a normal run');
  assert(failed(r, true), '--strict must fail on timing');
});

check('a slower session overall is caught', () => {
  const r = compareRecordings(rec([msg('JH_INIT', 0, 1)], 10), rec([msg('JH_INIT', 0, 1)], 20));
  assert(r.findings.some((f) => f.kind === 'session-slower'), 'no session-slower finding');
});

check('more errors than before is caught and fails', () => {
  const r = compareRecordings(
    rec([msg('JH_INIT'), msg('JH_WRITE')]),
    rec([msg('JH_INIT'), msg('JH_ERROR')]),
  );
  assert(r.findings.some((f) => f.kind === 'error-rate-up'), 'no error-rate-up finding');
  assert(failed(r, false), 'more errors must fail');
});

check('errorRate counts what the recorder called an error', () => {
  assert(errorRate([]) === 0, 'empty is 0');
  assert(errorRate([msg('JH_INIT'), msg('JH_ERROR')]) === 0.5, 'half');
  assert(
    errorRate([{ ...msg('JH_WRITE'), comment: 'write failed' }]) === 1,
    'a comment naming a failure counts',
  );
});

check('an empty baseline against a real run reads as all-new, not as clean', () => {
  const r = compareRecordings(rec([]), rec([msg('JH_INIT')]));
  assert(!r.ok, 'an empty baseline must not pass silently');
  assert(r.findings.every((f) => f.kind === 'extra-message'), 'wrong kinds');
});

check('the printed report uses ASCII tokens and names the door', () => {
  const r = compareRecordings(rec([msg('JH_INIT')]), rec([msg('JH_CLOSE')]));
  const text = formatReport(r);
  assert(text.includes('WHO'), 'door not named');
  assert(text.includes('[FAIL]'), 'no ASCII token');
  assert(!/[\u{1F300}-\u{1FAFF}]/u.test(text), 'emoji in output');
});

console.log('');
console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
