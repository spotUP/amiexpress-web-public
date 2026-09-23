/**
 * THE ROWS A PETSCII SCREEN THROWS AWAY ARE KEPT, SO A CALLER CAN SCROLL BACK.
 *
 * "scrollback does not work petscii" (the sysop, 2026-09-24), the day after
 * the ANSI surface got its history back. It never worked: a PETSCII session
 * runs on the canvas, not on xterm, and the screen model under the canvas
 * dropped the top row on every scroll and wiped all thousand cells on every
 * `$93`. There was nothing to scroll back TO.
 *
 * The model keeps them now - but only when it is asked to. A real C64 has no
 * history, and the transducer's private oracle machine is never looked at, so
 * `historyRows` is off unless the thing that DRAWS wants it.
 */
import { PetsciiMachine } from '../../petscii/petscii-machine';
import { WideScreenMachine } from '../../petscii/wide-screen-machine';

const CLEAR = 0x93;
const RETURN = 0x0d;

/** The screen codes of a retired row, as text. */
function rowText(machine: PetsciiMachine, back: number): string {
  const row = machine.historyRow(back);
  if (!row) return '';
  // Screen codes 0x01-0x1a are A-Z; 0x30-0x39 are the digits; 0x20 is a space.
  return Array.from(row.screen)
    .map((c) => {
      if (c >= 0x01 && c <= 0x1a) return String.fromCharCode(0x40 + c);
      if (c >= 0x30 && c <= 0x39) return String.fromCharCode(c);
      return ' ';
    })
    .join('')
    .trimEnd();
}

/** Print `text` on its own row, then move to the next one. */
function line(machine: PetsciiMachine, text: string): void {
  machine.feed(Array.from(text).map((ch) => ch.charCodeAt(0)));
  machine.feed([RETURN]);
}

describe('a machine that was not asked for a history', () => {
  it('keeps none, which is a C64 exactly', () => {
    const machine = new PetsciiMachine();
    for (let i = 0; i < 40; i++) line(machine, `ROW ${i}`);
    machine.feed([CLEAR]);

    expect(machine.historyLength).toBe(0);
    expect(machine.historyRow(1)).toBeUndefined();
  });
});

describe('a row that scrolls off the top', () => {
  it('is in the history, with the text that was on it', () => {
    const machine = new PetsciiMachine({ historyRows: 100 });
    // Twenty-five rows fill the screen; the twenty-sixth scrolls the first off.
    for (let i = 0; i < 26; i++) line(machine, `ROW${i}`);

    expect(machine.historyLength).toBeGreaterThan(0);
    expect(rowText(machine, machine.historyLength)).toBe('ROW0');
  });

  it('keeps its colour RAM, not just its characters', () => {
    const machine = new PetsciiMachine({ historyRows: 100 });
    machine.feed([0x1c]); // red
    for (let i = 0; i < 26; i++) line(machine, 'X');

    const oldest = machine.historyRow(machine.historyLength)!;
    expect(oldest.color[0]).toBe(2); // VIC red
  });
});

describe('the screen a clear is about to wipe', () => {
  it('goes into the history whole, wherever the cursor was standing', () => {
    const machine = new PetsciiMachine({ historyRows: 100 });
    line(machine, 'FIRST');
    line(machine, 'SECOND');
    machine.feed([CLEAR]);

    expect(machine.historyLength).toBe(2);
    expect(rowText(machine, 2)).toBe('FIRST');
    expect(rowText(machine, 1)).toBe('SECOND');
  });

  it('does not pad the history with the blank rows under it', () => {
    const machine = new PetsciiMachine({ historyRows: 100 });
    line(machine, 'ONLY');
    machine.feed([CLEAR]);

    // Twenty-four blank rows followed that line on the screen.
    expect(machine.historyLength).toBe(1);
  });

  it('retires nothing at all when the screen is already blank', () => {
    const machine = new PetsciiMachine({ historyRows: 100 });
    machine.feed([CLEAR]);
    machine.feed([CLEAR]);

    expect(machine.historyLength).toBe(0);
  });

  it('keeps every row of a full screen - not just the ones above the cursor', () => {
    const machine = new PetsciiMachine({ historyRows: 100 });
    for (let i = 0; i < 25; i++) machine.feed(Array.from(`R${i}`).map((c) => c.charCodeAt(0)).concat([RETURN]));
    machine.feed([0x13]); // HOME: the cursor goes back to the top, the screen stays
    machine.feed([CLEAR]);

    expect(machine.historyLength).toBe(25);
  });
});

describe('a history that is full', () => {
  it('drops the oldest row rather than growing for ever', () => {
    const machine = new PetsciiMachine({ historyRows: 4 });
    for (let i = 0; i < 40; i++) line(machine, `R${i}`);

    expect(machine.historyLength).toBe(4);
  });
});

describe('the wide screen', () => {
  it('keeps a history too, eighty cells to the row', () => {
    const machine = new WideScreenMachine({ historyRows: 50 });
    for (let i = 0; i < 26; i++) line(machine, `W${i}`);

    expect(machine.historyLength).toBeGreaterThan(0);
    expect(machine.historyRow(1)!.screen.length).toBe(80);
  });

  it('is still eighty columns wide when a history was asked for', () => {
    expect(new WideScreenMachine({ historyRows: 50 }).state.cols).toBe(80);
  });
});

describe('a history that is dropped', () => {
  it('is empty again', () => {
    const machine = new PetsciiMachine({ historyRows: 100 });
    for (let i = 0; i < 30; i++) line(machine, `R${i}`);
    machine.clearHistory();

    expect(machine.historyLength).toBe(0);
  });
});
