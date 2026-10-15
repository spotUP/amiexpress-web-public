/**
 * C64 door adapter Phase 3, Task 6: the BBSTerminal seam sees ordinary ANSI.
 *
 * For a web 'P' session the c64-door-adapter runs entirely server-side
 * (server/c64-door-adapter.ts, sdk/petscii/frame/*): it reconstructs a
 * door's 80-column screen, reduces it to 40x25, and hands `renderDiff`'s
 * output to the ORIGINAL `socket.emit('ansi-output', ...)`. Nothing about
 * the adapter's SHAPE change (<=40x25 instead of 80x25) reaches
 * BBSTerminal.tsx as a new KIND of payload - it is a full paint
 * (ESC[2J ESC[H + every non-blank cell) followed by CUP-addressed diffs,
 * SGR truecolor foreground (38;2;r;g;b, `vicToSgrForeground`), no
 * background SGR, ending in SGR 0 + a complete CUP - exactly the shape the
 * `ansi-output` handler (BBSTerminal.tsx:2126-2139) has fed straight into
 * `enqueuePetscii(petsciiTransducerRef.current!.transduce(output))` since
 * full-canvas Task 8.
 *
 * This test is the client-side oracle for that claim: it drives the SAME
 * two classes the seam uses (`AnsiToPetsciiTransducer`, `PetsciiMachine`,
 * both imported through `@amiexpress/bbs-door-sdk/petscii`, exactly as
 * BBSTerminal.tsx:17 does) with `renderDiff`-shaped ANSI built from small
 * Frame fixtures via the SDK's own `renderDiff` (`@amiexpress/bbs-door-sdk/
 * petscii/frame`), and asserts the resulting screen equals the frame and
 * the cursor lands on the frame's cursor cell. No BBSTerminal.tsx change is
 * expected or made by this task - see thoughts/BOARD.md 't6 p3' and
 * thoughts/shared/plans/2026-09-02-c64-door-adapter-phase3.md Task 6.
 */
import { describe, it, expect } from 'vitest';
import {
  AnsiToPetsciiTransducer,
  PetsciiMachine,
  printablePetsciiToScreenCode,
  UNICODE_TO_PETSCII,
} from '@amiexpress/bbs-door-sdk/petscii';
import { renderDiff, makeFrame, blankCell, type Frame, type Cell } from '@amiexpress/bbs-door-sdk/petscii/frame';

const COLS = 40;
const ROWS = 25;

/** Screen code (no reverse bit) the transducer prints for `ch` - mirrors
 * sdk/tests/petscii/frame/frame-render-roundtrip.test.ts's oracle. */
function expectedScreenCode(ch: string): number {
  const code = ch.codePointAt(0) as number;
  if (code >= 0x61 && code <= 0x7a) return 0x01 + (code - 0x61);
  if (code >= 0x41 && code <= 0x5a) return 0x41 + (code - 0x41);
  if ((code >= 0x20 && code <= 0x3f) || code === 0x40 || code === 0x5b || code === 0x5d) {
    return printablePetsciiToScreenCode(code);
  }
  const mapped = UNICODE_TO_PETSCII.get(ch);
  if (typeof mapped !== 'number') throw new Error(`no PETSCII mapping for ${JSON.stringify(ch)}`);
  return printablePetsciiToScreenCode(mapped);
}

/** The machine's screen/colour RAM and cursor equal the frame, cell for
 * cell, within the 40x25 grid the adapter targets. The bottom-right cell
 * is excluded: renderDiff never paints it (it would scroll the KERNAL
 * screen), matching the transducer's own fillRow cap. */
function assertMachineShowsFrame(m: PetsciiMachine, f: Frame): void {
  expect(m.state.cols).toBe(COLS);
  expect(m.state.rows).toBe(ROWS);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (x === COLS - 1 && y === ROWS - 1) continue;
      const c = f.cells[y][x];
      const idx = y * COLS + x;
      const expectedSc = expectedScreenCode(c.ch) | (c.rvs ? 0x80 : 0);
      expect({ x, y, sc: m.state.screen[idx] }).toEqual({ x, y, sc: expectedSc });
      if (c.ch !== ' ' || c.rvs) {
        expect({ x, y, fg: m.state.colorRam[idx] }).toEqual({ x, y, fg: c.fg });
      }
    }
  }
  expect([m.state.cursorX, m.state.cursorY]).toEqual([f.cursor.x, f.cursor.y]);
}

/** A door-menu-shaped 40x25 frame: a header, a boxed stats table (reverse
 * video), a status line, and the cursor parked mid-screen - the same kind
 * of content Task 2's adapted captures show. */
function doorFrame(cursorX: number, cursorY: number): Frame {
  const boxed = (s: string) => '│' + s.padEnd(38) + '│';
  const lines: string[] = [
    'AmiExpress Door: DOOMSDAY BBS',
    '┌' + '─'.repeat(38) + '┐',
    boxed(' player   score   level'),
    boxed(' Sysop    9001    3   '),
    '└' + '─'.repeat(38) + '┘',
    '(F)ight (R)un (I)nventory (Q)uit',
    ...Array<string>(18).fill(''),
    'Command? ',
  ];
  const cells: Cell[][] = lines.map((line, y) =>
    Array.from(line).map((ch, x) => ({
      ...blankCell(),
      ch,
      fg: (x + y) % 16,
      rvs: y === 3 && x > 0 && x < 39,
    })),
  );
  return makeFrame(COLS, ROWS, cells, { x: cursorX, y: cursorY });
}

describe('BBSTerminal seam: adapted C64 door frames need no client change', () => {
  it('a full paint (ESC[2J ESC[H) reproduces the door frame on a fresh transducer + machine', () => {
    const frame = doorFrame(9, 24);
    const ansi = renderDiff(null, frame);
    expect(ansi.startsWith('\x1b[2J\x1b[H')).toBe(true); // the "full paint" shape the trace claims
    const transducer = new AnsiToPetsciiTransducer();
    const machine = new PetsciiMachine();
    machine.feed(transducer.transduce(ansi));
    assertMachineShowsFrame(machine, frame);
  });

  it('a CUP-addressed diff after the first paint brings the same machine to the new frame', () => {
    const a = doorFrame(9, 24);
    const transducer = new AnsiToPetsciiTransducer();
    const machine = new PetsciiMachine();
    machine.feed(transducer.transduce(renderDiff(null, a)));

    const cells = a.cells.map((row) => row.map((c) => ({ ...c })));
    cells[3][10] = { ...blankCell(), ch: '5', fg: 7, rvs: true }; // score digit changes
    for (let x = 0; x < COLS; x++) cells[7][x] = blankCell(); // command line clears
    Array.from('Fight!').forEach((ch, x) => { cells[7][x] = { ...blankCell(), ch, fg: 2 }; });
    const b = makeFrame(COLS, ROWS, cells, { x: 6, y: 7 });

    const diff = renderDiff(a, b);
    expect(diff.startsWith('\x1b[2J')).toBe(false); // a diff, not a repaint - proves the "diffs" half of the trace
    expect(diff).toMatch(/\x1b\[4;11H/); // CUP-addressed run at the changed score cell (row 4, col 11, 1-based)

    machine.feed(transducer.transduce(diff));
    assertMachineShowsFrame(machine, b);
  });

  it('every render ends with a complete trailing CUP, matching the no-held-state trace claim', () => {
    const frame = doorFrame(20, 12);
    const ansi = renderDiff(null, frame);
    expect(ansi).toMatch(/\x1b\[\d+;\d+H$/);
    expect(ansi.endsWith('\r')).toBe(false);
  });

  it('sanity: a corrupted trailing CUP is caught by the cursor assertion (RED-capable)', () => {
    // Proves assertMachineShowsFrame actually discriminates on cursor position
    // rather than passing vacuously. Mutating the row digit of the trailing
    // CUP the way a regression in cupTo/renderDiff's clamp would (row 24 -> 23,
    // one row short of the frame's stated cursor) must desync the machine's
    // cursor from the frame - this is the failure Step 1's guard test in
    // c64-door-adapter.test.ts (case 13) also watches for on the wire.
    const frame = doorFrame(9, 24);
    const ansi = renderDiff(null, frame);
    const corrupted = ansi.replace(/\x1b\[25;10H$/, '\x1b[24;10H');
    expect(corrupted).not.toBe(ansi); // the mutation actually landed
    const transducer = new AnsiToPetsciiTransducer();
    const machine = new PetsciiMachine();
    machine.feed(transducer.transduce(corrupted));
    expect([machine.state.cursorX, machine.state.cursorY]).not.toEqual([frame.cursor.x, frame.cursor.y]);
  });
});
