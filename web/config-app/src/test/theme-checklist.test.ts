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

    expect(slots.filter(s => s.screen === 'MENU').map(s => s.conference)).toEqual([1, 2, 3]);
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
