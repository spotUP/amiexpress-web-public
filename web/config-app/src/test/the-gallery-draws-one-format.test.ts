/**
 * Choosing which FORMAT the thumbnails draw.
 *
 * A screen can exist several times over - `MENU.TXT` for an ANSI caller,
 * `MENU.SEQ` for a C64, `MENU.RIP` for a RIP terminal - and the gallery drew
 * whichever file the card happened to resolve to, which is almost always the
 * ANSI one. So an artist reviewing the board as a C64 caller sees it had no
 * way to look at it: "we need to be able to select the screen type to list in
 * the thumbnails" (sysop, 2026-09-15).
 *
 * The card still STANDS for the screen. Only which sibling file it draws, and
 * therefore fetches, changes.
 */
import { expect, it } from 'vitest';

import { buildGalleryItems } from '../pages/screen-index-view';

const file = (relPath: string, sha256: string, format: string, screen = 'MENU') => ({
  relPath, sha256, bytes: 800, format,
  readBy: [{ screen, scope: 'board' as const, id: null, via: 'resolved' as const }],
});

const index = {
  files: {
    'Screens/MENU.TXT': file('Screens/MENU.TXT', 'a', 'ansi'),
    'Screens/MENU.SEQ': file('Screens/MENU.SEQ', 'b', 'petscii'),
    'Screens/MENU.RIP': file('Screens/MENU.RIP', 'c', 'rip'),
    // Its OWN screen: with `MENU` it folded into the MENU card, which is the
    // grouping doing exactly what it should and the fixture lying.
    'Screens/JOIN.TXT': file('Screens/JOIN.TXT', 'd', 'ansi', 'JOIN'),
  },
};

const build = (thumbnailFormat?: string) =>
  buildGalleryItems(index as never, {
    theme: 'default', showGenerated: false, showUnread: false,
    ...(thumbnailFormat ? { thumbnailFormat } : {}),
  } as never);

it('draws the ANSI file when nothing is chosen', () => {
  const menu = build().find(i => i.path.toUpperCase().includes('MENU'))!;

  expect(menu.path).toBe('Screens/MENU.TXT');
  expect(menu.format).toBe('ansi');
});

it('draws the PETSCII sibling when PETSCII is chosen', () => {
  const menu = build('petscii').find(i => i.label === 'MENU' || i.path.toUpperCase().includes('MENU'))!;

  expect(menu.path).toBe('Screens/MENU.SEQ');
  expect(menu.format).toBe('petscii');
});

it('draws the RIP sibling when RIP is chosen', () => {
  const menu = build('rip').find(i => i.path.toUpperCase().includes('MENU'))!;

  expect(menu.path).toBe('Screens/MENU.RIP');
  expect(menu.format).toBe('rip');
});

it('leaves a screen that has no such sibling on the file it had', () => {
  // JOIN is ANSI only. It stays drawable rather than vanishing or going
  // blank - the format chips already say which formats it lacks, and a
  // missing .seq is work to do, not a reason to hide the screen.
  const join = build('petscii').find(i => i.path.toUpperCase().includes('JOIN'))!;

  expect(join.path).toBe('Screens/JOIN.TXT');
  expect(join.format).toBe('ansi');
});

it('still shows one card per screen whatever is chosen', () => {
  // The siblings are the same SCREEN. Choosing a format must not split MENU
  // into three cards, which is the thing the grouping work just removed.
  expect(build('petscii')).toHaveLength(build().length);
});
