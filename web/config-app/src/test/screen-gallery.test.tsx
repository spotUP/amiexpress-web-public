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
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) return envelope({ content: base64(art), format: 'ansi', bytes: art.length, mci: [] });
  return envelope(index);
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ScreenFilesPage } from '../pages/ScreenFilesPage';

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
    render(<ScreenFilesPage />, { wrapper });

    expect(await screen.findByTestId('screen-gallery')).toBeTruthy();
  });

  it('names a screen by what it IS, and a bulletin by its published title', async () => {
    render(<ScreenFilesPage />, { wrapper });

    expect(await screen.findByText('CONF_BULL')).toBeTruthy();
    expect(screen.getByText('Bulletin 20 - Card Lobby Weekly Leaders')).toBeTruthy();
  });

  it('says who reads each one, and how many callers that is', async () => {
    render(<ScreenFilesPage />, { wrapper });

    expect(await screen.findByText(/Amiga Demoscene \(conference 1\).*95 callers/)).toBeTruthy();
  });

  it('credits the artist from the SAUCE record', async () => {
    render(<ScreenFilesPage />, { wrapper });

    expect(await screen.findByText('Join Bulletin by Spot')).toBeTruthy();
  });

  it('flags a screen whose colour codes are broken', async () => {
    render(<ScreenFilesPage />, { wrapper });

    expect(await screen.findByText(/lost their escape byte/i)).toBeTruthy();
  });

  it('shows one card per piece of art, not per copy', async () => {
    render(<ScreenFilesPage />, { wrapper });

    // Conf2/bull20.txt and the two node copies are the same bytes: one card,
    // saying how many copies there are.
    expect(await screen.findByText(/and 2 identical copies/)).toBeTruthy();
  });

  it('leaves out leftovers and files the board writes, until asked', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });
    await screen.findByTestId('screen-gallery');

    expect(screen.queryByText(/Screens\/Callers\.txt/)).toBeNull();
    expect(screen.queryByText(/Menu copy\.txt/)).toBeNull();

    await user.click(screen.getByLabelText(/show leftovers/i));

    expect(await screen.findByText(/written by the board/)).toBeTruthy();
    expect(screen.getByText(/a leftover copy/)).toBeTruthy();
  });

  it('opens the file when a card is clicked', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByText('CONF_BULL'));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });
});
