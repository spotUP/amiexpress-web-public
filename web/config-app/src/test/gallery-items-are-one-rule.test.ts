/**
 * One gallery rule, two audiences.
 *
 * The sysop's Screen files page and an artist's studio draw the same board.
 * When each built its own list, a file was art on one page and plumbing on the
 * next - and the rule that decides which is the rule that decides what an
 * artist is allowed to spend an evening redrawing.
 */
import { describe, expect, it } from 'vitest';
import { buildGalleryItems, type ScreenIndexShape } from '../pages/screen-index-view';

const file = (over: Record<string, unknown>) => ({
  relPath: 'x', bytes: 100, format: 'ansi', sha256: 'h', mci: [], problems: [], readBy: [], ...over,
});
const reader = [{ screen: 'BULL', scope: 'board', id: null, via: 'resolved' }];

const index = {
  builtAt: '2026-09-08T00:00:00.000Z', unused: [], conferences: [], bulletins: [], callersByLevel: {},
  screens: [],
  files: {
    'Screens/BULL.TXT': file({ relPath: 'Screens/BULL.TXT', sha256: 'a', readBy: reader }),
    'Themes/neon/Board/MENU.TXT': file({ relPath: 'Themes/neon/Board/MENU.TXT', sha256: 'b', theme: 'neon', readBy: [{ screen: 'MENU', scope: 'board', id: null, via: 'resolved' }] }),
    'Screens/dead.txt': file({ relPath: 'Screens/dead.txt', sha256: 'c' }),
    'Screens/written.txt': file({ relPath: 'Screens/written.txt', sha256: 'd', generated: 'runtime', readBy: reader }),
  },
} as unknown as ScreenIndexShape;
const withUnread = { ...index, unused: [index.files['Screens/dead.txt']] } as ScreenIndexShape;

const paths = (items: { path: string }[]) => items.map(i => i.path).sort();

describe('what belongs in a gallery', () => {
  it('gives the sysop and the artist the same cards, bar whose art it is', () => {
    const sysop = buildGalleryItems(index, { theme: 'neon', showGenerated: false, showUnread: false });
    const artist = buildGalleryItems(index, { theme: 'neon', showGenerated: false, showUnread: false, ownedBy: 'neon' });

    expect(paths(artist)).toEqual(paths(sysop));
    expect(sysop.every(item => item.badge === undefined)).toBe(true);
  });

  it('says which cards are the artist\'s own and which are still the board\'s', () => {
    const items = buildGalleryItems(index, { theme: 'neon', showGenerated: false, showUnread: false, ownedBy: 'neon' });

    const mine = items.find(i => i.path === 'Themes/neon/Board/MENU.TXT');
    const theirs = items.find(i => i.path === 'Screens/BULL.TXT');
    expect(mine?.badge).toEqual({ label: 'Yours', kind: 'mine' });
    expect(theirs?.badge).toEqual({ label: "Board's - not redrawn yet", kind: 'theirs' });
  });

  it('leaves another theme\'s art out of the board\'s own view', () => {
    const board = buildGalleryItems(index, { theme: 'default', showGenerated: false, showUnread: false });

    expect(paths(board)).not.toContain('Themes/neon/Board/MENU.TXT');
    expect(paths(board)).toContain('Screens/BULL.TXT');
  });

  it('keeps plumbing and art nothing reads out until they are asked for', () => {
    const plain = buildGalleryItems(withUnread, { theme: 'default', showGenerated: false, showUnread: false });
    expect(paths(plain)).not.toContain('Screens/dead.txt');
    expect(paths(plain)).not.toContain('Screens/written.txt');

    expect(paths(buildGalleryItems(withUnread, { theme: 'default', showGenerated: false, showUnread: true })))
      .toContain('Screens/dead.txt');
    expect(paths(buildGalleryItems(withUnread, { theme: 'default', showGenerated: true, showUnread: false })))
      .toContain('Screens/written.txt');
  });
});
