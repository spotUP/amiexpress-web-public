/**
 * `attachDoorChrome` - the ONE call that gives a door the full theme chrome.
 *
 * Sysop, 2026-09-03: "almost none of the doors that use it has the full
 * chrome with the animated slashes and glitches etc - fix it, only colors
 * makes no great theme". Six doors each wired a different subset of
 * attachMasthead / attachGlitches / footerHints, nine wired none, and DOORS
 * - the screen everything else was measured against - hand-rolled its own
 * copy of the masthead timer and the footer builder.
 *
 * These tests drive the entry point itself, not a source pin: they assert
 * what lands on the masthead row and the footer row at 80 columns (rail,
 * title, hints, branding tail, moving), and what does NOT at 40 (no rail,
 * no tail, no timer of any kind).
 */

const {
  attachDoorChrome,
  themeById,
  themeStyles,
} = require('../../engines/ui/theme');

/** The little blessed a chrome target has to be. */
function target() {
  let content = '';
  return {
    setContent(text: string) { content = text; },
    getContent() { return content; },
  };
}

/** A list-shaped target, which is what glitches are attached to. */
function listTarget(rows: string[]) {
  const el: any = {
    items: rows.map((r) => r),
    setItems(next: string[]) { el.items = next; },
  };
  return el;
}

const NEON = themeById('uprough-neon');
const CLASSIC = themeById('classic');

describe('attachDoorChrome at 80 columns', () => {
  jest.useFakeTimers();

  afterEach(() => { jest.clearAllTimers(); });

  it('draws the rail, the title, the hints and the branding tail, and moves', () => {
    const masthead = target();
    const footer = target();
    const list = listTarget(['one', 'two', 'three', 'four', 'five', 'six']);
    let renders = 0;

    const chrome = attachDoorChrome(NEON, {
      width: 80,
      title: 'DOOR GAMES',
      masthead,
      footer,
      glitch: list,
      hints: [
        { key: 'Up/Down', does: 'Navigate' },
        { key: 'Q', does: 'Quit' },
      ],
      styles: themeStyles(NEON),
      render: () => { renders++; },
      seed: 7,
    });

    // The masthead: the theme's rail run, then the headline.
    const first = masthead.getContent();
    expect(first).toContain(NEON.rail);
    expect(first).toContain('DOOR GAMES');

    // ...and it MOVES. The draw-in frames run first, then the slide.
    jest.advanceTimersByTime(1000);
    const later = masthead.getContent();
    expect(later).not.toBe(first);
    expect(renders).toBeGreaterThan(0);

    // The footer: key caps, descriptions, and the branding tail.
    const foot = footer.getContent();
    expect(foot).toContain('Up/Down:');
    expect(foot).toContain('Navigate');
    expect(foot).toContain('Quit');
    expect(foot).toContain(NEON.rail);

    // The glitches are live: a row is damaged and then repaired.
    expect(chrome.animated).toBe(true);

    chrome.stop();
  });

  it('runs the theme glitches on the element it was given', () => {
    const list = listTarget(['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd']);
    const before = list.items.join('\n');

    const chrome = attachDoorChrome(NEON, {
      width: 80,
      title: 'T',
      masthead: target(),
      footer: target(),
      glitch: list,
      hints: [{ key: 'Q', does: 'Quit' }],
      styles: themeStyles(NEON),
      render: () => undefined,
      // Deterministic: always glitch, always the same row.
      glitchOptions: { tickMs: 10, random: () => 0.01, now: () => 1_000_000 },
    });

    jest.advanceTimersByTime(50);
    expect(list.items.join('\n')).not.toBe(before);

    // ...and stop() puts the truth back, so a door that exits mid-glitch
    // never leaves the damage as the last thing on screen.
    chrome.stop();
    expect(list.items.join('\n')).toBe(before);
  });

  it('starts no glitch timer for a theme that did not ask for one', () => {
    const list = listTarget(['aaaa', 'bbbb', 'cccc', 'dddd']);
    const before = list.items.join('\n');
    const chrome = attachDoorChrome(CLASSIC, {
      width: 80,
      title: 'T',
      masthead: target(),
      footer: target(),
      glitch: list,
      hints: [{ key: 'Q', does: 'Quit' }],
      styles: themeStyles(CLASSIC),
      render: () => undefined,
      glitchOptions: { tickMs: 10, random: () => 0.01, now: () => 1_000_000 },
    });
    jest.advanceTimersByTime(500);
    expect(list.items.join('\n')).toBe(before);
    chrome.stop();
  });
});

describe('attachDoorChrome at 40 columns (the C64/PETSCII tier)', () => {
  jest.useFakeTimers();

  afterEach(() => { jest.clearAllTimers(); });

  it('draws a STATIC masthead and a footer, and starts no timer at all', () => {
    const masthead = target();
    const footer = target();
    const list = listTarget(['aaaa', 'bbbb', 'cccc', 'dddd']);
    const listBefore = list.items.join('\n');

    const chrome = attachDoorChrome(NEON, {
      width: 40,
      title: 'DOOR GAMES',
      masthead,
      footer,
      glitch: list,
      hints: [{ key: 'Up/Down', does: 'Navigate' }, { key: 'Q', does: 'Quit' }],
      compactHints: [{ key: 'Up/Dn', does: 'Move' }, { key: 'Q', does: 'Quit' }],
      styles: themeStyles(NEON),
      render: () => undefined,
    });

    expect(chrome.animated).toBe(false);

    // The title still draws; the rail does not. A moving rail on a
    // 40-column canvas leaves stray glyphs mid-row (DOORMAN, 2026-09-02).
    const drawn = masthead.getContent();
    expect(drawn).toContain('DOOR GAMES');
    expect(drawn).not.toContain(NEON.rail);

    // The compact hints, and no branding tail - 40 columns has no cells to
    // spend on decoration.
    const foot = footer.getContent();
    expect(foot).toContain('Up/Dn:');
    expect(foot).toContain('Move');
    expect(foot).not.toContain(NEON.rail);
    expect(printable(foot).length).toBeLessThanOrEqual(40);

    // Nothing moves and nothing is damaged, however long we wait.
    jest.advanceTimersByTime(10_000);
    expect(masthead.getContent()).toBe(drawn);
    expect(footer.getContent()).toBe(foot);
    expect(list.items.join('\n')).toBe(listBefore);

    chrome.stop();
  });
});

describe('attachDoorChrome housekeeping', () => {
  jest.useFakeTimers();
  afterEach(() => { jest.clearAllTimers(); });

  it('stop() leaves the rail at rest and stops repainting', () => {
    const masthead = target();
    const chrome = attachDoorChrome(NEON, {
      width: 80,
      title: 'T',
      masthead,
      render: () => undefined,
      styles: themeStyles(NEON),
    });
    jest.advanceTimersByTime(500);
    chrome.stop();
    const atRest = masthead.getContent();
    jest.advanceTimersByTime(5_000);
    expect(masthead.getContent()).toBe(atRest);
  });

  it('setHints() and setFooterSuffix() repaint the footer row', () => {
    const footer = target();
    const chrome = attachDoorChrome(CLASSIC, {
      width: 80,
      title: 'T',
      masthead: target(),
      footer,
      hints: [{ key: 'Q', does: 'Quit' }],
      styles: themeStyles(CLASSIC),
      render: () => undefined,
    });
    chrome.setHints([{ key: 'X', does: 'Close' }]);
    expect(footer.getContent()).toContain('Close');
    chrome.setFooterSuffix('  Last Update: 12:00');
    expect(footer.getContent()).toContain('Last Update: 12:00');
    expect(footer.getContent()).toContain('Close');
    expect(chrome.footerContent()).toBe(footer.getContent());
    chrome.stop();
  });
});

/** blessed tags are not glyphs on the glass. */
function printable(s: string): string {
  return s.replace(/\{[^}]*\}/g, '');
}
