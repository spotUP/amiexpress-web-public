/**
 * "The board is visible on a 40-column PETSCII caller's screen."
 *
 * THE REPORT (sysop, live board, a web `P` session at 40x25, GMASTER =
 * `Doors/grandmaster`, marked MIN_COLUMNS=40 by 3c91df6d1), recorded at
 * `thoughts/shared/handoffs/2026-09-05_operator-chat-ai-fixes.md:152`:
 * "only helptexts at the bottom, black screen". The handoff guessed SDK
 * cell-art. It was not cell-art, not the PETSCII glyph table, not
 * effectsAllowed(40) and not the SDK theme tokens.
 *
 * WHAT ACTUALLY HAPPENED, measured by driving this door at 40x25 and replaying
 * its bytes onto the KERNAL oracle: the menu painted correctly, and the first
 * mode the caller chose tore it down and put nothing in its place. Two null
 * dereferences, both introduced with the 40-column compact layouts and both
 * invisible because `sdk/engines/ui/blessed/core/events.ts` swallows every
 * exception a listener throws:
 *
 *   1. `ui/menu.ts` - at 40 columns the compact menu never builds the
 *      description and player panes, but the `select` listener destroyed them
 *      unconditionally. The TypeError killed the listener between
 *      `menuPanel.destroy()` and `instructions.destroy()`, so the screen was
 *      left holding exactly one element - the instruction row - and the promise
 *      `showMainMenu()` awaits was never settled. That is the sysop's
 *      screenshot, glyph for glyph: 24 blank rows and a help line.
 *      Regression from 613975177; at 613975177^ both panes were `const` and
 *      always built, which is why PETSCII "used to work".
 *   2. `ui/game-screen.ts` - the compact layout sets every side panel to null,
 *      and `showReadyGo()` calls `renderNext()` before the guarded render loop
 *      ever runs. Guarded inside the renderers now, the way `renderZone()`
 *      already was, because two different call paths reach them.
 *
 * THE PROOF IS THE GLASS, not a call count and not a source pin: the door's
 * real bytes go through the session's real `AnsiToPetsciiTransducer` into a
 * `PetsciiMachine` and the test asks the C64 screen memory what is on it.
 *
 * This drives the compiled bundle `executeTypeScriptDoor` imports
 * (`Doors/grandmaster/dist/index.js`), against a `bbs` whose
 * `getTerminalSize()` answers 40x25 on a `petsciiMode` session, with keys
 * pushed through `session.doorInputHandler` - the property both live routers
 * call (`src/server/socket-handlers.ts`, `src/index.ts`).
 */
import { AnsiToPetsciiTransducer, PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';

const { execFileSync } = require('child_process');
const path = require('path');

const COLS = 40;
const ROWS = 25;
const DRIVER = path.join(__dirname, 'fixtures/drive-grandmaster-40.cjs');

/** A blank C64 cell: screen code 32, or 0 on a screen never written to. */
const isBlank = (code: number): boolean => code === 32 || code === 0;

interface Drive {
  /** Screen codes, 40x25, after every captured byte was replayed. */
  screen: number[];
  /** Anything the door rejected with. */
  errors: string[];
  /** Chunk count, so a drive that captured nothing cannot pass silently. */
  chunks: number;
}

const ENTER = '\r';

/**
 * Run the real door at 40x25 and replay what it wrote onto a C64.
 *
 * `steps` are key strings pushed through `session.doorInputHandler` with a
 * settle after each, exactly as a caller's keystrokes arrive.
 */
function driveAt40(steps: Array<{ key: string; wait: number }>): Drive {
  const out = execFileSync(process.execPath, [DRIVER, JSON.stringify(steps)], {
    cwd: path.dirname(DRIVER),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const { captured, errors } = JSON.parse(out) as { captured: string[]; errors: string[] };

  const transducer = new AnsiToPetsciiTransducer();
  const machine = new PetsciiMachine();
  for (const chunk of captured) machine.feed(transducer.transduce(chunk));

  return {
    screen: Array.from(machine.state.screen).slice(0, COLS * ROWS),
    errors,
    chunks: captured.length,
  };
}

/** Painted cells on rows [from, to). */
function paintedIn(screen: number[], from: number, to: number): number {
  let n = 0;
  for (let y = from; y < to; y++) {
    for (let x = 0; x < COLS; x++) if (!isBlank(screen[y * COLS + x])) n++;
  }
  return n;
}

/** Rows holding at least one painted cell. */
function paintedRows(screen: number[]): number[] {
  const rows: number[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (!isBlank(screen[y * COLS + x])) { rows.push(y); break; }
    }
  }
  return rows;
}

jest.setTimeout(120000);

describe('GRANDMASTER on a 40-column PETSCII caller', () => {
  it('the menu is on the glass before anything is chosen', () => {
    const run = driveAt40([{ key: ENTER, wait: 700 }]);
    expect(run.errors).toEqual([]);
    expect(run.chunks).toBeGreaterThan(5);
    // Title, the mode rows and the help line: far more than one painted row.
    expect(paintedRows(run.screen).length).toBeGreaterThan(5);
  });

  /**
   * THE SYMPTOM, stated as the fact it should be. Before the fix this screen
   * was 24 blank rows and the instruction line the dead listener never got to
   * destroy - the sysop's "only helptexts at the bottom, black screen".
   */
  it('the board is visible after a mode is chosen, not a black screen with one help row', () => {
    const run = driveAt40([
      { key: ENTER, wait: 700 },   // leave the attract screen, the menu appears
      { key: ENTER, wait: 3000 },  // choose MASTER MODE, the first row
    ]);

    expect(run.errors).toEqual([]);

    // The exact pre-fix signature: everything blank except the help row.
    const rows = paintedRows(run.screen);
    expect(rows).not.toEqual([23]);
    expect(rows.length).toBeGreaterThan(10);

    // A real board, painted above the help row - frame, well and pieces.
    expect(paintedIn(run.screen, 0, 23)).toBeGreaterThan(100);

    // Reverse video is the only way PETSCII fills a cell (it has no per-cell
    // background), so a board of solid blocks must leave some on the glass.
    const reversed = run.screen.filter((code) => (code & 0x80) !== 0).length;
    expect(reversed).toBeGreaterThan(0);
  });
});
