/**
 * A theme change re-colours the chrome; it does not restart the rail.
 *
 * Sysop, 2026-09-07: "the ///'s redraw for every time i press enter on an
 * entry in the list". THEME re-attached the whole chrome on every select,
 * which puts the masthead run back to frame zero - the visible redraw.
 */
import { attachDoorChrome, attachMasthead } from '../../engines/ui/theme/chrome';
import { themeById, themeStyles } from '../../engines/ui/theme';

const rowOf = (): { content: string; setContent(t: string): void; getContent(): string } => {
  let content = '';
  return { get content() { return content; }, setContent(t: string) { content = t; }, getContent() { return content; } };
};

describe('re-theming the chrome in place', () => {
  it('the masthead keeps its phase across a retheme, and a stop still stops it', () => {
    jest.useFakeTimers();
    const row = rowOf();
    const a = themeById('uprough-neon');
    const handle = attachMasthead(row as any, a, {
      title: 'DOOR', width: 60, rail: (t: string) => `<${t}>`, ink: (t: string) => t, render: () => {}, seed: 7,
    });
    try {
      expect(handle.railed).toBe(true);
      jest.advanceTimersByTime(1000);
      const before = row.getContent();
      expect(before).toContain('<');

      // Re-coloured, same rail: the RUN is byte-identical, so the slide
      // did not jump. (A different theme brings different rail glyphs; what
      // must not change is the phase, and the same-rail case shows it.)
      handle.retheme(a, (t: string) => `[${t}]`, (t: string) => t);
      const after = row.getContent();
      expect(after.startsWith('[')).toBe(true);
      expect(after.slice(1, after.indexOf(']'))).toBe(before.slice(1, before.indexOf('>')));

      // And a RESTART would have jumped: a fresh masthead at the same seed
      // paints frame zero, which is not the frame in flight.
      const fresh = rowOf();
      const restarted = attachMasthead(fresh as any, a, {
        title: 'DOOR', width: 60, rail: (t: string) => `[${t}]`, ink: (t: string) => t, render: () => {}, seed: 7,
      });
      try {
        expect(fresh.getContent().slice(1, fresh.getContent().indexOf(']'))).not.toBe(after.slice(1, after.indexOf(']')));
      } finally {
        restarted();
      }

      jest.advanceTimersByTime(100);
      expect(row.getContent()).not.toBe(after);
    } finally {
      handle();
      jest.useRealTimers();
    }
  });

  it('setTheme repaints the footer and refuses only a theme that gains or loses its rail', () => {
    jest.useFakeTimers();
    const masthead = rowOf();
    const footer = rowOf();
    const railed = themeById('uprough-neon');
    const chrome = attachDoorChrome(railed, {
      width: 80, title: 'ACHIEVEMENTS', masthead: masthead as any, footer: footer as any,
      hints: [{ key: 'Q', does: 'Leave' }], showcase: true, styles: themeStyles(railed), render: () => {},
    });
    try {
      jest.advanceTimersByTime(500);
      const other = themeById('slate-slash');
      expect(Boolean(railed.rail) && Boolean(other.rail)).toBe(true);
      expect(chrome.setTheme(other, themeStyles(other))).toBe(true);
      expect(chrome.footerContent()).toContain('Leave');
      // The hints alone never touch the masthead.
      const before = masthead.getContent();
      chrome.setHints([{ key: 'Ent', does: 'Open' }]);
      expect(chrome.footerContent()).toContain('Open');
      expect(masthead.getContent()).toBe(before);

      const bare = { ...other, rail: undefined } as unknown as typeof other;
      expect(chrome.setTheme(bare, themeStyles(other))).toBe(false);
    } finally {
      chrome.stop();
      jest.useRealTimers();
    }
  });
});
