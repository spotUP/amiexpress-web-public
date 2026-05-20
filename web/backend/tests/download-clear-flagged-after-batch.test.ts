/**
 * Regression: D5 (express.e:20249 clearFlagItems) — after a successful
 * ZMODEM batch download via startZmodemDownload, the user's flagged-
 * files queue must be cleared so they don't see the same files queued
 * next session.
 *
 * Two flag managers exist in this codebase:
 *   - session.flagManager (web batch path, FileFlagManager)
 *     → already cleared at batch-download.handler.ts:228
 *   - flaggedFilesManager (telnet/SSH path, singleton, FlaggedFilesManager)
 *     → cleared here in user-commands.handler.ts onComplete (lrzsz + zmodem.js)
 *
 * Grep-style — user-commands.handler.ts can't be loaded under jest.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('ZMODEM download clears flaggedFilesManager queue on success (D5)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'handlers', 'commands', 'user-commands.handler.ts'),
    'utf8'
  );

  test('lrzsz onComplete clears flaggedFilesManager when ok', () => {
    // The lrzsz path's onComplete block must guard on `ok` and call
    // flaggedFilesManager.clearFiles before delegating to runPostDownload.
    const m = src.match(
      /\[ZMODEM-DL[^\n]*lrzsz onComplete[\s\S]{0,1500}?runPostDownload/
    );
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/if\s*\(\s*ok[\s\S]{0,200}?flaggedFilesManager\.clearFiles/);
  });

  test('zmodem.js fallback onComplete clears flaggedFilesManager when ok', () => {
    // Second onComplete is the zmodem.js JS-fallback path; same shape.
    const matches = src.match(
      /onComplete:\s*async\s*\(ok,\s*detail\)\s*=>\s*\{[\s\S]{0,1500}?runPostDownload/
    );
    expect(matches).not.toBeNull();
    expect(matches![0]).toMatch(/if\s*\(\s*ok[\s\S]{0,200}?flaggedFilesManager\.clearFiles/);
  });

  test('clearFiles is NOT called on transfer failure (ok=false)', () => {
    // The clear must be gated on ok — losing the queue on failure would
    // force the user to re-flag every file after any network blip.
    const lrzMatch = src.match(
      /\[ZMODEM-DL[^\n]*lrzsz onComplete[\s\S]{0,1500}?runPostDownload/
    );
    expect(lrzMatch).not.toBeNull();
    // The clear must be inside an `if (ok ...)` branch, not at top level.
    const clearIdx = lrzMatch![0].indexOf('flaggedFilesManager.clearFiles');
    const guardIdx = lrzMatch![0].lastIndexOf('if (ok', clearIdx);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(clearIdx);
  });
});
