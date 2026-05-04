/**
 * Regression tests for C-V: V command uses ViewFileHandler (canonical impl).
 *
 * express.e:25675-25687 internalCommandV:
 *   - setEnvStat(ENV_VIEWING)
 *   - IF ripMode THEN aePuts('[1!')
 *   - viewAFile(cmdcode, params)
 *   - IF ripMode THEN aePuts('[2!')
 *
 * The canonical V impl is ViewFileHandler in content/view-file.handler.ts:
 *   - searches BBS file areas (Dir1..DirN) via DLPATH, NOT a flat TEXT/ subdir
 *   - emits the RIP graphics-mode brackets when session.ripMode is set
 *   - validates filename, checks restricted paths, refuses binary files
 *
 * The legacy export `handleViewFileCommand` in commands/utility-commands.handler.ts
 * used to reimplement V badly (TEXT/ search, no RIP brackets). It is now a
 * forwarder so the export contract is preserved while behavior is canonical.
 *
 * These tests pin:
 *   - canonical handler still searches Dir1..DirN, has RIP brackets
 *   - legacy export forwards to ViewFileHandler (no longer reads TEXT/)
 */

import * as fs from 'fs';
import * as path from 'path';

describe('V command uses canonical ViewFileHandler (C-V, express.e:25675-25687)', () => {
  test('ViewFileHandler emits RIP-mode brackets [1!  / [2! around viewAFile', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'handlers', 'content', 'view-file.handler.ts'),
      'utf8'
    );
    expect(src).toMatch(/session\.ripMode[\s\S]{0,200}?\\x1b\[1!/);
    expect(src).toMatch(/session\.ripMode[\s\S]{0,200}?\\x1b\[2!/);
  });

  test('ViewFileHandler searches Dir1..DirN (BBS file areas), not a flat TEXT/ dir', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'handlers', 'content', 'view-file.handler.ts'),
      'utf8'
    );
    expect(src).toMatch(/Dir\$\{dirNum\}|`Dir\$\{dirNum\}`/);
    expect(src).not.toMatch(/['"`]TEXT['"`]/);
  });

  test('legacy utility-commands handleViewFileCommand forwards to ViewFileHandler', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'handlers', 'commands', 'utility-commands.handler.ts'),
      'utf8'
    );
    // The forwarder imports ViewFileHandler dynamically and delegates.
    expect(src).toMatch(
      /handleViewFileCommand[\s\S]{0,300}?import\(\s*['"]\.\.\/content\/view-file\.handler['"]\s*\)[\s\S]{0,200}?ViewFileHandler\.handleViewFileCommand/
    );
    // The TEXT/ flat-search bug must not be present.
    expect(src).not.toMatch(/path\.join\(\s*_confScreenDir\s*,\s*['"`]\.\.['"`]\s*,\s*['"`]TEXT['"`]/);
  });

  test('legacy utility-commands handleViewFileInput forwards to ViewFileHandler.handleFilenameInput', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'handlers', 'commands', 'utility-commands.handler.ts'),
      'utf8'
    );
    expect(src).toMatch(
      /handleViewFileInput[\s\S]{0,300}?ViewFileHandler\.handleFilenameInput/
    );
  });
});
