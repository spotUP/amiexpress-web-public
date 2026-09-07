/**
 * Screen wipes on a PETSCII session, at the caller's own width.
 *
 * A wipe used to be refused to every PETSCII caller: `getWipeFrames` composed
 * the screen onto an 80-column grid whatever his width, so on a C64's 40 the
 * animation smeared the screen the 40-column work had just fitted. The engine
 * is width-aware now (tests/utils/wipes-at-the-callers-width.test.ts), so the
 * effect RUNS for him, built at forty - "try to fix the wipes for petscii 40
 * cols as well" (sysop, 2026-09-07).
 *
 * What has to stay true either way, and is what this file pins: nothing wider
 * than the caller's screen goes on his wire, and the directive itself is
 * consumed rather than printed - on the ANSI path and on the `.seq` path,
 * which returns before the wipe detection and must strip it in its own right.
 *
 * Harness (socket stub, absolute-path seam, real loadScreenFile) follows
 * tests/handlers/petscii-screen-reflow.test.ts.
 */
import { widestColumnPainted } from '../helpers/painted-columns';

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

/**
 * The board's real menu, FROZEN. The live `Screens/MENU250.TXT` is the
 * sysop's to edit through the admin screen editor, and every assertion below
 * rides its bytes - so the input is a tracked copy and only the code under
 * test can move a result. (RULES.md, "The board is not a fixture".)
 */
const FIXTURES = path.join(__dirname, '..', 'fixtures', 'board-screens');
const REAL_MENU = path.join(FIXTURES, 'screens-menu250.txt');

let tmpDir: string;
let menuPath: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'petscii-wipe-'));
  // The board's real menu, wipe directive and all, under its real name so
  // the menu branch of the art gate sees it.
  menuPath = path.join(tmpDir, 'MENU250.TXT');
  fs.copyFileSync(REAL_MENU, menuPath);
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
  it('plays the wipe for a C64, composed at his forty columns', async () => {
    const { out } = await show({ petsciiMode: true, petsciiColumns: 40, screenWidth: 40, screenHeight: 25, nodeId: 0 });

    // The effect ran, and it was told the caller's width...
    expect(getWipeFrames).toHaveBeenCalledTimes(1);
    expect((getWipeFrames as jest.Mock).mock.calls[0][2]).toBe(40);
    // ...the directive itself was consumed, not printed...
    expect(out).not.toContain('~WX');
    // ...and nothing wider than his screen went on the wire. Measured by
    // replaying the stream, because a wipe frame carries no newlines: it
    // addresses each row and paints a run, so splitting on `\n` measures one
    // line thousands of columns long and proves nothing.
    expect(widestColumnPainted(out)).toBeLessThanOrEqual(40);
  });

  it('still plays the wipe for an 80-column ANSI session', async () => {
    const { out, emits } = await show({ screenWidth: 80, screenHeight: 25, nodeId: 0 });

    expect(getWipeFrames).toHaveBeenCalledTimes(1);
    expect((getWipeFrames as jest.Mock).mock.calls[0][2]).toBe(80);
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
 * letters `WX` on a C64's screen. Those bytes are raw PETSCII
 * - and a `.seq` has no ANSI to model, so it
 * animates on no path at all - so the directive must be stripped here
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
