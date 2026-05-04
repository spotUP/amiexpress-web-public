/**
 * Regression: SDK List widget's 50ms keypress debounce must apply ONLY to
 * navigation keys (arrows / page / home / end / vi hjkl-gG), not to
 * type-to-search, enter, or escape.
 *
 * Background:
 *   The original code had a blanket gate at the top of List._onKeypress:
 *
 *     const now = Date.now();
 *     if (now - this._lastKeyTime < 50) return true; // Handled (ignored)
 *     this._lastKeyTime = now;
 *
 *   Every key — arrow, letter, enter, escape — went through that gate, so
 *   anything the user typed within 50ms of a previous key was silently
 *   dropped. Two real-world consequences:
 *
 *   1. Type-to-search lost characters above ~20 chars/sec. Anyone typing
 *      "doors" at normal speed (~6 chars/sec is fine, but a quick burst
 *      drops chars).
 *   2. The DOORMAN freeze report (#14) — when keys queued during a render
 *      pause arrived in a burst, most got eaten by this gate, contributing
 *      to the user's experience of "I pressed keys and nothing happened."
 *
 *   The fix scopes the debounce to navigation keys only. Holding the down
 *   arrow still throttles to 20Hz (so the eye can follow), but typing
 *   letters / pressing enter / pressing escape never drops a key.
 *
 * The SDK's own test runner doesn't pick up ts-jest config (jest defaults
 * to babel which can't parse `as` syntax), so we guard at the source level
 * from the backend test suite where ts-jest does work.
 */

import * as fs from 'fs';
import * as path from 'path';

const LIST_TS_PATH = path.resolve(
  __dirname,
  '../../../../sdk/engines/ui/blessed/widgets/list.ts'
);

describe('SDK List._onKeypress debounce scope (regression for #14)', () => {
  let src: string;
  let onKeypressBody: string;

  beforeAll(() => {
    src = fs.readFileSync(LIST_TS_PATH, 'utf8');

    // Carve out the _onKeypress method body. The method ends with the
    // function-level `}` at indent 2.
    const m = src.match(/_onKeypress\s*\([^)]*\)\s*:[^{]*\{([\s\S]*?)\n  \}/);
    expect(m).not.toBeNull();
    onKeypressBody = m![1];
  });

  test('list.ts _onKeypress is locatable', () => {
    expect(onKeypressBody).toBeDefined();
    expect(onKeypressBody.length).toBeGreaterThan(100);
  });

  test('the debounce check is wrapped in an isNavKey gate, not at the top of the function', () => {
    // After the fix, the gate updates _lastKeyTime ONLY when isNavKey is true.
    // Look for `if (isNavKey)` block containing the _lastKeyTime read+write.
    const navGateMatch = onKeypressBody.match(
      /if\s*\(\s*isNavKey\s*\)\s*\{[\s\S]*?_lastKeyTime[\s\S]*?\}/
    );
    expect(navGateMatch).not.toBeNull();
    // The gate must contain both the comparison and the assignment so that
    // a partial revert (e.g. removing only the read) still trips this test.
    expect(navGateMatch![0]).toMatch(/_lastKeyTime\s*<\s*50/);
    expect(navGateMatch![0]).toMatch(/_lastKeyTime\s*=\s*now/);
  });

  test('the legacy unconditional drop ("if (now - this._lastKeyTime < 50) return true;" right after the focus check) is gone', () => {
    // The original buggy form appeared at the top of the function, BEFORE
    // any branch — i.e. between the `!this.focused` early-return and the
    // first `if (key.name === ...)` check. After the fix it lives inside
    // an `if (isNavKey)` guard.
    //
    // Match the path "early-return → optional comments → bare debounce".
    const buggyShape = onKeypressBody.match(
      /if\s*\(\s*!this\.interactive[\s\S]{0,400}?if\s*\(\s*now\s*-\s*this\._lastKeyTime\s*<\s*50\s*\)\s*return\s+true/
    );
    // If the buggy shape matches AND it's NOT inside an isNavKey block,
    // we've regressed. The post-fix shape has `isNavKey` declared between
    // the early-return and the gate, so the buggy regex above shouldn't
    // match because the 400-char window picks up the isNavKey assignment.
    if (buggyShape) {
      // Allow the match only if it's clearly inside the isNavKey block.
      expect(buggyShape[0]).toMatch(/isNavKey/);
    }
  });

  test('isNavKey covers up/down/left/right/pageup/pagedown/home/end + vi k/j/g/G', () => {
    // The list of names the gate guards must include all directional
    // navigation. If anyone narrows the gate, type-to-search starts being
    // throttled again on those keys.
    const m = onKeypressBody.match(/const\s+isNavKey\s*=([\s\S]*?);/);
    expect(m).not.toBeNull();
    const decl = m![1];
    for (const name of ['up', 'down', 'left', 'right', 'pageup', 'pagedown', 'home', 'end']) {
      expect(decl).toMatch(new RegExp(`['"]${name}['"]`));
    }
    // vi mode keys
    for (const ch of ['k', 'j', 'g', 'G']) {
      expect(decl).toMatch(new RegExp(`['"]${ch}['"]`));
    }
  });

  test('isNavKey does NOT cover enter / space / escape / letters', () => {
    const m = onKeypressBody.match(/const\s+isNavKey\s*=([\s\S]*?);/);
    expect(m).not.toBeNull();
    const decl = m![1];
    // None of these belong in the nav-key set.
    for (const name of ['enter', 'space', 'escape']) {
      expect(decl).not.toMatch(new RegExp(`key\\.name\\s*===\\s*['"]${name}['"]`));
    }
  });

  test('the type-to-search branch is reachable without going through a debounce gate', () => {
    // Find the type-to-search branch (matches /[a-zA-Z0-9]/.test(ch)).
    // Between the gate and this branch there must NOT be an unconditional
    // `return true` based on _lastKeyTime — otherwise type-to-search is
    // blocked when the user types within 50ms of an arrow.
    const searchBranch = onKeypressBody.match(/\/\[a-zA-Z0-9\]\/\.test\(ch\)/);
    expect(searchBranch).not.toBeNull();

    // Slice the body from the start to the search branch — there should
    // be no bare `return true;` that comes after a `_lastKeyTime` check
    // outside of an isNavKey block.
    const idx = onKeypressBody.indexOf(searchBranch![0]);
    const prefix = onKeypressBody.slice(0, idx);
    // Count occurrences of `_lastKeyTime` in the prefix — there should be
    // exactly two (the comparison and the assignment), both inside the
    // isNavKey block.
    const matches = prefix.match(/_lastKeyTime/g) || [];
    expect(matches.length).toBe(2);
  });

  test('arrow nav (down/up) call sites still log [List] for diagnostic visibility, gated behind SDK_LOG_LIST=1', () => {
    // The original code logged unconditionally on every arrow; with the
    // mouse log gate (SDK_LOG_MOUSE) added in the same area, list logs
    // moved behind SDK_LOG_LIST so the BBS log doesn't accumulate them
    // in normal operation but they're available for debugging.
    expect(onKeypressBody).toMatch(/SDK_LOG_LIST.*\[List\]\s+(UP|DOWN)/);
  });
});
