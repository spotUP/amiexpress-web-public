/**
 * A WAY FORWARD THE SLOT NAMES MUST BE ONE THE DIALOG DRAWS.
 *
 * `slotAffordances` is the one place that decides what an artist may do here,
 * and its own property test guarantees no state is a dead end. The banner then
 * draws a button only when the caller passed a handler for it - deliberately,
 * so a page cannot offer what it is unable to honour.
 *
 * Put together, those two correct rules hide a third thing: an action the
 * state machine offers and NO mount honours is a dead end again, and both
 * tests still pass. `copy-board` was exactly that. `yours-undrawn` offers it
 * whenever the board has a copy of the screen, and `ArtistScreenDialog` - the
 * only production mount there is - never passed `onCopyBoard`. So an artist
 * standing on an empty slot, with the board's own art sitting right there, was
 * told to upload one.
 *
 * This drives the real dialog, because the banner in isolation cannot catch
 * it: the banner is right either way.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../lib/query-client';

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const writes: Array<{ url: string; body: any }> = [];
vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if ((init?.method ?? 'GET') !== 'GET') {
    writes.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    return envelope({ written: [] });
  }
  // The artist's own slot is EMPTY - the file route answers 404, which is
  // what "nothing is drawn here yet" actually is.
  if (url.includes('/api/screens/file')) {
    return Promise.resolve({
      ok: false, status: 404, headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: false, error: 'not found' }),
      text: async () => JSON.stringify({ success: false, error: 'not found' }),
    } as unknown as Response);
  }
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope({});
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ArtistScreenDialog } from '../pages/ArtistScreenDialog';
import type { ScreenIndexShape } from '../pages/screen-index-view';

const theme = {
  slug: 'ansiguy', title: "ansiguy's screens", status: 'draft' as const,
  dir: 'Themes/ansiguy', owner: 'ansiguy', screens: 1, mine: true,
};

const slot = 'Themes/ansiguy/Node/BBSTITLE.TXT';
const boardCopy = 'Node1/BBSTITLE.TXT';

/** The artist's slot is empty; the BOARD has the same screen drawn. */
const index = {
  files: {
    [slot]: { relPath: slot, theme: 'ansiguy' },
    [boardCopy]: { relPath: boardCopy },
  },
} as unknown as ScreenIndexShape;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  writes.length = 0;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

const open = () =>
  render(
    <ArtistScreenDialog path={slot} theme={theme} index={index} onClose={vi.fn()} onOpenPath={vi.fn()} />,
    { wrapper },
  );

describe('an empty slot whose screen the board already has', () => {
  it("offers to start from the board's art", async () => {
    open();
    // RED before: the state machine offered `copy-board`, the banner filtered
    // it out for want of a handler, and the artist saw only Draw and Upload.
    expect(await screen.findByRole('button', { name: /Start from the board/ })).toBeInTheDocument();
  });

  it('copying it writes the artist a file of their own', async () => {
    open();
    await userEvent.click(await screen.findByRole('button', { name: /Start from the board/ }));

    expect(writes.length).toBeGreaterThan(0);
    // The theme is the DESTINATION, named in the URL; the board's copy is the
    // SOURCE, named in the body. The artist's own empty slot is neither.
    expect(writes[0].url).toContain('/api/themes/ansiguy/copy');
    expect(writes[0].body.path).toBe(boardCopy);
  });

  it('still offers the ways forward it always did', async () => {
    open();
    expect(await screen.findByRole('button', { name: /Draw one here/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload a drawing/ })).toBeInTheDocument();
  });
});

describe('an empty slot the board has nothing for', () => {
  it('does not offer a copy that does not exist', async () => {
    const bare = { files: { [slot]: { relPath: slot, theme: 'ansiguy' } } } as unknown as ScreenIndexShape;
    render(
      <ArtistScreenDialog path={slot} theme={theme} index={bare} onClose={vi.fn()} onOpenPath={vi.fn()} />,
      { wrapper },
    );
    expect(await screen.findByRole('button', { name: /Draw one here/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start from the board/ })).toBeNull();
  });
});
