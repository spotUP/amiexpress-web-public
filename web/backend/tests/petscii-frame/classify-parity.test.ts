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

  it('holds no second implementation', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/utils/ascii-art.util.ts'), 'utf8');
    expect(src).toContain("from '@amiexpress/bbs-door-sdk/petscii/frame'");
    expect(src).not.toMatch(/punctuationRatio|longSpaceRuns|artChars/);
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
