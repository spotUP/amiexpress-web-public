/**
 * Regression: 3 user-action callers-log sites that were SQL-only (only
 * the web activity widget saw them) must also write to the disk
 * BBS:Node{X}/CallersLog file for express.e parity.
 *
 * Audit reference:
 *   thoughts/shared/research/2026-05-18_sqlite-disk-parity-audit.md
 *   §"Callers log — BIFURCATED BY DESIGN"
 *
 * Sites originally SQL-only:
 *   - operations/conference.handler.ts: 'Joined conference'
 *   - file/file.handler.ts: 'Deleted file'
 *   - file/file.handler.ts: 'Moved file'
 *
 * Grep-style tests (these handlers can't be loaded under jest — they
 * import most of the BBS subsystem).
 */

import * as fs from 'fs';
import * as path from 'path';

function read(relPath: string): string {
  return fs.readFileSync(
    path.join(__dirname, '..', 'src', relPath),
    'utf8'
  );
}

describe('callers-log dual write: SQL + disk parity', () => {
  test('Joined conference logs to both callersLog (SQL) and callersLogManager (disk)', () => {
    const src = read('handlers/operations/conference.handler.ts');
    // SQL path
    expect(src).toMatch(
      /callersLog\([^)]*'Joined conference'[^)]*\)[\s\S]{0,500}?callersLogManager\.logActivity/
    );
  });

  test('Deleted file logs to both loggers', () => {
    const src = read('handlers/file/file.handler.ts');
    expect(src).toMatch(
      /callersLog\([^)]*'Deleted file'[^)]*\)[\s\S]{0,500}?callersLogManager\.logActivity/
    );
  });

  test('Moved file logs to both loggers', () => {
    const src = read('handlers/file/file.handler.ts');
    expect(src).toMatch(
      /callersLog\([^)]*'Moved file'[^)]*\)[\s\S]{0,500}?callersLogManager\.logActivity/
    );
  });

  test('file.handler.ts imports callersLogManager (singleton, not DI-injected)', () => {
    const src = read('handlers/file/file.handler.ts');
    expect(src).toMatch(/import\s*\{\s*callersLogManager\s*\}\s*from\s*['"][^'"]*CallersLogManager['"]/);
  });

  test('conference.handler.ts imports callersLogManager', () => {
    const src = read('handlers/operations/conference.handler.ts');
    expect(src).toMatch(/import\s*\{\s*callersLogManager\s*\}\s*from\s*['"][^'"]*CallersLogManager['"]/);
  });
});
