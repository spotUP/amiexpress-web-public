/**
 * "CTRL+NUMBER IN LIVECHAT PRINTS ?" (the sysop, 2026-09-23).
 *
 * A colour a caller picks travels through the board as `U+E200 + vic`
 * (`sdk/petscii/pua.ts`). Everything the BOARD emits folds that to SGR on the
 * way out (`ansi-buffer.util`), so the transducer never used to meet one -
 * but a DOOR's output does not go through that fold, and a codepoint with no
 * PETSCII code is drawn as `?`. The caller pressed Ctrl+3 in LIVE CHAT and
 * got a question mark in his own message.
 *
 * The transducer reads it as what it is. One rule: whoever hands it a pen
 * marker gets the pen, and nobody gets a question mark for a colour.
 */
import { AnsiToPetsciiTransducer } from '../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../petscii/petscii-machine';
import { colourMarker } from '../../petscii/pua';

function run(text: string) {
  const t = new AnsiToPetsciiTransducer();
  const out = Array.from(t.transduce(text));
  const display = new PetsciiMachine();
  display.feed(out);
  return { t, out, display };
}

const QUESTION_MARK = 0x3f;   // the screen code a `?` lands as
const RED = 2;

describe('a pen marker a door printed', () => {
  it('is the colour it names, not a question mark', () => {
    const { display } = run(`${colourMarker(RED)}A`);

    expect(display.state.screen[0]).not.toBe(QUESTION_MARK);
    expect(display.state.colorRam[0]).toBe(RED);
  });

  it('draws nothing of its own', () => {
    const { display } = run(`${colourMarker(RED)}A`);

    // The A is in the FIRST cell: the marker took no room.
    expect(display.state.cursorX).toBe(1);
  });

  it('colours what follows it, through to the next marker', () => {
    const GREEN = 5;
    const { display } = run(`${colourMarker(RED)}ab${colourMarker(GREEN)}c`);

    expect(display.state.colorRam[0]).toBe(RED);
    expect(display.state.colorRam[1]).toBe(RED);
    expect(display.state.colorRam[2]).toBe(GREEN);
  });

  it('leaves SGR the way it always worked', () => {
    const { display } = run('\x1b[31mZ');
    expect(display.state.colorRam[0]).toBe(RED);
  });
});
