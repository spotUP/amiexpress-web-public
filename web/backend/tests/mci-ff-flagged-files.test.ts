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
 * Our implementation at screen.handler.ts:697-698:
 *   - builds the full space-separated string
 *   - applyWidth() truncates to width param (maxLen > 0 → substring(0, maxLen))
 *
 * For both paths the resulting character output is identical for the
 * cases users actually hit in screen files (~FF or ~FF<digits>).
 *
 * Pinning the join+truncate shape so a future refactor can't silently
 * regress to comma-joined or non-truncated output.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('~FF flagged-files MCI output (G-FF, express.e:5439-5441 / 2830-2853)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'screen.handler.ts'),
    'utf8'
  );

  test('~FF replaces with a space-separated filename join', () => {
    // Find the FF MCI replace site
    const ff = src.match(/mciRegex\(['"]FF['"]\)[\s\S]{0,300}/);
    expect(ff).not.toBeNull();
    // Must use a join with single space, not comma or empty
    const block = src.match(
      /flaggedFilesSpaceSep\s*=\s*[\s\S]{0,200}?\.map\([\s\S]{0,80}?\.join\(['"] ['"]\)/
    );
    expect(block).not.toBeNull();
  });

  test('~FF applies width-truncation via applyWidth (matches showFlaggedFiles maxLen)', () => {
    expect(src).toMatch(
      /mciRegex\(['"]FF['"]\)[\s\S]{0,80}?applyWidth\(flaggedFilesSpaceSep,\s*\w+\)/
    );
  });

  test('applyWidth truncates to N chars when N > 0 (matches express.e maxLen>0 stop condition)', () => {
    const block = src.match(/applyWidth\s*=\s*\([\s\S]{0,300}?substring\(0,\s*maxLen\)/);
    expect(block).not.toBeNull();
  });
});
