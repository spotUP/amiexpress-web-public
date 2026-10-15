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
  it('at eighty columns the toast is a themed frame: title in the top rule, name and tier framed', () => {
    const out = renderAchievementToast(unlock, 80);
    expect(out.startsWith('\x1b7')).toBe(true);
    expect(out.endsWith('\x1b8')).toBe(true);
    const lines = strip(out).split('\r\n').filter((l) => l !== '');
    // top rule + 2 body rows + bottom rule.
    expect(lines).toHaveLength(4);
    const w = toastWidth(80);
    for (const l of lines) expect(l.length).toBe(w);
    // The SDK's Amiga border alphabet.
    expect(lines[0].startsWith('.- ')).toBe(true);
    expect(lines[0]).toContain('ACHIEVEMENT UNLOCKED');
    expect(lines[3]).toBe(`\`${'-'.repeat(w - 2)}'`);
    expect(lines[1].startsWith('| ') && lines[1].endsWith(' |')).toBe(true);
    expect(lines[1]).toContain('Century');
    expect(lines[2]).toContain('SILVER, 10 pts');
    // Silver wears white; the reset follows every one of the four lines.
    expect(out).toContain('\x1b[0;37m');
    expect(out.split('\x1b[0m').length - 1).toBe(4);
  });

  it('no caller, Unicode-capable or not, is given PC box-drawing in the wide frame', () => {
    const out = strip(renderAchievementToast(unlock, 80, { unicode: true } as never));
    for (const g of ['┌', '─', '┐', '│', '└', '┘']) expect(out).not.toContain(g);
    expect(out).toContain('.- ACHIEVEMENT UNLOCKED');
  });

  it('at a middling width the toast is a centred trophy badge, ASCII at every terminal', () => {
    const out = renderAchievementToast(unlock, 60);
    const lines = strip(out).split('\r\n').filter((l) => l !== '');
    expect(lines).toHaveLength(5); // == rule, title, name, tier, == rule
    const w = lines[0].length;
    expect(lines[0]).toBe(`+${'='.repeat(w - 2)}+`);
    expect(lines[4]).toBe(lines[0]);
    expect(lines[1]).toContain('[*] ACHIEVEMENT UNLOCKED [*]');
    expect(lines[2]).toContain('Century');
    expect(lines[3]).toContain('SILVER, 10 pts');
    // Centred: the title row has leading spaces inside the frame.
    expect(lines[1]).toMatch(/^\| +\[\*\]/);
    // ASCII only.
    expect(/^[\x20-\x7e]*$/.test(strip(out).replace(/[\r\n]/g, ''))).toBe(true);
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

  it('every dressing is built from the same toastLines', () => {
    const w = toastWidth(80);
    const rows = toastLines(unlock, w - 4);
    // Wide frame: title in the rule, name and tier framed below.
    const frame = strip(renderAchievementToast(unlock, 80)).split('\r\n').filter((l) => l !== '');
    expect(frame[0]).toContain(rows[0]);
    expect(frame[1].slice(2, -2).trimEnd()).toBe(rows[1]);
    expect(frame[2].slice(2, -2).trimEnd()).toBe(rows[2]);
    // Blessed overlay: the same three content lines.
    const writes: string[] = [];
    const screen = new Screen({ title: 't', width: 80, height: 24, output: (d: string) => writes.push(d) } as any);
    try {
      showAchievementToast(screen, unlock, 1000);
      for (const r of rows) expect(writes.join('')).toContain(r.trimEnd());
    } finally {
      screen.destroy();
    }
  });
});
