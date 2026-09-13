/**
 * Shared dialog mechanics: double-submit guard + focus ring.
 *
 * Every dialog carried its own `saving` flag and its own Tab index
 * math (WHIP's task and project editors, word for word). Pinned here
 * so the next dialog reuses instead of retyping.
 */

import { Screen, Box } from '../../engines/ui/blessed';
import { guardDoubleSubmit, advanceFocus, retreatFocus } from '../../utils/blessed-helpers';

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

describe('guardDoubleSubmit', () => {
  it('runs once under concurrent saves', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const save = guardDoubleSubmit(async () => { calls++; await gate; });
    const a = save();
    const b = save();
    release();
    await Promise.all([a, b]);
    expect(calls).toBe(1);
  });

  it('re-arms after settle, including rejection', async () => {
    let calls = 0;
    const ok = guardDoubleSubmit(async () => { calls++; });
    await ok();
    await ok();
    expect(calls).toBe(2);

    let fails = 0;
    const bad = guardDoubleSubmit(async () => { fails++; throw new Error('nope'); });
    await expect(bad()).rejects.toThrow('nope');
    await expect(bad()).rejects.toThrow('nope');
    expect(fails).toBe(2);
  });
});

describe('focus ring', () => {
  function ringScreen(): { screen: any; ring: any[] } {
    const screen: any = makeScreen();
    const ring = [0, 1, 2].map(() => new Box({
      parent: screen, top: 0, left: 0, width: 10, height: 1,
      focusable: true,
    } as any));
    return { screen, ring };
  }

  it('tabs forward through the ring and wraps', () => {
    const { screen, ring } = ringScreen();
    try {
      ring[0].focus();
      advanceFocus(screen, ring);
      expect(screen._focused).toBe(ring[1]);
      advanceFocus(screen, ring);
      expect(screen._focused).toBe(ring[2]);
      advanceFocus(screen, ring);
      expect(screen._focused).toBe(ring[0]);
    } finally { screen.destroy(); }
  });

  it('shift-tabs backwards and wraps', () => {
    const { screen, ring } = ringScreen();
    try {
      ring[0].focus();
      retreatFocus(screen, ring);
      expect(screen._focused).toBe(ring[2]);
    } finally { screen.destroy(); }
  });

  it('an outsider restarts at the front, never strands', () => {
    const screen: any = makeScreen();
    try {
      const ring = [new Box({ parent: screen, focusable: true } as any)];
      const outsider = new Box({ parent: screen, focusable: true } as any);
      outsider.focus();
      advanceFocus(screen, ring);
      expect(screen._focused).toBe(ring[0]);
    } finally { screen.destroy(); }
  });

  it('shift-tab from outside the ring lands on the same field tab does', () => {
    // Four fields, so a wrong answer is distinguishable: the old
    // arithmetic returned ring[len - 2] - the second-to-LAST field - for
    // an off-ring focus, while advanceFocus documented and delivered the
    // front. Shift+Tab out of a message box jumped to field three.
    const screen: any = makeScreen();
    try {
      const ring = [0, 1, 2, 3].map(() => new Box({ parent: screen, focusable: true } as any));
      const outsider = new Box({ parent: screen, focusable: true } as any);

      outsider.focus();
      retreatFocus(screen, ring);
      expect(screen._focused).toBe(ring[0]);

      outsider.focus();
      advanceFocus(screen, ring);
      expect(screen._focused).toBe(ring[0]);
    } finally { screen.destroy(); }
  });
});
