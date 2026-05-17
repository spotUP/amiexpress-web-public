/**
 * Regression test for screen-loader filename-variant ordering.
 *
 * Bug: on the production Linux Alpine container, the live volume had
 *   /app/data/bbs/Screens/BBSTITLE.TXT  (stale, May 4)
 *   /app/data/bbs/Screens/BBSTITLE.txt  (current, May 17)
 *
 * The variant list put `.TXT` (uppercase) before `.txt`, so the loader
 * picked the stale uppercase file. The stale file lacked the trailing
 * `~SMC|` slow-mode-clear MCI, so slowmo stayed engaged through render
 * and the BBSTITLE wrap path emitted hide-cursor + cursor-home after
 * the art; the login prompt then printed inside the ASCII banner.
 *
 * The variant lists live inline inside loadScreenFile (not exported)
 * so this test inspects the source string directly. It's a structural
 * test — if the file is reorganised the regex won't match and the
 * test will fail loudly, prompting whoever refactored to add a real
 * unit test for the new arrangement.
 *
 * Why source-string and not behavioural? macOS' default APFS is
 * case-insensitive, so we can't create both .txt and .TXT in a tmp
 * dir; and jest's module-mocking can't redefine amigafs.existsSync
 * (TS module objects are sealed). The fix is a one-line ordering
 * change, so a structural check is proportionate.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('loadScreenFile — filename-variant ordering (regression)', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../src/handlers/screen.handler.ts'),
    'utf8',
  );

  function lowerBeforeUpper(haystack: string, name: string): void {
    const lowerIdx = haystack.indexOf(`'${name}.txt'`);
    const upperIdx = haystack.indexOf(`'${name}.TXT'`);
    if (lowerIdx < 0 || upperIdx < 0) {
      throw new Error(
        `Could not locate both '${name}.txt' and '${name}.TXT' literals. ` +
          `The screen-loader variant list may have been refactored; add a ` +
          `behavioural test in its place.`,
      );
    }
    expect(lowerIdx).toBeLessThan(upperIdx);
  }

  it('BBSTITLE special-case list tries .txt before .TXT', () => {
    // The literal looks like: return ['BBSTITLE.txt', 'BBSTITLE.TXT', 'BBSTITLE'];
    const bbsTitleArray = src.match(/return\s*\[\s*'BBSTITLE\.(txt|TXT)'.*?'BBSTITLE'/)?.[0];
    expect(bbsTitleArray).toBeDefined();
    lowerBeforeUpper(bbsTitleArray!, 'BBSTITLE');
  });

  it('AWAITSCREEN special-case list tries .txt before .TXT', () => {
    const awaitArray = src.match(/return\s*\[\s*'AWAITSCREEN\.(txt|TXT)'.*?\]/)?.[0];
    expect(awaitArray).toBeDefined();
    lowerBeforeUpper(awaitArray!, 'AWAITSCREEN');
  });

  it('addAnsiVariants helper queues .txt before .TXT', () => {
    // Locate the addAnsiVariants body (between its declaration and the
    // next `const add` helper or end of variants block).
    const body = src.match(/addAnsiVariants[\s\S]*?return\s+Array\.from\(variants\)/)?.[0];
    expect(body).toBeDefined();
    const txtIdx = body!.indexOf('`${name}.txt`');
    const TXTIdx = body!.indexOf('`${name}.TXT`');
    expect(txtIdx).toBeGreaterThanOrEqual(0);
    expect(TXTIdx).toBeGreaterThanOrEqual(0);
    expect(txtIdx).toBeLessThan(TXTIdx);
  });
});
