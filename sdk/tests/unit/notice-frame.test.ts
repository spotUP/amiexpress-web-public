/**
 * The board notice (kind 'notice') through the shared toast: the sysop saw the
 * NOTIFY logon offer with a hard-cut second line led by a stray space, and a
 * border drawn in PC box-drawing glyphs the Amiga/Topaz web terminal does not
 * own. The frame now comes from the SDK's border alphabet (borderCharsFor).
 */
import { renderAchievementToast, toastLines, toastWidth } from '../../components/achievement-toast';
import { borderCharsFor } from '../../engines/ui/blessed/core/border-chars';
import type { AchievementNotice } from '../../components/achievement-toast';

const offer: AchievementNotice = {
  kind: 'notice',
  title: 'NOTIFICATIONS',
  text: 'Type NOTIFY to choose how the board reaches you: email, push or here.',
};
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b[78]/g, '');
const rowsOf = (s: string): string[] => strip(s).split('\r\n').filter((l) => l !== '');

describe('the board notice frame', () => {
  it('wraps the body on word boundaries with no leading space', () => {
    for (const inner of [60, 36]) {
      const [, ...body] = toastLines(offer, inner);
      const text = body.filter((l) => l !== '');
      expect(text.length).toBeGreaterThan(1);
      for (const l of text) {
        expect(l.startsWith(' ')).toBe(false);
        expect(l.length).toBeLessThanOrEqual(inner);
      }
      expect(text.join(' ')).toBe(offer.text);
    }
  });

  it('draws the frame with the SDK border characters and no PC box-drawing, web caller included', () => {
    const c = borderCharsFor('line', false);
    const rows = rowsOf(renderAchievementToast(offer, 80, { bare: true, unicode: true } as never));
    expect(rows[0].startsWith(c.tl + c.h + ' NOTIFICATIONS ')).toBe(true);
    expect(rows[0].endsWith(c.tr)).toBe(true);
    expect(rows[rows.length - 1]).toBe(c.bl + c.h.repeat(toastWidth(80) - 2) + c.br);
    for (const l of rows.slice(1, -1)) expect(l.startsWith(c.v + ' ') && l.endsWith(' ' + c.v)).toBe(true);
    expect(/^[\x20-\x7e]*$/.test(rows.join(''))).toBe(true);
    const w = toastWidth(80);
    for (const l of rows) expect(l.length).toBe(w);
  });

  it('fits forty columns, every row the same width, ASCII only', () => {
    const rows = rowsOf(renderAchievementToast(offer, 40, { bare: true, petscii: true }));
    expect(rows.join(' ')).toContain('here.');
    for (const l of rows) {
      expect(l.length).toBeLessThanOrEqual(40);
      expect(l.length).toBe(rows[0].length);
      expect(/^[\x20-\x7e]*$/.test(l)).toBe(true);
    }
  });
});
