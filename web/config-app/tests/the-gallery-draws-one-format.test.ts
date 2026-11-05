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
import { expect, it, vi } from 'vitest';

import { buildGalleryItems } from '../src/pages/screen-index-view';

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

it('says the screen has no drawing in the chosen format', () => {
  // The fallback is silent otherwise: a card drawn in ANSI while PETSCII is
  // selected looks exactly like a screen that HAS PETSCII. "they need to say
  // missing" (sysop, 2026-09-15).
  const join = build('petscii').find(i => i.path.toUpperCase().includes('JOIN'))!;

  expect(join.missingFormat).toBe('PETSCII');
});

it('says nothing when the screen does have that format', () => {
  const menu = build('petscii').find(i => i.path.toUpperCase().includes('MENU'))!;

  expect(menu.missingFormat).toBeUndefined();
});

it('says nothing when no format is chosen', () => {
  const join = build().find(i => i.path.toUpperCase().includes('JOIN'))!;

  expect(join.missingFormat).toBeUndefined();
});

it('still shows one card per screen whatever is chosen', () => {
  // The siblings are the same SCREEN. Choosing a format must not split MENU
  // into three cards, which is the thing the grouping work just removed.
  expect(build('petscii')).toHaveLength(build().length);
});

/**
 * And the card SAYS it, not just the data.
 *
 * `missingFormat` reaching the item is half the job; the sysop's complaint was
 * about what the gallery shows.
 */
it('draws the warning on the card', async () => {
  const { render, screen } = await import('@testing-library/react');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { MemoryRouter } = await import('react-router-dom');
  const { ScreenGallery } = await import('../src/components/ScreenGallery');
  const React = await import('react');

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    React.createElement(MemoryRouter, null,
      React.createElement(QueryClientProvider, { client },
        React.createElement(ScreenGallery, {
          items: [{ path: 'Screens/JOIN.TXT', label: 'JOIN', format: 'ansi', missingFormat: 'PETSCII' }],
          onOpen: () => {},
        }))),
  );

  expect(await screen.findByText(/No PETSCII/)).toBeInTheDocument();
  expect(await screen.findByText(/Not drawn in PETSCII/)).toBeInTheDocument();
});

/**
 * And it does NOT draw the fallback art.
 *
 * "i still see the fallbacks" - the caption alone was not enough, because a
 * thumbnail of the ANSI drawing reads as "this screen has PETSCII" however the
 * words underneath are phrased.
 */
it('draws a gap rather than the art it fell back to', async () => {
  const { render } = await import('@testing-library/react');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { MemoryRouter } = await import('react-router-dom');
  const { ScreenGallery } = await import('../src/components/ScreenGallery');
  const React = await import('react');

  const getScreenFile = vi.fn(async () => ({ data: { content: '' } }));
  vi.doMock('../src/api/client', () => ({ apiClient: { getScreenFile } }));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    React.createElement(MemoryRouter, null,
      React.createElement(QueryClientProvider, { client },
        React.createElement(ScreenGallery, {
          items: [{ path: 'Screens/JOIN.TXT', label: 'JOIN', format: 'ansi', missingFormat: 'PETSCII' }],
          onOpen: () => {},
        }))),
  );

  // No request for the fallback file: there is nothing to show, and fetching
  // it would cost a round trip to draw art that answers a different question.
  expect(getScreenFile).not.toHaveBeenCalled();
});
