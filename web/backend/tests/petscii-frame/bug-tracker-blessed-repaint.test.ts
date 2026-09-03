/**
 * The door-level proof for the sysop's BUGS screenshot: the REAL door's REAL
 * 40x25 byte stream, replayed through the session's terminal model, must leave
 * the C64 glass showing exactly what an ANSI terminal would show.
 *
 * THE REPORT (sysop, 2026-09-03, a web PETSCII `P` session at 40x25, BUGS =
 * `Doors/bug-tracker`, a blessed SDK door marked MIN_COLUMNS=40): after walking
 * the menu selection down to the bottom and back up to the top,
 * `>>[N] New Bug Report` was painted on TWO rows, `[S] Search Bugs` was
 * followed by the remnant `ashboard` of `Analytics Dashboard`, and a leftover
 * cell sat after `List All Bugs`.
 *
 * THE FIXTURE is a capture, not a fabrication:
 * `fixtures/capture-bug-tracker.mjs` drives `Doors/bug-tracker/dist/index.js` -
 * the exact bundle `executeTypeScriptDoor` imports - through the real
 * `ServerDoor.execute()` against a `bbs` whose `getTerminalSize()` answers
 * 40x25, and presses Down and Up through `session.doorInputHandler`, the
 * property both live key routers call (`src/server/socket-handlers.ts`,
 * `src/index.ts`). Every `bbs.write` is recorded; `BBSApi.write` emits those
 * strings as `ansi-output` after `wrapDoorTextForSession`, which is identity
 * for a payload that positions the cursor - and every blessed frame does.
 * The script cannot be a jest suite: the bundle is ESM and reads
 * `import.meta.url`, which the CommonJS runner cannot load (the same reason
 * `tests/doors/compact-40/bug-tracker.test.ts` drives `layout.ts` directly).
 * How many render passes land before the first keystroke is timing-dependent,
 * so a regenerated capture may split the same screen across different chunks;
 * what it paints, and everything asserted here, does not change.
 *
 * THE ORACLE is the repo's own xterm model, `sdk/petscii/frame/ansi-screen.ts`
 * (`@xterm/headless` is not a dependency anywhere in this repo), configured to
 * 40x25. Its parser is deliberately written to mirror the transducer's, so a
 * cell-for-cell equality between the two is a real terminal-parity assertion.
 *
 * THE DEFECT it pins: blessed's renderer writes cell (39,24) on the first
 * render of every 40x25 screen, printing there advanced the KERNAL cursor off
 * the screen and SCROLLED, and an ANSI terminal never scrolls on a printable -
 * so the C64 sat one row above what the door believed and every later diff
 * repaint landed one row low. Unit coverage and the RED proof:
 * `sdk/tests/petscii/blessed-repaint.test.ts`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { AnsiToPetsciiTransducer, PetsciiMachine, screenCodeToPetscii } from '@amiexpress/bbs-door-sdk/petscii';
import { FrameReconstructor } from '@amiexpress/bbs-door-sdk/petscii/frame';

const COLS = 40;
const ROWS = 25;

interface Chunk { phase: string; data: string }

const capture: Chunk[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/bug-tracker-40x25-menu-walk.json'), 'utf8'),
);

/** One screen code as the glyph a PetMe64 canvas paints for it, in `bank`. */
function screenCodeToChar(sc: number, bank: 0 | 1): string {
  const p = screenCodeToPetscii(sc & 0x7f);
  if (p >= 0x20 && p <= 0x3f) return String.fromCharCode(p);
  if (bank === 1) {
    if (p >= 0x41 && p <= 0x5a) return String.fromCharCode(p - 0x41 + 0x61);
    if (p >= 0xc1 && p <= 0xda) return String.fromCharCode(p - 0xc1 + 0x41);
  } else if (p >= 0x41 && p <= 0x5f) {
    return String.fromCharCode(p);
  }
  if (p === 0x40 || (p >= 0x5b && p <= 0x5f)) return String.fromCharCode(p);
  return '#'; // a PETSCII graphic with no ASCII name; this door paints none
}

interface Glyph { ch: string; rvs: boolean }

function c64Grid(m: PetsciiMachine): Glyph[][] {
  const rows: Glyph[][] = [];
  for (let y = 0; y < ROWS; y++) {
    const row: Glyph[] = [];
    for (let x = 0; x < COLS; x++) {
      const code = m.state.screen[y * COLS + x];
      row.push({ ch: screenCodeToChar(code, m.state.charsetBank), rvs: (code & 0x80) !== 0 });
    }
    rows.push(row);
  }
  return rows;
}

function ansiGrid(r: FrameReconstructor): Glyph[][] {
  return r.snapshot().cells.map((row) => row.map((c) => ({ ch: c.ch, rvs: c.rvs })));
}

const asText = (g: Glyph[][]): string[] => g.map((r) => r.map((c) => c.ch).join('').replace(/ +$/, ''));

describe('BUGS at 40x25: the C64 glass equals an ANSI terminal, cell for cell', () => {
  it('the capture is the door talking: 40x25 CUP frames, and a bottom row painted to all 40 columns', () => {
    const all = capture.map((c) => c.data).join('');
    expect(capture.length).toBeGreaterThan(10);
    expect(all).toMatch(/\x1b\[25;1H/);            // the door really addresses the bottom row
    // The selection marker and the label are separated by the SGR that highlights it.
    expect(all).toContain('>>');
    expect(all).toContain('[N] New Bug Report'); // the row the sysop saw twice
    // The frame that addresses the bottom row paints it right through column
    // 40 - that last cell is the one whose print used to scroll the C64.
    const frame = capture.find((c) => c.data.includes('\x1b[25;1H'));
    const bottom = frame!.data.slice(frame!.data.indexOf('\x1b[25;1H'));
    expect(bottom.replace(/\x1b\[[0-9;?<=>]*[A-Za-z]/g, '')).toHaveLength(COLS);
  });

  it('every chunk leaves the C64 grid equal to the reference terminal, glyph and reverse per cell', () => {
    const t = new AnsiToPetsciiTransducer();
    const display = new PetsciiMachine();
    const ref = new FrameReconstructor({ cols: COLS, rows: ROWS });
    const diverged: string[] = [];

    capture.forEach((chunk, i) => {
      display.feed(t.transduce(chunk.data));   // the BYTES the transducer emits, replayed
      ref.write(chunk.data);
      const a = c64Grid(display);
      const b = ansiGrid(ref);
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        diverged.push(`[${i}] ${chunk.phase}\nC64:\n${asText(a).join('\n')}\nANSI:\n${asText(b).join('\n')}`);
      }
    });

    expect(diverged).toEqual([]);
  });

  it('none of the three reported symptoms survives the walk', () => {
    const t = new AnsiToPetsciiTransducer();
    const display = new PetsciiMachine();
    for (const chunk of capture) display.feed(t.transduce(chunk.data));
    const rows = asText(c64Grid(display));

    // 1. the highlighted row is painted once, not twice
    expect(rows.filter((r) => r.includes('>>[N] New Bug Report')).length).toBeLessThanOrEqual(1);
    // 2. no repainted row keeps the tail of the row that used to be under it
    expect(rows.join('\n')).not.toMatch(/Search Bugsashboard/);
    expect(rows.join('\n')).not.toMatch(/List All Bugss/);
    // 3. nothing is left in reverse video: this door never emits SGR 7
    for (let i = 0; i < display.state.screen.length; i++) {
      expect(display.state.screen[i] & 0x80).toBe(0);
    }
  });

  it('the top row the first frame painted is still on the screen at the end', () => {
    const t = new AnsiToPetsciiTransducer();
    const display = new PetsciiMachine();
    const ref = new FrameReconstructor({ cols: COLS, rows: ROWS });
    for (const chunk of capture.slice(0, capture.length - 4)) {
      display.feed(t.transduce(chunk.data));
      ref.write(chunk.data);
    }
    // Not a literal: whatever the reference terminal shows on row 0 is what a
    // C64 must show on row 0. Before the fix the C64 had scrolled it away.
    expect(asText(c64Grid(display))[0]).toBe(asText(ansiGrid(ref))[0]);
    expect(asText(c64Grid(display))[0]).not.toBe('');
  });
});
