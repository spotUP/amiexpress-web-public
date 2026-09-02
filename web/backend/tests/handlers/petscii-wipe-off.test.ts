/**
 * C64 40-col plan, Task 8 (gap a): screen wipe effects are OFF for a
 * PETSCII session.
 *
 * `~WX` on the board's real menu (Screens/MENU250.TXT, first line) plays a
 * wipe animation. Its frames are built by `getWipeFrames`, which composes
 * an 80-column grid out of the screen's content and emits each frame
 * straight at the socket - past the reflow choke (`wrapForSession`) and
 * past Task 7's menu reflow. A C64 caller therefore got 80-column noise
 * frames whatever the rest of this plan did to the screen underneath.
 *
 * The effects-off principle (the same one Task 3/6 applied to the doors'
 * glitch, typewriter and masthead animations at the XXS tier): on a
 * 40-column canvas the effect does not run at all and the screen paints
 * directly. Nothing about the animation is re-sized - a wipe IS an
 * 80-column effect.
 *
 * RED before the fix: `getWipeFrames` was called for the PETSCII session
 * and rows of 80 columns went on the wire.
 *
 * The ANSI session keeps the animation: same file, same session shape as
 * every 80-column caller, frames still generated and still played.
 *
 * Harness (socket stub, absolute-path seam, real loadScreenFile) follows
 * tests/handlers/petscii-screen-reflow.test.ts.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/utils/screen-wipe.util', () => {
  const actual = jest.requireActual('../../src/utils/screen-wipe.util');
  return {
    ...actual,
    // Spy that still does the real work: the ANSI pin needs real frames.
    getWipeFrames: jest.fn(actual.getWipeFrames),
  };
});

import { displayScreen } from '../../src/handlers/screen.handler';
import { getWipeFrames } from '../../src/utils/screen-wipe.util';
import { printableLength } from '../../src/utils/wrap-for-session.util';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

let tmpDir: string;
let menuPath: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'petscii-wipe-'));
  // The board's real menu, wipe directive and all, under its real name so
  // the menu branch of the art gate sees it.
  menuPath = path.join(tmpDir, 'MENU250.TXT');
  fs.copyFileSync(path.join(REPO_ROOT, 'Screens/MENU250.TXT'), menuPath);
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* scratch */ }
});

beforeEach(() => {
  (getWipeFrames as jest.Mock).mockClear();
});

let seq = 0;
async function show(session: any): Promise<{ out: string; emits: number }> {
  const emitted: Array<{ event: string; data: any }> = [];
  const socket = {
    id: `petscii-wipe-${seq++}`,
    emit: (event: string, data: any) => { emitted.push({ event, data }); return true; },
    on: () => {},
  };
  const ok = await displayScreen(socket as any, session, menuPath);
  expect(ok).toBe(true);
  const frames = emitted.filter((e) => e.event === 'ansi-output' || e.event === 'petscii-output');
  return { out: frames.map((e) => String(e.data)).join(''), emits: frames.length };
}

/** Printable rows of the emitted stream, cursor-hide/show wrapper dropped. */
function contentRows(out: string): string[] {
  return out
    .replace(/\x1b\[\?25[lh]/g, '')
    .split(/\r?\n/)
    .filter((l) => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim().length > 0);
}

describe('screen wipes on a PETSCII session', () => {
  it('does not run the wipe effect at all for a petsciiMode session', async () => {
    const { out } = await show({ petsciiMode: true, screenWidth: 40, screenHeight: 25, nodeId: 0 });

    // The effect never ran...
    expect(getWipeFrames).not.toHaveBeenCalled();
    // ...the directive itself was still consumed, not printed...
    expect(out).not.toContain('~WX');
    // ...and what did go out fits a C64 screen.
    for (const row of contentRows(out)) {
      expect(printableLength(row)).toBeLessThanOrEqual(40);
    }
  });

  it('still plays the wipe for an 80-column ANSI session', async () => {
    const { out, emits } = await show({ screenWidth: 80, screenHeight: 25, nodeId: 0 });

    expect(getWipeFrames).toHaveBeenCalledTimes(1);
    // The frames really went on the wire: an animation is many emits, each
    // repainting the screen from home.
    expect(emits).toBeGreaterThan(1);
    expect(out).toContain('\x1b[2J\x1b[H');
    expect(out).not.toContain('~WX');
  });
});

/**
 * Task 8 of `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`
 * (decision 8), the `.seq` half of the same rule.
 *
 * A gated `.seq` (first byte `~`) returns from `displayScreen`'s
 * `isPetscii` branch BEFORE the wipe detection above it ever runs, so the
 * directive reached the tokenizer instead: strict fall-through
 * (express.e-exact) consumes the `~` and prints the cmd text, putting the
 * letters `WX` on a C64's screen. A wipe is an 80-column effect by
 * construction and never animates for a PETSCII session
 * (`wipeEffectsEnabled`), so on this path the directive must be stripped
 * exactly as the ANSI path strips it - same `parseWipeMCI`, same
 * own-line semantics (the code and its line break go together) - and
 * nothing of it may reach the wire.
 *
 * Fixture bytes are built in code; never write a `.seq` through
 * Edit/Write (the UTF-8 round-trip destroys high-bit art bytes).
 */
describe('screen wipes inside a PETSCII .seq', () => {
  const seqBytes = (...parts: Array<string | number>): Buffer =>
    Buffer.from(
      parts.flatMap((p) =>
        typeof p === 'string' ? Array.from(Buffer.from(p, 'latin1')) : [p],
      ),
    );

  it('plays no wipe and puts neither ~WX nor WX on the petscii wire', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'petscii-wipe-seq-'));
    const seqPath = path.join(dir, 'WIPE.SEQ');
    // `~WX` on its own line (the shipped MENU250.TXT idiom), then art:
    // lower-case bank switch, three letters, a shifted space.
    fs.writeFileSync(seqPath, seqBytes(0x7e, 'WX', 0x0d, 0x0e, 'HI', 0xa0));

    const emitted: Array<{ event: string; data: any }> = [];
    const socket = {
      id: `petscii-wipe-seq-${Date.now()}`,
      emit: (event: string, data: any) => { emitted.push({ event, data }); return true; },
      on: () => {},
    };
    const session: any = { petsciiMode: true, screenWidth: 40, screenHeight: 25, nodeId: 0 };

    expect(await displayScreen(socket as any, session, seqPath)).toBe(true);

    // The effect never ran...
    expect(getWipeFrames).not.toHaveBeenCalled();

    const payloads = emitted
      .filter((e) => e.event === 'petscii-bytes')
      .map((e) => Buffer.from(e.data, 'base64'));
    expect(payloads).toHaveLength(1);
    const wire = payloads[0];

    // ...the directive was consumed whole, not printed in any form...
    expect(wire.toString('latin1')).not.toContain('~WX');
    expect(wire.toString('latin1')).not.toContain('WX');
    // ...and the art behind it is byte-identical, its high bit intact.
    expect(Array.from(wire)).toEqual([0x0e, 0x48, 0x49, 0xa0]);

    // Nothing ANSI reached a C64.
    expect(wire.includes(0x1b)).toBe(false);
    expect(emitted.filter((e) => e.event === 'ansi-output')).toHaveLength(0);
  });
});
