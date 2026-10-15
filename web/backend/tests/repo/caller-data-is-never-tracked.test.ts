/**
 * THE BOARD'S CALLERS NEVER GO INTO GIT.
 *
 * This repository IS the live board, and it was PUBLIC until 2026-09-08. Its
 * history carries the user database, 73 questionnaire files and 43 caller
 * logs, and a history rewrite is under way to purge them
 * (`thoughts/shared/plans/2026-09-08-history-scrub.md`).
 *
 * A rewrite fixes the past once. This fixes the future, which is the half that
 * actually failed: every one of those files arrived through a BULK ADD -
 * "restore Node0-40 and SysopStats to git for Docker build" - by somebody who
 * was not thinking about callers at all. `.gitignore` had `Node<n>/Answers` and
 * `Node<n>/CallersLog` at the time and they still got in, because:
 *
 *   - git matches paths CASE-SENSITIVELY and the board's filesystem does not,
 *     so `Node2/answers` walked straight past `Node<n>/Answers`; and
 *   - AmiExpress renames through artifacts like `Node2/.!99887!answers`, which
 *     looks nothing like the name anyone thought to ignore. That one was
 *     183,930 bytes and held 52 e-mail addresses.
 *
 * So the rule is asserted on what git TRACKS, not on what `.gitignore` says,
 * and it is spelled case-insensitively on purpose.
 *
 * If this test fails: do NOT add the path to the allowlist. Untrack it
 * (`git rm --cached <path>` - the file stays on your disk), widen
 * `.gitignore`, and tell whoever owns the history scrub, because a file that
 * reached HEAD is a file the rewrite will carry into the new history.
 */
import * as path from 'path';
import { trackedPaths } from './tracked-path-scan';

// tests/repo -> tests -> web/backend -> web -> the checkout root.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

/**
 * What a caller's data looks like, whatever it is called.
 *
 * Matched against the whole tracked path, case-insensitively. Deliberately
 * wider than the names seen so far: the two that got through were both
 * spellings nobody predicted.
 */
const CALLER_DATA = [
  { rule: /(^|\/)node\d+\/.*answers/i, what: 'caller questionnaire answers' },
  { rule: /(^|\/)node\d+\/.*callerslog/i, what: 'a caller log' },
  { rule: /(^|\/)node\d+\/door\.sys$/i, what: 'a door drop file naming the caller online' },
  { rule: /(^|\/)node\d+\/dorinfo.*\.def$/i, what: 'a door drop file naming the caller online' },
  { rule: /(^|\/)users?\.data$/i, what: 'the user database' },
  { rule: /(^|\/)mini_callerslog$/i, what: 'a caller log' },
  { rule: /(^|\/)\.env$/i, what: 'a credential file' },
];

/**
 * Synthetic boards. Every entry here is checked in the test below to be small
 * enough that it cannot be a real user base - a real one is tens of KB - so
 * the allowlist cannot quietly grow to cover a live file.
 */
const SYNTHETIC = new Set([
  'web/backend/tests/fixtures/amiga-board/User.data',
  'web/backend/tests/fixtures/amiga-board/Node1/CallersLog',
]);

/** A synthetic fixture is a handful of records; the live board is thousands. */
const SYNTHETIC_MAX_BYTES = 4096;

describe('caller data is never tracked', () => {
  const tracked = trackedPaths(REPO_ROOT);

  test('no tracked path holds a caller\'s data', () => {
    // A `git archive` extraction is not a work tree. Nothing to assert there:
    // whatever it contains is by definition what git tracked.
    if (!tracked) return;

    const offences: string[] = [];
    for (const p of tracked) {
      if (SYNTHETIC.has(p)) continue;
      const hit = CALLER_DATA.find(({ rule }) => rule.test(p));
      if (hit) offences.push(`  ${p}  - ${hit.what}`);
    }

    expect(offences.join('\n')).toBe('');
  });

  test('the synthetic allowlist cannot hide a real user base', () => {
    if (!tracked) return;

    const fs = require('fs') as typeof import('fs');
    for (const p of SYNTHETIC) {
      // Allowlisting a path that is no longer tracked is dead weight that will
      // silently cover a future file of the same name.
      expect(tracked.has(p)).toBe(true);
      const bytes = fs.statSync(path.join(REPO_ROOT, p)).size;
      expect(bytes).toBeLessThanOrEqual(SYNTHETIC_MAX_BYTES);
    }
  });
});
