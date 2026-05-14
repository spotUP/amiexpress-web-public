/**
 * Regression: run-amiga-door.ts must process.exit(0) once the door
 * session resolves. Several XIM handlers (notably JH_MCI's dynamic
 * import of screen.handler) transitively load index.ts, whose
 * top-level IIFE spins up the database + Telnet + HTTP servers and
 * keeps the Node event loop alive indefinitely. Before the explicit
 * exit, doors that issued JH_MCI (e.g. MDB-ConfUpdater, Hststat)
 * timed out in the corpus runner even though they sent JH_SHUTDOWN
 * cleanly.
 *
 * We assert the literal shape of the .then/.catch wrapper rather
 * than spawning the harness (which is what the door-corpus
 * regression already does end-to-end) so this test fails fast even
 * if the corpus is skipped, and so a refactor that drops the
 * explicit exit becomes a unit-level failure rather than a flaky
 * 30s timeout buried in CI.
 */
import * as fs from 'fs';
import * as path from 'path';

const HARNESS = path.resolve(
  __dirname,
  '..',
  '..',
  'src',
  'scripts',
  'run-amiga-door.ts',
);

describe('run-amiga-door.ts exit behaviour', () => {
  it('force-exits the process after the door session resolves', () => {
    const src = fs.readFileSync(HARNESS, 'utf8');
    expect(src).toMatch(/main\(\)\.then\(\(\)\s*=>\s*\{[\s\S]*process\.exit\(0\)/);
    expect(src).toMatch(/\.catch\(\(error\)\s*=>\s*\{[\s\S]*process\.exit\(1\)/);
  });
});
