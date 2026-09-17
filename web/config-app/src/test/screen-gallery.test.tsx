/**
 * The gallery is how a designer finds art.
 *
 * "How can we make it easy for artists to find everything? render mugshots of
 * all screen files?" A path is not recognisable; the art is. Each card names
 * what the screen IS, who reads it, and who signed it.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const art = new TextEncoder().encode('\x1b[31mHI');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const index = {
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [],
  screens: [],
  conferences: [{ id: 1, name: 'Amiga Demoscene', dir: 'Conf2', fileAreas: 1, messageBases: 1 }],
  bulletins: [{ number: 20, file: 'Bulletins/bull20.txt', title: 'Card Lobby Weekly Leaders' }],
  callersByLevel: { 30: 95 },
  files: {
    'Conf2/bull20.txt': {
      relPath: 'Conf2/bull20.txt', bytes: 20, format: 'ansi', sha256: 'a', mci: [], problems: [],
      readBy: [{
        screen: 'CONF_BULL', scope: 'conf', id: 1, scopeName: 'Amiga Demoscene',
        securityLevel: 30, serves: '30 and above', via: 'resolved',
      }],
      sauce: { title: 'Join Bulletin', author: 'Spot', group: 'Up Rough', date: '20260902' },
    },
    'Bulletins/bull20.txt': {
      relPath: 'Bulletins/bull20.txt', bytes: 12, format: 'ansi', sha256: 'b', mci: [], problems: [],
      readBy: [],
    },
    'Screens/BROKEN.TXT': {
      relPath: 'Screens/BROKEN.TXT', bytes: 30, format: 'text', sha256: 'c', mci: [],
      problems: ['colour-codes-without-escape'], readBy: [],
    },
    // Two more nodes carrying the very same bytes as Conf2/bull20.txt.
    'Node1/BBSTITLE.txt': {
      relPath: 'Node1/BBSTITLE.txt', bytes: 20, format: 'ansi', sha256: 'a', mci: [], problems: [],
      readBy: [{ screen: 'BBSTITLE', scope: 'node', id: 1, via: 'variant' }],
    },
    'Node2/BBSTITLE.txt': {
      relPath: 'Node2/BBSTITLE.txt', bytes: 20, format: 'ansi', sha256: 'a', mci: [], problems: [],
      readBy: [{ screen: 'BBSTITLE', scope: 'node', id: 2, via: 'variant' }],
    },
    'Screens/Callers.txt': {
      relPath: 'Screens/Callers.txt', bytes: 40, format: 'text', sha256: 'd', mci: [],
      problems: [], readBy: [], generated: 'runtime',
    },
    'Conf2/Menu copy.txt': {
      relPath: 'Conf2/Menu copy.txt', bytes: 50, format: 'ansi', sha256: 'e', mci: [],
      problems: [], readBy: [], generated: 'backup',
    },
  },
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  // Screen Designer opens on a THEME, and the board's own screens are one of
  // them - the option the sysop asked for in the selector.
  if (url.includes('/api/themes') || url.includes('/config/users')) {
    return envelope(url.includes('/config/users') ? { users: [] } : {
      defaultSlug: 'default', canCreate: true,
      themes: [{
        slug: 'default', title: "The board's own screens", dir: '', author: '', owner: '',
        status: 'live', widths: [80], mine: false, writable: true, exists: true, wearable: true,
      }],
    });
  }
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) return envelope({ content: base64(art), format: 'ansi', bytes: art.length, mci: [] });
  return envelope(index);
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

/*
 * THE GALLERY IS SCREEN DESIGNER'S VIEW. It was a tab on the sysop's page;
 * S9 made that page one thing, so the cards are driven where they live.
 */
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'sysop' }, secLevel: 255 }),
}));
/*
 * The board's own screens, which is one of the options in Screen Designer's
 * selector. Mocked rather than fetched: what these cases are about is the
 * CARDS, and a theme registry round-trip in front of them only adds ways for
 * the fixture to be wrong.
 */
vi.mock('../pages/use-my-theme', () => ({
  useMyTheme: () => ({
    theme: {
      slug: 'default', title: "The board's own screens", dir: '', owner: '',
      status: 'live', mine: false, writable: true, widths: [80],
    },
    choices: [], select: vi.fn(), isPreparing: false, error: null,
    auditing: false, sysop: true,
  }),
}));

import { ArtistStudioPage as ScreenScopeTables } from '../pages/ArtistStudioPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('the gallery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens first, because a picture is how art is found', async () => {
    render(<ScreenScopeTables />, { wrapper });

    expect(await screen.findByTestId('screen-gallery')).toBeTruthy();
  });

  it('names a screen by what it IS, and a bulletin by its published title', async () => {
    render(<ScreenScopeTables />, { wrapper });

    expect(await screen.findByText('CONF_BULL - Amiga Demoscene - level 30 and above')).toBeTruthy();
    expect(screen.getByText('Bulletin 20 - Card Lobby Weekly Leaders')).toBeTruthy();
  });

  it('says who reads each one, and how many callers that is', async () => {
    render(<ScreenScopeTables />, { wrapper });

    expect(await screen.findByText(/Amiga Demoscene \(conference 1\).*95 callers/)).toBeTruthy();
  });

  it('credits the artist from the SAUCE record', async () => {
    render(<ScreenScopeTables />, { wrapper });

    expect(await screen.findByText('Join Bulletin by Spot')).toBeTruthy();
  });

  it('flags a screen whose colour codes are broken', async () => {
    render(<ScreenScopeTables />, { wrapper });

    expect(await screen.findByText(/lost their escape byte/i)).toBeTruthy();
  });

  it('shows one card per piece of art, not per copy', async () => {
    render(<ScreenScopeTables />, { wrapper });

    // Conf2/bull20.txt and the two node copies are the same bytes: one card,
    // saying how many copies there are.
    expect(await screen.findByText(/and 2 identical copies/)).toBeTruthy();
  });

  it('leaves out leftovers and files the board writes', async () => {
    render(<ScreenScopeTables />, { wrapper });
    await screen.findByTestId('screen-gallery');

    expect(screen.queryByText(/Screens\/Callers\.txt/)).toBeNull();
    expect(screen.queryByText(/Menu copy\.txt/)).toBeNull();

    /*
     * AND THERE IS NO LONGER A WAY TO ASK FOR THEM HERE.
     *
     * "Show leftovers" was a toggle on the sysop's own gallery, and S9 left
     * one gallery: Screen Designer's, which is about art. A leftover copy and
     * a file the board rewrites for itself are listed on Screen Health, under
     * "Not art" and "Read by nothing", where the rest of the audit is.
     */
    expect(screen.queryByLabelText(/show leftovers/i)).toBeNull();
  });

  it('opens the file when a card is clicked', async () => {
    const user = userEvent.setup();
    render(<ScreenScopeTables />, { wrapper });

    await user.click(await screen.findByText('CONF_BULL - Amiga Demoscene - level 30 and above'));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });
});

/**
 * Waiting looks like waiting.
 *
 * "Can we add skeleton + lazy loading to the screen pages? they are slow
 * loading." The index is one request for the whole board, and each thumbnail
 * is another - so there is a real wait before there is anything to draw.
 */
describe('while the board is still answering', () => {
  it('draws placeholder cards instead of an empty page', async () => {
    let release: (value: unknown) => void = () => {};
    const held = new Promise(resolve => { release = resolve; });

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/screens/shared-directories')) {
        return envelope({ directories: [] }) as unknown as Response;
      }
      await held;
      return envelope(index) as unknown as Response;
    }));

    render(<ScreenScopeTables />, { wrapper });

    expect(await screen.findByTestId('gallery-skeleton')).toBeTruthy();

    release(null);
    expect(await screen.findByTestId('screen-gallery')).toBeTruthy();
  });
});
