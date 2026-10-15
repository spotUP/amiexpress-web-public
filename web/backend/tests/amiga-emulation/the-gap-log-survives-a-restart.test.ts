/**
 * The gap log keeps its totals across a restart.
 *
 * It lives on the board's volume (logs/amiga-gaps.json) so a deploy does not
 * throw away what the doors asked for; a restart reads it back and keeps
 * counting from there.
 */
import * as fs from 'fs';
import { amigaGaps } from '../../src/amiga-emulation/instrumentation/amiga-gaps';

it('adds to the saved totals instead of starting over', () => {
  amigaGaps.reset();
  try { fs.rmSync(amigaGaps.file()); } catch { /* none yet */ }

  amigaGaps.record('xim', 'command 99 (0x63)', 'FAMEWHO.FIM');
  amigaGaps.record('xim', 'command 99 (0x63)', 'FAMEWHO.FIM');
  amigaGaps.flush();

  amigaGaps.reset(); // the board restarts: nothing in memory
  amigaGaps.record('xim', 'command 99 (0x63)', 'TestDoor.FIM');
  amigaGaps.flush();

  const gap = amigaGaps.snapshot().find((g) => g.what === 'command 99 (0x63)');
  expect(gap).toMatchObject({ kind: 'xim', count: 3, doors: { 'FAMEWHO.FIM': 2, 'TestDoor.FIM': 1 } });
});
