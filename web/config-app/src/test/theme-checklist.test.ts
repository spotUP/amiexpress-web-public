/**
 * An artist can see what a finished theme is, and how far along they are.
 *
 * The studio showed only screens that already had art, so the eighteen the
 * board has no art for - the ones with the most to gain - were invisible, and
 * there was no way to start one. The board's catalogue is the definition of
 * complete; this is that catalogue as a list of slots.
 */
import { describe, expect, it } from 'vitest';
import { themeChecklist, themeProgress } from '../pages/theme-checklist';
import type { ScreenIndexShape } from '../pages/screen-index-view';

const index = (files: string[], conferences = [1, 2]) => ({
  conferences: conferences.map(id => ({ id, name: `Conf ${id}`, dir: `Conf${id}` })),
  files: Object.fromEntries(files.map(f => [f, { relPath: f }])),
  screens: [], unused: [], bulletins: [], callersByLevel: {}, builtAt: '',
} as unknown as ScreenIndexShape);

describe('what a complete theme is', () => {
  it('lists every screen the board can display, not just the ones with art', () => {
    const slots = themeChecklist(index([]), 'neon');

    expect(slots.length).toBeGreaterThan(35);
    expect(slots.some(s => s.screen === 'PRIVATE')).toBe(true);   // no art on the board at all
    expect(slots.some(s => s.screen === 'BBSTITLE')).toBe(true);
    expect(slots.every(s => s.drawn)).toBe(false);
  });

  it('puts each screen at the path inside the theme where the board reads it', () => {
    const slots = themeChecklist(index([]), 'neon');

    expect(slots.find(s => s.screen === 'BBSTITLE')!.path).toBe('Themes/neon/Node/BBSTITLE.TXT');
    expect(slots.find(s => s.screen === 'BULL')!.path).toBe('Themes/neon/Board/BULL.TXT');
    // The catalogue name is not always the file name.
    expect(slots.find(s => s.screen === 'LOGON24')!.path).toBe('Themes/neon/Board/Logon24hrs.TXT');
    expect(slots.find(s => s.screen === 'CONF_BULL' && s.conference === 2)!.path)
      .toBe('Themes/neon/Conf/2/BULL.TXT');
  });

  it('asks for a conference screen once per conference, because that is the work', () => {
    const slots = themeChecklist(index([], [1, 2, 3]), 'neon');

    expect(slots.filter(s => s.screen === 'CONF_BULL').map(s => s.conference)).toEqual([1, 2, 3]);
  });

  /*
   * EXCEPT THE MAIN MENU: a theme draws it once and every conference falls back
   * to it. Five slots asked for the same menu five times, and the four left
   * undone went on serving the template (h7, 2026-10-02).
   */
  it('asks for the main menu once, in the directory every conference falls back to', () => {
    const slots = themeChecklist(index(['Themes/neon/Conf/2/Menu.txt'], [1, 2, 3]), 'neon');
    const menus = slots.filter(s => s.screen === 'MENU');

    expect(menus).toHaveLength(1);
    expect(menus[0]).toMatchObject({ label: 'Main menu', path: 'Themes/neon/Conf/MENU.TXT', conference: undefined });
    // A conference's own copy is an override, not the theme's main menu.
    expect(menus[0].drawn).toBe(false);
    expect(themeChecklist(index(['Themes/neon/Conf/Menu.txt']), 'neon').find(s => s.screen === 'MENU')!.drawn).toBe(true);
  });

  it('counts a screen as drawn whatever case or extension it arrived in', () => {
    const slots = themeChecklist(index([
      'Themes/neon/Node/bbstitle.txt',      // lower case
      'Themes/neon/Board/BULL.GR',          // a different extension
    ]), 'neon');

    expect(slots.find(s => s.screen === 'BBSTITLE')!.drawn).toBe(true);
    expect(slots.find(s => s.screen === 'BULL' && s.scope === 'board')!.drawn).toBe(true);
    expect(slots.find(s => s.screen === 'PRIVATE')!.drawn).toBe(false);
  });

  it('does not count another theme\'s files as this one\'s', () => {
    const slots = themeChecklist(index(['Themes/other/Node/BBSTITLE.TXT']), 'neon');

    expect(slots.find(s => s.screen === 'BBSTITLE')!.drawn).toBe(false);
  });

  it('reports progress overall and by scope, so an artist sees where the work is', () => {
    const slots = themeChecklist(index(['Themes/neon/Node/BBSTITLE.TXT'], [1]), 'neon');
    const progress = themeProgress(slots);

    expect(progress.drawn).toBe(1);
    expect(progress.total).toBe(slots.length);
    expect(progress.byScope.node.drawn).toBe(1);
    expect(progress.byScope.board.drawn).toBe(0);
    expect(progress.byScope.conf.total).toBeGreaterThan(0);
  });
});

/**
 * The board writes its own leaderboard; an artist must not be asked to draw it.
 *
 * `ACHIEVETOP` is in the screen catalogue because the login sequence displays
 * it, but `achievements/bulletin.ts` rewrites the file every fifteen minutes.
 * Offering it as a slot invites an artist to spend an evening on a screen that
 * is overwritten before they log out - and a theme copy of it froze the live
 * board's leaderboards once already.
 */
describe('screens the board writes for itself', () => {
  it('are not slots an artist is asked to draw', () => {
    const slots = themeChecklist(undefined, 'neon');
    expect(slots.some(slot => slot.screen === 'ACHIEVETOP')).toBe(false);
  });

  it('leaves every hand-drawn screen in the list', () => {
    const slots = themeChecklist(undefined, 'neon');
    expect(slots.some(slot => slot.screen === 'BBSTITLE')).toBe(true);
    expect(slots.some(slot => slot.screen === 'LOGON')).toBe(true);
    expect(slots.some(slot => slot.screen === 'BULL')).toBe(true);
  });
});

/**
 * The logos count too.
 *
 * LOGON splices in two group logos and LOGOFF picks from three; they live in
 * `Screens/` under names no catalogue claims, so the checklist did not know
 * they existed and an artist's "44 of 44" theme still wore somebody else's
 * logo. They are reached by PATH, so their slot is the theme's `Files/`
 * mirror - the tree that arm of the loader reads.
 */
describe('art a screen pulls in by path', () => {
  const withLogos = {
    builtAt: '', unused: [], screens: [], conferences: [{ id: 1 }],
    files: {
      'Screens/flt.txt': {
        relPath: 'Screens/flt.txt', bytes: 10, format: 'ansi', sha256: 'a', mci: [],
        readBy: [{ screen: 'LOGON', scope: 'node', id: 1, via: 'include' }],
      },
      'Screens/BULL.TXT': {
        relPath: 'Screens/BULL.TXT', bytes: 10, format: 'ansi', sha256: 'b', mci: [],
        readBy: [{ screen: 'BULL', scope: 'board', id: null, via: 'resolved' }],
      },
      'Screens/lastc.txt': {
        relPath: 'Screens/lastc.txt', bytes: 10, format: 'ansi', sha256: 'c', mci: [],
        generated: 'runtime',
        readBy: [{ screen: 'LOGON', scope: 'node', id: 1, via: 'include' }],
      },
    },
  } as unknown as ScreenIndexShape;

  it('is a slot, in the mirror the loader reads for it', () => {
    const slot = themeChecklist(withLogos, 'neon').find(s => s.screen === 'flt.txt');

    expect(slot).toBeDefined();
    expect(slot!.scope).toBe('files');
    expect(slot!.path).toBe('Themes/neon/Files/Screens/flt.txt');
    expect(slot!.description).toBe('Pulled into LOGON');
  });

  it('is not a second slot for a screen the catalogue already names', () => {
    const slots = themeChecklist(withLogos, 'neon').filter(s => s.scope === 'files');

    expect(slots.map(s => s.screen)).toEqual(['flt.txt']);
  });

  it('counts towards the artist progress', () => {
    const progress = themeProgress(themeChecklist(withLogos, 'neon'));

    expect(progress.byScope.files.total).toBe(1);
    expect(progress.byScope.files.drawn).toBe(0);
  });
});

/**
 * The frame around a screen the board writes IS an artist's work.
 *
 * `AchieveTop.txt` is regenerated every fifteen minutes, so the checklist
 * excludes it - but the board splices `AchieveTop.Header` above the two
 * leaderboards and `.Tailer` below them, and a theme's own pair now wins over
 * the board's. Without slots for those, the sysop had no way to restyle his
 * achievements bulletin: "start by making the achievement bulletings editable
 * and add support in the ansi studio".
 */
describe('the art around a generated screen', () => {
  it('is offered, even though the screen itself is not', () => {
    const slots = themeChecklist(undefined, 'neon');
    const names = slots.map(s => s.screen);

    expect(names).not.toContain('ACHIEVETOP');
    expect(names).toContain('AchieveTop.Header');
    expect(names).toContain('AchieveTop.Tailer');
  });

  it('lands where the board reads a theme\'s own copy', () => {
    const header = themeChecklist(undefined, 'neon').find(s => s.screen === 'AchieveTop.Header');

    expect(header?.path).toBe('Themes/neon/Board/AchieveTop.Header');
    expect(header?.scope).toBe('board');
    expect(header?.description).toMatch(/above/i);
  });

  it('counts as drawn once the theme holds it', () => {
    const index = {
      builtAt: '', unused: [], screens: [], conferences: [],
      files: {
        'Themes/neon/Board/AchieveTop.Header': {
          relPath: 'Themes/neon/Board/AchieveTop.Header', bytes: 10, format: 'ansi',
          sha256: 'a', mci: [], theme: 'neon',
        },
      },
    } as unknown as ScreenIndexShape;

    const slots = themeChecklist(index, 'neon');
    expect(slots.find(s => s.screen === 'AchieveTop.Header')?.drawn).toBe(true);
    expect(slots.find(s => s.screen === 'AchieveTop.Tailer')?.drawn).toBe(false);
  });
});

/**
 * The BOARD's own frame, which exists nowhere else.
 *
 * `default` is the board, so it gets no list of screens still to redraw - but
 * `Screens/AchieveTop.Header` and `.Tailer` are not on this board at all, and
 * with no slot there is no way to make them. The sysop went looking and found
 * nothing: "i cant find the achievement frames in ansi studio tell me exactly
 * where to find them".
 */
describe('the board\'s own screens in the studio', () => {
  it('offer the art around what the board writes, and nothing else', () => {
    const slots = themeChecklist(undefined, 'default');

    expect(slots.map(s => s.screen).sort()).toEqual(['AchieveTop.Header', 'AchieveTop.Tailer']);
  });

  it('point at the board\'s own directory, not a theme\'s', () => {
    const header = themeChecklist(undefined, 'default').find(s => s.screen === 'AchieveTop.Header');

    expect(header?.path).toBe('Screens/AchieveTop.Header');
  });

  it('still give a theme its own copy of the same art', () => {
    const header = themeChecklist(undefined, 'neon').find(s => s.screen === 'AchieveTop.Header');

    expect(header?.path).toBe('Themes/neon/Board/AchieveTop.Header');
  });
});
