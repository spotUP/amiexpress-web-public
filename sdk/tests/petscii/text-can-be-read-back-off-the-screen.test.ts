/**
 * A CALLER CAN COPY WHAT IS ON A PETSCII SCREEN.
 *
 * "i cant copy text in petscii mode" (the sysop, 2026-09-16). A PETSCII session
 * renders to a canvas, so there is no DOM text for the browser to select; the
 * terminal has to read the characters back out of screen memory itself. This
 * pins that read against a REAL machine - bytes fed in, text asked for - rather
 * than against a hand-built buffer, so a change to the screen-code tables or to
 * how the machine stores a row fails here.
 */
import { PetsciiMachine, screenTextInRect, rectFromCorners } from '../../petscii';

/** Type a line of ASCII onto a fresh screen, the way the board does. */
function screenWith(text: string): PetsciiMachine {
  const machine = new PetsciiMachine();
  machine.feed(Array.from(text, (c) => c.charCodeAt(0)));
  return machine;
}

describe('reading text back off a PETSCII screen', () => {
  it('gives back the line that was printed', () => {
    const machine = screenWith('HELLO BBS');
    const text = screenTextInRect(machine.state, { x: 0, y: 0, w: 40, h: 1 });
    expect(text).toBe('HELLO BBS');
  });

  it('drops the padding to the right but keeps the spacing inside', () => {
    const machine = screenWith('A  B');
    expect(screenTextInRect(machine.state, { x: 0, y: 0, w: 40, h: 1 })).toBe('A  B');
  });

  it('copies only the cells asked for', () => {
    const machine = screenWith('ABCDEFGH');
    expect(screenTextInRect(machine.state, { x: 2, y: 0, w: 3, h: 1 })).toBe('CDE');
  });

  it('reads several rows as several lines', () => {
    const machine = new PetsciiMachine();
    machine.feed(Array.from('ONE\rTWO', (c) => c.charCodeAt(0)));
    const text = screenTextInRect(machine.state, { x: 0, y: 0, w: 40, h: 2 });
    expect(text.split('\n')).toEqual(['ONE', 'TWO']);
  });

  it('an untouched screen copies as blank lines, not as junk', () => {
    const machine = new PetsciiMachine();
    expect(screenTextInRect(machine.state, { x: 0, y: 0, w: 40, h: 2 })).toBe('\n');
  });

  it('never runs off the end of screen memory', () => {
    const machine = screenWith('EDGE');
    const huge = screenTextInRect(machine.state, { x: -5, y: -5, w: 999, h: 999 });
    expect(huge.split('\n').length).toBe(machine.state.rows);
    expect(huge.split('\n')[0]).toBe('EDGE');
  });
});

describe('a drag, in either direction, is the rectangle it encloses', () => {
  it('reads the same whether dragged down-right or up-left', () => {
    expect(rectFromCorners({ x: 2, y: 1 }, { x: 5, y: 3 })).toEqual({ x: 2, y: 1, w: 4, h: 3 });
    expect(rectFromCorners({ x: 5, y: 3 }, { x: 2, y: 1 })).toEqual({ x: 2, y: 1, w: 4, h: 3 });
  });

  it('a click with no drag is one cell', () => {
    expect(rectFromCorners({ x: 7, y: 7 }, { x: 7, y: 7 })).toEqual({ x: 7, y: 7, w: 1, h: 1 });
  });
});
