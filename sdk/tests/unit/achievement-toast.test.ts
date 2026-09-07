/**
 * SP2-5 - the achievement toast: one widget, two ways in, one drawing.
 */
import { Screen } from '../../engines/ui/blessed/core/screen';
import { renderAchievementToast, showAchievementToast, toastLines, toastWidth } from '../../components/achievement-toast';
import type { AchievementNotice } from '../../components/achievement-toast';

const unlock: AchievementNotice = { kind: 'unlock', name: 'Century', tier: 'silver', points: 10 };
const link: AchievementNotice = { kind: 'link', doorCommand: 'achieve' };
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b[78]/g, '');

describe('the achievement toast', () => {
  it('at eighty columns the toast is three rows, boxed, and restores the cursor', () => {
    const out = renderAchievementToast(unlock, 80);
    expect(out.startsWith('\x1b7')).toBe(true);
    expect(out.endsWith('\x1b8')).toBe(true);
    const lines = strip(out).split('\r\n').filter((l) => l !== '');
    expect(lines).toHaveLength(5);
    const w = toastWidth(80);
    expect(lines[0]).toBe(`+${'-'.repeat(w - 2)}+`);
    expect(lines[4]).toBe(lines[0]);
    for (const l of lines.slice(1, 4)) {
      expect(l.length).toBe(w);
      expect(l.startsWith('| ')).toBe(true);
      expect(l.endsWith(' |')).toBe(true);
    }
    expect(lines[1]).toContain('ACHIEVEMENT UNLOCKED');
    expect(lines[2]).toContain('Century');
    expect(lines[3]).toContain('SILVER, 10 pts');
    // Silver wears white; the reset follows every line.
    expect(out).toContain('\x1b[0;37m');
    expect(out.split('\x1b[0m').length - 1).toBe(5);
  });

  it('at forty columns no row exceeds forty cells and no glyph is outside ASCII', () => {
    const out = renderAchievementToast({ ...unlock, name: 'A very long achievement name that cannot fit in forty' }, 40, { petscii: true });
    expect(out).not.toContain('\x1b[');
    const lines = strip(out).split('\r\n').filter((l) => l !== '');
    expect(lines).toHaveLength(5);
    for (const l of lines) {
      expect(l.length).toBeLessThanOrEqual(40);
      expect(/^[\x20-\x7e]*$/.test(l)).toBe(true);
    }
    expect(lines[2]).toMatch(/~ \|$/); // clipped, marked
    // The link notice names the door.
    expect(toastLines(link, 60)[1]).toBe('Type ACHIEVE at the prompt to link');
  });

  /**
   * A PETSCII screen is 40 columns on a C64 and 80 on the web terminal's wide
   * screen, so the toast takes the width it is GIVEN rather than clamping
   * every PETSCII caller to forty - which it did while a C64 was the only
   * PETSCII screen there was. Eighty is the widest one that exists, so a
   * claim past it is still refused.
   */
  it('a PETSCII caller is given his own width, up to the widest PETSCII screen', () => {
    const widthOf = (claim: number): number =>
      strip(renderAchievementToast(link, claim, { petscii: true })).split('\r\n')[0].length;

    expect(widthOf(40)).toBeLessThanOrEqual(40);
    const wide = widthOf(80);
    expect(wide).toBeGreaterThan(40);
    expect(wide).toBeLessThanOrEqual(80);
    // Nothing on this board is a 132-column PETSCII screen.
    expect(widthOf(132)).toBe(wide);
    // ...and no SGR reaches a PETSCII caller at any width.
    expect(renderAchievementToast(link, 80, { petscii: true })).not.toContain('\x1b[');
  });

  it('inside a blessed screen the overlay takes no focus and expires on its timer', () => {
    jest.useFakeTimers();
    const writes: string[] = [];
    const screen = new Screen({ title: 'toast', width: 80, height: 24, output: (d: string) => writes.push(d) } as any);
    try {
      const box = showAchievementToast(screen, unlock, 1000);
      expect((box as any).options?.focusable ?? (box as any).focusable ?? false).toBeFalsy();
      expect(screen.focused).not.toBe(box);
      expect(writes.join('')).toContain('Century');
      expect(screen.children.includes(box)).toBe(true);
      jest.advanceTimersByTime(1001);
      expect(screen.children.includes(box)).toBe(false);
    } finally {
      screen.destroy();
      jest.useRealTimers();
    }
  });

  it('the BBS render and the blessed render draw the same three lines', () => {
    const w = toastWidth(80);
    const fromBytes = strip(renderAchievementToast(unlock, 80)).split('\r\n').slice(1, 4).map((l) => l.slice(2, -2).trimEnd());
    expect(fromBytes).toEqual(toastLines(unlock, w - 4).map((l) => l.trimEnd()));
  });
});
