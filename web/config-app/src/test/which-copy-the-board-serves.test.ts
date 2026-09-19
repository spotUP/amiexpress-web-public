/**
 * Which copy of a screen the board actually serves.
 *
 * "why do i see Themes/607080/Conf/3/bull20.txt and Conf3/bull20.txt in
 * 607080's theme? they look identical" - the sysop, 2026-09-15, on the live
 * board. They were not identical: the themed copy carried one extra line, an
 * `~XISUBSCAN` MCI code, and looked the same because an MCI code executes
 * rather than draws. He had no way to tell which one a caller gets.
 *
 * A theme COVERS the board's screen, it does not delete it - so both are real
 * files with real readers, and the admin has to say which serves whom.
 */
import { expect, it } from 'vitest';

import { screenPrecedence } from '../pages/screen-index-view';

const boardCopy = {
  relPath: 'Conf3/bull20.txt',
  readBy: [{ screen: 'CONF_BULL', scope: 'conf', id: 3, via: 'shadowed', shadowedBy: '607080' }],
};
const themeCopy = {
  relPath: 'Themes/607080/Conf/3/bull20.txt',
  theme: '607080',
  readBy: [{ screen: 'CONF_BULL', scope: 'conf', id: 3, via: 'resolved' }],
};
const index = { files: { 'Conf3/bull20.txt': boardCopy, 'Themes/607080/Conf/3/bull20.txt': themeCopy } };

it('says a themed copy wins, and names what it covers', () => {
  const verdict = screenPrecedence(themeCopy as never, index as never);

  expect(verdict.serves).toBe('607080');
  expect(verdict.covers).toEqual(['Conf3/bull20.txt']);
});

it('says a board copy is covered, and by which theme', () => {
  const verdict = screenPrecedence(boardCopy as never, index as never);

  expect(verdict.coveredBy).toEqual([{ theme: '607080', path: 'Themes/607080/Conf/3/bull20.txt' }]);
});

it('says nothing about a screen no theme has drawn', () => {
  const lonely = {
    relPath: 'Screens/JOIN.TXT',
    readBy: [{ screen: 'JOIN', scope: 'board', id: null, via: 'resolved' }],
  };

  const verdict = screenPrecedence(lonely as never, { files: { 'Screens/JOIN.TXT': lonely } } as never);

  expect(verdict.covers).toEqual([]);
  expect(verdict.coveredBy).toEqual([]);
});

it('matches on the screen AND the scope, not the name alone', () => {
  // Conference 3's bulletin is not conference 5's. A theme drawing one covers
  // that one only, and saying otherwise would tell a sysop his conference 5
  // art was dead when it is what every caller there sees.
  const otherConf = {
    relPath: 'Conf5/bull20.txt',
    readBy: [{ screen: 'CONF_BULL', scope: 'conf', id: 5, via: 'resolved' }],
  };
  const withOther = { files: { ...index.files, 'Conf5/bull20.txt': otherConf } };

  expect(screenPrecedence(otherConf as never, withOther as never).coveredBy).toEqual([]);
  expect(screenPrecedence(themeCopy as never, withOther as never).covers).toEqual(['Conf3/bull20.txt']);
});

/**
 * A DRAFT theme is served to nobody, and that is what decides the pair.
 *
 * Measured on the live board 2026-09-15: `607080` is a draft, so
 * `Themes/607080/Conf/3/bull20.txt` has NO readers while the board's
 * `Conf3/bull20.txt` resolves. The gallery drew both and neither said which a
 * caller gets - and no comparison of the two FILES could have said, because
 * the answer is in the theme's status.
 */
import { buildGalleryItems } from '../pages/screen-index-view';

const draftPair = {
  files: {
    'Conf3/bull20.txt': {
      relPath: 'Conf3/bull20.txt', sha256: 'a', bytes: 900, format: 'ansi',
      readBy: [{ screen: 'CONF_BULL', scope: 'conf', id: 3, via: 'resolved' }],
    },
    'Themes/607080/Conf/3/bull20.txt': {
      relPath: 'Themes/607080/Conf/3/bull20.txt', sha256: 'b', bytes: 912, format: 'ansi',
      theme: '607080', readBy: [],
    },
  },
};

const studio = (themeIsDraft: boolean) => buildGalleryItems(draftPair as never, {
  theme: '607080', showGenerated: false, showUnread: false,
  ownedBy: '607080', themeIsDraft,
} as never);

it("says the board's copy is still what callers see, while the theme is a draft", () => {
  const board = studio(true).find(i => i.path === 'Conf3/bull20.txt')!;

  expect(board.badge).toEqual({ label: "Board's - still what callers see", kind: 'theirs' });
});

it('says the theme own copy is not served yet', () => {
  const mine = studio(true).find(i => i.path === 'Themes/607080/Conf/3/bull20.txt')!;

  expect(mine.badge?.label).toMatch(/draft, not served yet/);
});

/**
 * A LIVE theme is what callers are served, so its copy carries the readers -
 * which is the shape the live board's own index has for h7.
 */
const livePair = {
  files: {
    'Conf3/bull20.txt': {
      relPath: 'Conf3/bull20.txt', sha256: 'a', bytes: 900, format: 'ansi',
      readBy: [{ screen: 'CONF_BULL', scope: 'conf', id: 3, via: 'shadowed' }],
    },
    'Themes/607080/Conf/3/bull20.txt': {
      relPath: 'Themes/607080/Conf/3/bull20.txt', sha256: 'b', bytes: 912, format: 'ansi',
      theme: '607080',
      readBy: [{ screen: 'CONF_BULL', scope: 'conf', id: 3, via: 'resolved' }],
    },
  },
};

it("drops the board's copy once the theme is live and has redrawn it", () => {
  /*
   * "still why is there two conf bulls for amiga demos listed? doesnt make
   * sense?" (sysop, 2026-09-19). While the theme is a draft the board's copy
   * is still what callers see and the card above says so. Once it is live the
   * board's copy is superseded: there is nothing left to do about it, and it
   * was sitting beside the artist's own redraw badged "not redrawn yet".
   */
  const items = buildGalleryItems(livePair as never, {
    theme: '607080', showGenerated: false, showUnread: false,
    ownedBy: '607080', themeIsDraft: false,
  } as never);

  expect(items.find(i => i.path === 'Conf3/bull20.txt')).toBeUndefined();
  expect(items.find(i => i.path === 'Themes/607080/Conf/3/bull20.txt')?.badge?.label)
    .toBe('Yours');
});
