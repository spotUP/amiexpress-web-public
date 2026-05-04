/**
 * Regression test for G-FF: ~FF flagged-files MCI output matches the
 * character output of express.e showFlaggedFiles(maxLen).
 *
 * express.e:2830-2853 showFlaggedFiles(maxLen):
 *   - emits filenames separated by single spaces
 *   - if maxLen > 0, truncates so total chars emitted <= maxLen
 *   - if maxLen = -1, emits full list
 *   - decrements maxLen as it emits each space and filename; stops when no room
 *
 * Our implementation pipes the value through the shared MCI tokenizer
 * (`src/utils/mci-tokenizer.util.ts`) via the `userInfoDispatch.FF`
 * entry. The tokenizer's `applyMciWidth(value, w)` matches the
 * maxLen > 0 → substring(0, w) path.
 *
 * Pinning:
 *   1. The dispatch entry exists and routes through applyMciWidth.
 *   2. The space-join still happens (not comma/empty).
 *   3. applyMciWidth itself uses substring with width.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('~FF flagged-files MCI output (G-FF, express.e:5439-5441 / 2830-2853)', () => {
  const screenSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'screen.handler.ts'),
    'utf8'
  );
  const tokenizerSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'utils', 'mci-tokenizer.util.ts'),
    'utf8'
  );

  test('FF dispatch entry exists and applies width via applyMciWidth on the space-separated join', () => {
    // Dispatch shape: `FF: (w) => applyMciWidth(flaggedFilesSpaceSep, w),`
    expect(screenSrc).toMatch(
      /FF:\s*\(\s*w\s*\)\s*=>\s*applyMciWidth\(\s*flaggedFilesSpaceSep\s*,\s*w\s*\)/,
    );
  });

  test('flaggedFilesSpaceSep uses a space join (not comma / empty / list builder)', () => {
    expect(screenSrc).toMatch(
      /flaggedFilesSpaceSep\s*=\s*[\s\S]{0,200}?\.map\([\s\S]{0,80}?\.join\(['"] ['"]\)/,
    );
  });

  test('applyMciWidth truncates to N chars when N > 0 (matches express.e maxLen>0 stop condition)', () => {
    // applyMciWidth lives in the shared tokenizer utility now.
    expect(tokenizerSrc).toMatch(
      /export function applyMciWidth\([\s\S]{0,200}?substring\(0,\s*width\)/,
    );
  });
});
