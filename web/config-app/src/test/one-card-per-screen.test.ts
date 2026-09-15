/**
 * An artist sees a SCREEN, not its versions.
 *
 * Measured on the live board 2026-09-15 with the board's own buildScreenIndex:
 * 214 art files in 59 content-grouped cards for 44 distinct screen names. So
 * 15 cards were a screen the artist had already scrolled past - `bull20.txt`
 * alone was six - and editing that board one file at a time is what produced
 * the versions in the first place.
 *
 * The grouping key is the SCREEN THE INDEX SAYS A FILE SERVES, never the
 * filename. `Logon100.txt` is the logon screen at level 100 and folds in (the
 * sysop, 2026-09-15: "if the security level differs doesn't matter to the
 * artists ... the artist should only edit one screen"), while `bull20.txt` is
 * bulletin twenty and must NOT fold into `bull.txt` - and a basename regex
 * gets that one wrong, because 20 is a multiple of five and the board's own
 * `variantOf` would read it as a level.
 */
import { expect, it } from 'vitest';

import { buildGalleryItems } from '../pages/screen-index-view';

const file = (relPath: string, sha256: string, screen: string, scopes: number, extra = {}) => ({
  relPath,
  sha256,
  bytes: 800,
  format: 'ansi' as const,
  readBy: Array.from({ length: scopes }, (_, i) => ({
    screen, scope: 'node' as const, id: i, via: 'resolved' as const, ...extra,
  })),
});

const build = (files: Record<string, unknown>) =>
  buildGalleryItems({ files } as never, { showGenerated: false, showUnread: true, theme: undefined } as never);

it('groups a name that drifted into ONE card', () => {
  const items = build({
    'Node0/logoff.txt': file('Node0/logoff.txt', 'aaa', 'LOGOFF', 38),
    'Node7/logoff.txt': file('Node7/logoff.txt', 'bbb', 'LOGOFF', 1),
    'Conf4/logoff.txt': file('Conf4/logoff.txt', 'ccc', 'LOGOFF', 2),
  });

  expect(items).toHaveLength(1);
  expect(items[0].versions).toBe(3);
});

it('puts the version most scopes read in front', () => {
  const [card] = build({
    'Node7/logoff.txt': file('Node7/logoff.txt', 'bbb', 'LOGOFF', 1),
    'Node0/logoff.txt': file('Node0/logoff.txt', 'aaa', 'LOGOFF', 38),
  });

  expect(card.path).toBe('Node0/logoff.txt');
  expect(card.otherVersions).toHaveLength(1);
});

it('folds a security-level variant into the same card', () => {
  // The artist draws "the logon screen" once; which level a caller has is the
  // board's business.
  const items = build({
    'Node0/Logon.txt': file('Node0/Logon.txt', 'aaa', 'LOGON', 40),
    'Node0/Logon100.txt': file('Node0/Logon100.txt', 'bbb', 'LOGON', 1, { securityLevel: 100 }),
  });

  expect(items).toHaveLength(1);
});

it('does NOT fold bulletin twenty into the bulletin menu', () => {
  // `bull20` parses as `bull` at level 20 - 20 is a multiple of five - and it
  // is nothing of the kind. The index knows; a basename regex does not.
  const items = build({
    'Screens/bull.txt': file('Screens/bull.txt', 'aaa', 'BULL', 4),
    'Conf3/bull20.txt': file('Conf3/bull20.txt', 'bbb', 'BULL20', 1),
  });

  expect(items).toHaveLength(2);
});

it('leaves two DIFFERENT screens as two cards', () => {
  const items = build({
    'Screens/logoff.txt': file('Screens/logoff.txt', 'aaa', 'LOGOFF', 4),
    'Screens/join.txt': file('Screens/join.txt', 'bbb', 'JOIN', 4),
  });

  expect(items).toHaveLength(2);
});

it('says one version for a screen that has not drifted', () => {
  const [card] = build({
    'Node0/join.txt': file('Node0/join.txt', 'aaa', 'JOIN', 40),
    'Node1/join.txt': file('Node1/join.txt', 'aaa', 'JOIN', 1),
  });

  expect(card.versions).toBe(1);
  expect(card.otherVersions).toHaveLength(0);
});
