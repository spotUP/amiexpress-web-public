/**
 * The one scrollbar on a C64 (sysop, 2026-10-15): a reverse-video space.
 *
 * The bytes below are what the C SDK's ui_list_draw writes for a 30-row list
 * on a screen without cell backgrounds (classic palette: thumb = BAR blue,
 * track = DIM gray), captured from sdk/c/src/ui_list.c. They go through the
 * board's real transducer into the KERNAL oracle: a bar cell must come out
 * as screen code $A0 (reverse space = a solid block), in the role's colour,
 * and never as a '?' or a plain blank.
 */
import { describe, it, expect } from '@jest/globals';
import { AnsiToPetsciiTransducer } from '../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../petscii/petscii-machine';

const E = '\x1b';
// thumb cell (row 1) then two track cells (rows 2, 3), column 10.
const frame =
  `${E}[0;38;2;0;0;170m${E}[7m${E}[1;10H ${E}[27m` +
  `${E}[0;37m${E}[2;1Hr1       ${E}[1;38;2;85;85;85m${E}[7m${E}[2;10H ${E}[27m` +
  `${E}[0;37m${E}[3;1Hr2       ${E}[1;38;2;85;85;85m${E}[7m${E}[3;10H ${E}[27m`;

describe('the C SDK scroll bar on a C64', () => {
  const machine = new PetsciiMachine();
  machine.feed(Array.from(new AnsiToPetsciiTransducer().transduce(`${E}[2J` + frame)));
  const cell = (x: number, y: number) => ({
    code: machine.state.screen[y * 40 + x],
    colour: machine.state.colorRam[y * 40 + x],
  });

  it('draws the thumb as a reverse-video space', () => {
    expect(cell(9, 0).code).toBe(0xa0);
  });

  it('draws the track as a reverse-video space in another colour', () => {
    expect(cell(9, 1).code).toBe(0xa0);
    expect(cell(9, 2).code).toBe(0xa0);
    expect(cell(9, 1).colour).not.toBe(cell(9, 0).colour);
  });

  it('leaves the row text beside the bar alone', () => {
    expect(machine.state.screen[1 * 40 + 0]).toBe(0x12);  // 'r' as a screen code
  });
});
