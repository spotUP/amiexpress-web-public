/**
 * `looksLikeAsciiArt` / `positionsCursorAbsolutely` used to exist twice - once
 * in web/backend/src/utils/ascii-art.util.ts, once as a verbatim port in
 * sdk/petscii/frame/classify.ts (the SDK cannot import web/backend) - and this
 * file was the line-for-line parity table that kept the two copies equal.
 *
 * Phase 3 Task 1 gave the frame module a package export, so the backend file is
 * now a RE-EXPORT and the copies can no longer drift. What is worth pinning
 * changed with it: that the re-export is real (same function OBJECTS, not
 * equal-behaving twins), that no second implementation crept back into the
 * backend file, and that the captured door corpus still runs through it.
 *
 * These two detectors are FROZEN: they run on the 80-COLUMN path (xim/io.ts's
 * line-wrap safety net, wrapForSession, DIR listings). The C64 ladder's own
 * routing lives in classifyRow/chooseRule, which no ANSI session reaches.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as backend from '../../src/utils/ascii-art.util';
import * as sdk from '@amiexpress/bbs-door-sdk/petscii/frame';

const STRIP = /\x1b\[[0-9;?]*[A-Za-z]/g;
const FIXTURES = path.resolve(__dirname, '../../../../sdk/tests/petscii/frame/fixtures');

describe('ascii-art.util.ts re-exports the SDK classifier', () => {
  it('exports the SAME function objects, not copies', () => {
    expect(backend.looksLikeAsciiArt).toBe(sdk.looksLikeAsciiArt);
    expect(backend.positionsCursorAbsolutely).toBe(sdk.positionsCursorAbsolutely);
  });

  /*
   * REWRITTEN 2026-09-16. This used to read `ascii-art.util.ts` and assert
   * that its TEXT mentioned the SDK import and did not mention three of the
   * classifier's internal variable names. Both halves are weak: the import
   * line proves nothing about what is exported, and the three names are a
   * guess at what a re-implementation would happen to call its locals.
   *
   * The property is identity, and the test above already has it for two
   * functions. Stated over EVERY export it also catches the case the regex
   * could not: a THIRD function added here and implemented locally.
   */
  it('re-exports the SDK and implements nothing of its own', () => {
    const shared = Object.keys(backend).filter((name) => name in sdk);
    // A re-export module with nothing in common with the SDK would pass an
    // empty loop, so the count is part of the claim.
    expect(shared.length).toBeGreaterThanOrEqual(2);

    for (const name of Object.keys(backend)) {
      const mine = (backend as Record<string, unknown>)[name];
      if (typeof mine !== 'function') continue;
      expect(name in sdk).toBe(true);
      expect(mine).toBe((sdk as Record<string, unknown>)[name]);
    }
  });

  it('still classifies every line of every captured door capture', () => {
    const files = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.ans') || f.endsWith('.txt'));
    expect(files.length).toBeGreaterThanOrEqual(8);
    let nonBlank = 0;
    for (const f of files) {
      const text = fs.readFileSync(path.join(FIXTURES, f), 'latin1').replace(STRIP, '');
      for (const l of text.split(/\r?\n|\r/)) {
        if (l.trim().length > 0) nonBlank++;
        expect(typeof backend.looksLikeAsciiArt(l)).toBe('boolean');
        expect(typeof backend.positionsCursorAbsolutely(l)).toBe('boolean');
      }
    }
    expect(nonBlank).toBeGreaterThan(100);
  });
});
