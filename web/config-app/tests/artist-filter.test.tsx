/**
 * By default the screens page shows art, and only art.
 *
 * Asked for directly: "can we add filters so the user can select to filter out
 * screens with only codes and generated screens and have this filter on by
 * default? so the ansi artists only see the screens they should touch".
 *
 * On the live board that is 400 files of art against 258 that are nothing but
 * MCI codes, 6 the board writes itself and 5 empty ones. The plumbing is one
 * checkbox away, never gone: a file the manager refuses to show is a file a
 * sysop cannot find.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { isArt, isDoorArt, isCommandsOnly, isNotArt, toScreenRows } from '../src/pages/screen-index-view';

const art = new TextEncoder().encode('\x1b[31mHI');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const file = (over: Record<string, unknown>) => ({
  relPath: 'x', bytes: 100, format: 'ansi', sha256: 'h', mci: [], problems: [],
  readBy: [], ...over,
});

describe('what counts as art', () => {
  it('keeps an ordinary piece', () => {
    expect(isArt(file({}) as never)).toBe(true);
  });

  it('drops a screen that is only codes', () => {
    expect(isArt(file({ codesOnly: true }) as never)).toBe(false);
  });

  it('drops a file the board writes itself', () => {
    expect(isArt(file({ generated: 'runtime' }) as never)).toBe(false);
  });

  it('drops a leftover copy', () => {
    expect(isArt(file({ generated: 'backup' }) as never)).toBe(false);
  });

  it('drops an empty file, which draws nothing', () => {
    expect(isArt(file({ bytes: 0 }) as never)).toBe(false);
  });

  it('keeps RIP and PETSCII, which are somebody\'s art too', () => {
    // Format is not part of this rule. The gallery narrows to what it can
    // DRAW; hiding a RIP screen from the tables as well would put it beyond
    // reach entirely.
    expect(isArt(file({ format: 'rip' }) as never)).toBe(true);
    expect(isArt(file({ format: 'petscii' }) as never)).toBe(true);
  });
});

describe('what belongs to a door, and what holds no art at all', () => {
  it("calls a door's file the door's", () => {
    expect(isDoorArt(file({ relPath: 'Doors/GWALL/wall.ans', door: 'GWALL' }) as never)).toBe(true);
    expect(isDoorArt(file({}) as never)).toBe(false);
  });

  it('separates a plumbing screen from a leftover', () => {
    // Both are kept out of the gallery, and they are not the same thing: one
    // is a screen the board runs, the other is a file nobody should keep.
    expect(isCommandsOnly(file({ codesOnly: true }) as never)).toBe(true);
    expect(isNotArt(file({ codesOnly: true }) as never)).toBe(false);

    expect(isNotArt(file({ generated: 'backup' }) as never)).toBe(true);
    expect(isCommandsOnly(file({ generated: 'backup' }) as never)).toBe(false);
  });

  it('counts an empty file as no art, whatever else it is', () => {
    expect(isNotArt(file({ bytes: 0 }) as never)).toBe(true);
    // Zero bytes runs no codes either, so it is not plumbing.
    expect(isCommandsOnly(file({ bytes: 0, codesOnly: true }) as never)).toBe(false);
  });
});

const index = {
  builtAt: '2026-09-02T00:00:00.000Z',
  // The index's own verdict: orphan.ans is on the volume and no screen,
  // node, conference or bulletin reads it. A bulletin is deliberately NOT
  // here - it is read by number, never by name, and the index excludes it.
  unused: [{ relPath: 'Screens/orphan.ans', bytes: 100, format: 'ansi', sha256: 'orphan', mci: [], problems: [], readBy: [] }],
  conferences: [],
  bulletins: [{ file: 'Screens/bull1.txt', number: 1, title: 'the first bulletin' }],
  callersByLevel: {},
  screens: [
    {
      screen: 'BBSTITLE', dirType: 'node', missingScopes: 0,
      resolutions: [{ scope: 'node', id: 1, file: 'Node1/BBSTITLE.txt' }],
    },
    {
      screen: 'AWAITSCREEN', dirType: 'node', missingScopes: 0,
      resolutions: [{ scope: 'node', id: 1, file: 'Node1/awaitscreen.txt' }],
    },
  ],
  files: {
    'Node1/BBSTITLE.txt': file({ relPath: 'Node1/BBSTITLE.txt' }),
    // 47 copies of this on the live board, and it is one code.
    'Node1/awaitscreen.txt': file({ relPath: 'Node1/awaitscreen.txt', bytes: 15, codesOnly: true }),
    // A door's own art: listed, but never among the board's screens.
    'Screens/orphan.ans': file({ relPath: 'Screens/orphan.ans', sha256: 'orphan' }),
    'Screens/bull1.txt': file({ relPath: 'Screens/bull1.txt', format: 'text', sha256: 'bulletin', readBy: [] }),
    // Its own sha256: the gallery groups by content, so a door file sharing
    // the board art's hash would collapse into that card and hide the bug.
    'Doors/GWALL/wall.ans': file({ relPath: 'Doors/GWALL/wall.ans', door: 'GWALL', sha256: 'door-hash' }),
  },
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) {
    return envelope({ content: base64(art), format: 'ansi', bytes: art.length, mci: [] });
  }
  return envelope(index);
}));

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));


/*
 * The gallery is Screen Designer's whole view since S9, so these cases drive
 * it there. The theme is mocked rather than fetched - the board's own screens
 * are one of the options in its selector - because what is under test is the
 * CARDS, not a theme registry round-trip in front of them.
 */
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'sysop' }, secLevel: 255 }),
}));
vi.mock('../src/pages/use-my-theme', () => ({
  useMyTheme: () => ({
    theme: {
      slug: 'default', title: "The board's own screens", dir: '', owner: '',
      status: 'live', mine: false, writable: true, widths: [80],
    },
    choices: [], select: vi.fn(), isPreparing: false, error: null,
    auditing: false, sysop: true,
  }),
}));

import { ArtistStudioPage as ScreenScopeTables } from '../src/pages/ArtistStudioPage';
// The resolution tables kept their tabs; they are a Screen Health section now.
import { ScreenScopeTables as ResolutionTables } from '../src/pages/ScreenScopeTables';
import { ScreenHealthPage } from '../src/pages/ScreenHealthPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('a screen row knows whether it is worth opening', () => {
  it('is art when a file behind it is art', () => {
    const rows = toScreenRows(index as never);

    expect(rows.find(r => r.screen === 'BBSTITLE')?.hasArt).toBe(true);
  });

  it('is not art when every file behind it is only codes', () => {
    const rows = toScreenRows(index as never);

    expect(rows.find(r => r.screen === 'AWAITSCREEN')?.hasArt).toBe(false);
  });

  it('stays visible when the screen resolves to nothing at all', () => {
    // A missing screen is the most important row on the page. The first
    // version of this filter had no file to judge and hid exactly those.
    const missing = {
      ...index,
      screens: [{
        screen: 'GONE', dirType: 'node', missingScopes: 1,
        resolutions: [{ scope: 'node', id: 1, file: null }],
      }],
    };

    expect(toScreenRows(missing as never)[0].hasArt).toBe(true);
  });
});

describe('the screens page as an artist opens it', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hides a codes-only screen from the tables by default', async () => {
    const user = userEvent.setup();
    render(<ResolutionTables />, { wrapper });

    await user.click(await screen.findByRole('tab', { name: /Node screens/ }));

    expect(await screen.findByText('BBSTITLE')).toBeTruthy();
    expect(screen.queryByText('AWAITSCREEN')).toBeNull();
  });

  it('shows it once the sysop asks for the plumbing', async () => {
    const user = userEvent.setup();
    render(<ResolutionTables />, { wrapper });

    await user.click(await screen.findByRole('tab', { name: /Node screens/ }));
    await user.click(screen.getByRole('checkbox', { name: /plumbing/i }));

    expect(await screen.findByText('AWAITSCREEN')).toBeTruthy();
  });

  it("keeps a door's art in its own tab", async () => {
    const user = userEvent.setup();
    render(<ResolutionTables />, { wrapper });

    await user.click(await screen.findByRole('tab', { name: /Door screens/ }));

    expect(await screen.findByText('Doors/GWALL/wall.ans')).toBeTruthy();
    expect(screen.getByText('GWALL')).toBeTruthy();
  });

  it("keeps a door's art out of the gallery", async () => {
    // The gallery is the artist's view of THE BOARD. A door directory is also
    // full of .txt files that are documentation, and drawing those as art was
    // the false positive this tab split fixes.
    render(<ScreenScopeTables />, { wrapper });

    // The COUNT is the assertion: a card is labelled by screen name, so
    // looking for the path finds nothing either way and would pass on the
    // unfiltered gallery too. Two DRAWN cards belong here - BBSTITLE and the
    // bulletin - against a codes-only screen, an orphan and a door file.
    const gallery = await screen.findByTestId('screen-gallery');
    const drawn = [...gallery.children]
      // The board's own view also offers the frames around the screens it
      // writes for itself - undrawn slots, marked with a +, which the sysop
      // went looking for: "i cant find the achievement frames in ansi studio".
      .map(card => card.textContent ?? '')
      .filter(text => !text.startsWith('+'));

    expect(drawn).toHaveLength(2);
  });

  it('leaves art nothing reads out of the gallery', async () => {
    // "i see a lot of read by nothing in the gallery the artists are not
    // interested in those". The fixture's gallery is BBSTITLE and the
    // bulletin; orphan.ans and the door file are not art anyone is serving.
    render(<ScreenScopeTables />, { wrapper });

    const gallery = await screen.findByTestId('screen-gallery');
    const drawn = [...gallery.children]
      // The board's own view also offers the frames around the screens it
      // writes for itself - undrawn slots, marked with a +, which the sysop
      // went looking for: "i cant find the achievement frames in ansi studio".
      .map(card => card.textContent ?? '')
      .filter(text => !text.startsWith('+'));

    expect(drawn).toHaveLength(2);
    expect(drawn.join(' ')).not.toMatch(/doordoc|door\.txt/i);
  });

  it('keeps a bulletin in the gallery, which no screen name reads', async () => {
    // A bulletin is read by NUMBER. Filtering on readBy alone would have
    // dropped every bulletin from the artist's view; the index's own unused
    // list already knows the difference, which is why the filter uses it.
    render(<ScreenScopeTables />, { wrapper });

    // Screen Designer opens ON the gallery; there is no tab to reach it by.
    expect(await screen.findByText(/the first bulletin/)).toBeTruthy();
  });

  it('leaves the orphans to Screen Health, which is where the audit is', async () => {
    /*
     * "Show art nothing reads" was a toggle on the sysop's own gallery. S9
     * left ONE gallery - Screen Designer's, which is about art - and a file
     * nothing reads is a finding, not a picture: it is listed under "Read by
     * nothing" on Screen Health, with the rest of the reports.
     */
    render(<ScreenScopeTables />, { wrapper });
    await screen.findByTestId('screen-gallery');

    expect(screen.queryByRole('checkbox', { name: /Show art nothing reads/i })).toBeNull();
  });

  it('gives a screen that is only codes a tab of its own, on Screen health', async () => {
    const user = userEvent.setup();
    render(<ScreenHealthPage />, { wrapper });

    await user.click(await screen.findByRole('tab', { name: /Commands and text/ }));

    expect(await screen.findByText('Node1/awaitscreen.txt')).toBeTruthy();
  });
});
