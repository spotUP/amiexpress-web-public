/**
 * A door's exit must hand the board a clean terminal.
 *
 * Every TypeScript door tears down through Screen.destroy(), and it used to
 * write: show cursor, CLEAR, home, reset. Under background-colour-erase -
 * which xterm.js implements - `ESC[2J` fills the erased screen with the
 * background that is live at that moment, so a door whose last drawn cell was
 * blue painted the whole terminal blue, and the reset that followed could not
 * un-paint it. Reported as "all typescript doors leak colors more or less";
 * the C door THEMEC never did, because its teardown resets FIRST:
 * `ESC[0m ESC[2J ESC[H ESC[?25h` (measured 2026-09-07).
 */
import { Screen } from '../../engines/ui/blessed/core/screen';
import { Box } from '../../engines/ui/blessed/widgets/box';

const RESET = '\x1b[0m';
const CLEAR = '\x1b[2J';

function exitBytesOf(paint: (screen: Screen) => void): string {
  const writes: string[] = [];
  const screen = new Screen({ title: 'exit', width: 80, height: 24, output: (d: string) => writes.push(d) } as any);
  paint(screen);
  screen.render();
  writes.length = 0;           // only what EXIT writes
  screen.destroy();
  return writes.join('');
}

describe('what a door writes on its way out', () => {
  let exit: string;

  beforeAll(() => {
    exit = exitBytesOf(screen => {
      // A coloured panel, so the background is live when the door leaves.
      new Box({ parent: screen, top: 20, left: 60, width: 20, height: 4, content: 'bye',
        style: { fg: 'yellow', bg: 'blue' } } as any);
    });
  });

  it('resets attributes BEFORE it clears, so the clear erases to the default background', () => {
    const firstReset = exit.indexOf(RESET);
    const clear = exit.indexOf(CLEAR);
    expect(clear).toBeGreaterThan(-1);
    expect(firstReset).toBeGreaterThan(-1);
    expect(firstReset).toBeLessThan(clear);
  });

  it('ends on a reset, so nothing after the clear can leave an attribute live', () => {
    const sgrs = exit.match(/\x1b\[[0-9;]*m/g) || [];
    expect(sgrs.length).toBeGreaterThan(0);
    expect(sgrs[sgrs.length - 1]).toBe(RESET);
  });

  it('never carries a colour between the clear and the end', () => {
    const afterClear = exit.slice(exit.indexOf(CLEAR) + CLEAR.length);
    const coloured = (afterClear.match(/\x1b\[[0-9;]*m/g) || []).filter(s => s !== RESET);
    expect(coloured).toEqual([]);
  });

  it('still shows the cursor and homes it', () => {
    expect(exit).toContain('\x1b[?25h');
    expect(exit).toMatch(/\x1b\[(1;1H|H)/);
  });
});
