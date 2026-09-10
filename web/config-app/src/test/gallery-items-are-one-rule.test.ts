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

  // "why do i see two guestlogon.txt": the theme drew it and the board's
  // original sat beside it under the same name. In the artist's own studio
  // a drawn screen shows once - theirs. The sysop's board view keeps both.
  it('shows a drawn screen once in its own studio, twice on the board', () => {
    const both = {
      ...index,
      files: {
        ...index.files,
        'Node1/GUESTLOGON.txt': file({
          relPath: 'Node1/GUESTLOGON.txt', sha256: 'board',
          readBy: [{ screen: 'GUESTLOGON', scope: 'node', id: 1, via: 'resolved' }],
        }),
        'Themes/neon/Node/guestlogon.txt': file({
          relPath: 'Themes/neon/Node/guestlogon.txt', sha256: 'theirs', theme: 'neon',
          readBy: [{ screen: 'GUESTLOGON', scope: 'node', id: 1, via: 'resolved' }],
        }),
      },
    } as unknown as ScreenIndexShape;
    const opts = { theme: 'neon', showGenerated: false, showUnread: false } as const;

    expect(paths(buildGalleryItems(both, opts)))
      .toEqual(expect.arrayContaining(['Node1/GUESTLOGON.txt', 'Themes/neon/Node/guestlogon.txt']));
    const artistPaths = paths(buildGalleryItems(both, { ...opts, ownedBy: 'neon' }));
    expect(artistPaths).toContain('Themes/neon/Node/guestlogon.txt');
    expect(artistPaths).not.toContain('Node1/GUESTLOGON.txt');
  });

  it('still shows the twins the theme has not drawn', () => {
    // Level bands and screen-type twins are genuinely different cards: the
    // theme drawing node GUESTLOGON must not hide the level-250 MENU or the
    // .GR twin, and the gallery never holds PETSCII/RIP/Teletext anyway.
    const twins = {
      ...index,
      files: {
        ...index.files,
        'Node1/GUESTLOGON.txt': file({
          relPath: 'Node1/GUESTLOGON.txt', sha256: 'board',
          readBy: [{ screen: 'GUESTLOGON', scope: 'node', id: 1, via: 'resolved' }],
        }),
        'Conf1/menu250.txt.GR': file({
          relPath: 'Conf1/menu250.txt.GR', sha256: 'gr', format: 'ansi',
          readBy: [{ screen: 'MENU', scope: 'conf', id: 1, serves: '250 and above', screenType: '.GR' }],
        }),
        'Themes/neon/Node/guestlogon.txt': file({
          relPath: 'Themes/neon/Node/guestlogon.txt', sha256: 'theirs', theme: 'neon',
          readBy: [{ screen: 'GUESTLOGON', scope: 'node', id: 1, via: 'resolved' }],
        }),
      },
    } as unknown as ScreenIndexShape;
    const artist = buildGalleryItems(twins,
      { theme: 'neon', showGenerated: false, showUnread: false, ownedBy: 'neon' });

    expect(paths(artist)).toContain('Themes/neon/Node/guestlogon.txt');
    expect(paths(artist)).not.toContain('Node1/GUESTLOGON.txt');
    expect(paths(artist)).toContain('Conf1/menu250.txt.GR');
  });
});
