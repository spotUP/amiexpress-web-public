/**
 * Focused borders are white, automatically, on every door.
 *
 * Element painted focused-child borders cyan bold by default, which
 * fought whatever the door painted itself (WHIP's yellow active column
 * rendered cyan) and bold violates the BBS output rules. Doors now get
 * a white focus border for free; an explicit style.focus/hover/disabled
 * block still wins. resolveStateBorder is pinned directly so a future
 * refactor of the render path keeps the contract.
 */

import { Screen, Box, List } from '../../engines/ui/blessed';

function makeScreen(): any {
  return new Screen({
    output: () => {},
    input: {
      on: () => {}, once: () => {}, removeListener: () => {},
      setRawMode: () => {}, resume: () => {}, pause: () => {}, isTTY: true,
    },
    terminal: 'xterm-256color',
  } as any);
}

function boxWithChild(screen: any): { box: any; list: any } {
  const box: any = new Box({
    parent: screen, top: 0, left: 0, width: 30, height: 8,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
  } as any);
  const list: any = new List({
    parent: box, top: 1, left: 1, width: 26, height: 4,
    items: ['a', 'b'], keys: false, mouse: false,
  } as any);
  return { box, list };
}

describe('resolveStateBorder', () => {
  it('defaults an unfocused border to no override', () => {
    const screen = makeScreen();
    try {
      const { box } = boxWithChild(screen);
      expect(box.resolveStateBorder()).toBeUndefined();
    } finally { screen.destroy(); }
  });

  it('defaults a focused border to white without bold', () => {
    const screen = makeScreen();
    try {
      const { box, list } = boxWithChild(screen);
      list.focus();
      expect(box.hasFocusedChild()).toBe(true);
      expect(box.resolveStateBorder()).toEqual({ fg: 'white' });
    } finally { screen.destroy(); }
  });

  it('an explicit focus block beats the default', () => {
    const screen = makeScreen();
    try {
      const { box, list } = boxWithChild(screen);
      box.options.style = { border: { fg: 'cyan' }, focus: { border: { fg: 'green' } } };
      list.focus();
      expect(box.resolveStateBorder()).toEqual({ fg: 'green' });
    } finally { screen.destroy(); }
  });

  it('disabled wins over focus, in gray', () => {
    const screen = makeScreen();
    try {
      const { box, list } = boxWithChild(screen);
      list.focus();
      box.disabled = true;
      expect(box.resolveStateBorder()).toEqual({ fg: 'gray' });
    } finally { screen.destroy(); }
  });
});
