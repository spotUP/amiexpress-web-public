/**
 * A `.seq` written from a screen draws that screen.
 *
 * `PetsciiMachine` has always READ the stream, which is why the studio can
 * show a `.seq`. Nothing wrote one, so an artist who opened one got a picture
 * and no way to change it - and "Redraw this in my theme" copied a file into
 * their theme that they then could not edit (sysop, 2026-09-14).
 *
 * The contract is the ROUND TRIP, not the bytes. An art program may have set
 * a colour it never used or turned reverse off twice; reproducing that would
 * mean keeping a byte log rather than a picture. What must not change is what
 * the caller sees - so every case here reads, writes, reads again, and
 * compares SCREENS.
 *
 * Driven through the board's own `.seq` files. A synthetic grid would not
 * have the long reversed runs, the mid-row colour changes or the ragged right
 * edges that the real titles are made of.
 */
import * as fs from 'fs';
import * as path from 'path';

import { PetsciiMachine } from '../../petscii/petscii-machine';
import { writeSeq } from '../../petscii/seq-writer';
import type { PetsciiMachineState } from '../../petscii/petscii-machine';

const BOARD = path.resolve(__dirname, '../../..');

/** Every `.seq` the board ships, so none of them is a case nobody tried. */
function boardScreens(): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 2) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (/^(node_modules|\.git|dist|\.claude)$/.test(entry.name)) continue;
        walk(full, depth + 1);
      } else if (entry.name.toLowerCase().endsWith('.seq')) {
        found.push(full);
      }
    }
  };
  walk(BOARD, 0);
  return found;
}

/** The screen a stream draws. */
function render(bytes: Uint8Array): PetsciiMachineState {
  const machine = new PetsciiMachine();
  machine.feed(bytes);
  return machine.state;
}

/** What a caller sees: the glyphs, their colours, and the bank. */
function visible(state: PetsciiMachineState): string {
  const cells: string[] = [];
  for (let i = 0; i < state.screen.length; i++) {
    const code = state.screen[i];
    // A blank cell's colour is invisible, so it must not count as a
    // difference - otherwise every trailing space fails the comparison for a
    // colour nobody can see.
    const blank = (code & 0x7f) === 32 && (code & 0x80) === 0;
    cells.push(blank ? '.' : `${code}:${state.colorRam[i] & 0x0f}`);
  }
  return `${state.charsetBank}|${cells.join(' ')}`;
}

describe('writing a PETSCII screen back out', () => {
  const screens = boardScreens();

  it('finds the board\'s own .seq files', () => {
    expect(screens.length).toBeGreaterThan(0);
  });

  it.each(screens.map((file) => [path.relative(BOARD, file), file]))(
    '%s survives a round trip',
    (_name, file) => {
      const original = render(new Uint8Array(fs.readFileSync(file)));
      const rewritten = render(writeSeq(original));
      expect(visible(rewritten)).toBe(visible(original));
    },
  );

  it('writes a file, not a screen dump - a blank tail costs a RETURN', () => {
    const machine = new PetsciiMachine();
    machine.feed(Uint8Array.from([0x05, 65]));           // white, "A"
    const written = writeSeq(machine.state);
    // One letter and some line endings, not a thousand spaces. Padding every
    // row would also print the bottom-right cell, which scrolls a C64 and
    // loses the top row of the picture.
    expect(written.length).toBeLessThan(60);
    expect(visible(render(written))).toBe(visible(machine.state));
  });

  it('spends a colour byte only when the colour changes', () => {
    const machine = new PetsciiMachine();
    // Ten red letters in a row: one colour control, not ten.
    machine.feed(Uint8Array.from([0x1c, ...new Array(10).fill(65)]));
    const written = writeSeq(machine.state, { declareCharset: false });
    const colourBytes = [...written].filter((b) => b === 0x1c).length;
    expect(colourBytes).toBe(1);
  });

  it('never leaves reverse on across a line', () => {
    const machine = new PetsciiMachine();
    machine.feed(Uint8Array.from([0x12, 65, 66, 67]));   // reverse on, "ABC"
    const written = writeSeq(machine.state, { declareCharset: false });
    const lastOn = [...written].lastIndexOf(0x12);
    const lastOff = [...written].lastIndexOf(0x92);
    expect(lastOff).toBeGreaterThan(lastOn);
  });

  it('says which charset bank the screen wants', () => {
    const machine = new PetsciiMachine();
    machine.feed(Uint8Array.from([0x0e, 65]));           // lowercase bank
    expect(machine.state.charsetBank).toBe(1);
    const written = writeSeq(machine.state);
    expect(written[0]).toBe(0x0e);
    expect(render(written).charsetBank).toBe(1);
  });
});

/**
 * THE BYTE A GLYPH IS WRITTEN AS, and it is not a free choice.
 *
 * A C64 has TWO PETSCII bytes for every screen code in $40-$5F: the low
 * mirror $60-$7F and the shifted range $C0-$DF. They draw the same glyph in
 * both banks, so a round trip is green either way - which is exactly why this
 * shipped wrong and nothing caught it.
 *
 * `~` ($7E) and `|` ($7C) live in that band. They are express.e's MCI opt-in
 * byte, tested on a `.seq`'s FIRST byte (express.e:6800-6806,
 * petscii-screen.render.ts:252), and the default MCI terminator. Written as
 * $DE and $DC, every token an artist authors in the studio reaches
 * `preparePetsciiSeq` as bytes it does not recognise: the gate never opens and
 * the screen prints the token's letters as art. Nothing throws and nothing
 * logs.
 */
describe('the bytes a tilde and a bar are written as', () => {
  /** A screen holding exactly one screen code, at 0,0, in white. */
  function oneCell(screenCode: number): PetsciiMachineState {
    const machine = new PetsciiMachine();
    machine.state.screen[0] = screenCode;
    machine.state.colorRam[0] = 1; // white
    return machine.state;
  }

  it('writes the pi glyph as 0x7E, the byte the MCI gate reads', () => {
    const written = writeSeq(oneCell(0x5e), { declareCharset: false });
    expect([...written]).toContain(0x7e);
    expect([...written]).not.toContain(0xde);
  });

  it('writes screen code 0x5C as 0x7C, the default MCI terminator', () => {
    const written = writeSeq(oneCell(0x5c), { declareCharset: false });
    expect([...written]).toContain(0x7c);
    expect([...written]).not.toContain(0xdc);
  });

  it('still reads back to the same screen codes across the whole band', () => {
    for (let code = 0x40; code <= 0x5f; code++) {
      const written = writeSeq(oneCell(code), { declareCharset: false });
      const back = new PetsciiMachine();
      back.feed(written);
      expect(back.state.screen[0]).toBe(code);
    }
  });
});
