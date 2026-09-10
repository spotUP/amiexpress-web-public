/**
 * The studio must draw the screen, not apologise for it.
 *
 * "the artist studio is broken all of them say These bytes cannot be read as
 * ANSI art." That string is the catch I added around screenToCanvas, so every
 * screen is failing to decode - and the sysop's page decodes the same bytes
 * through the same function.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../lib/query-client';

// Real ANSI: ESC[31m then HI, exactly what the board serves.
const art = new TextEncoder().encode('\x1b[31mHI\r\n');
const base64 = btoa(String.fromCharCode(...art));

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/api/screens/file')) {
    return envelope({ relPath: 'Themes/skope/Board/BULL.TXT', content: base64, format: 'ansi', bytes: art.length, mci: [] });
  }
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope({});
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ArtistScreenDialog } from '../pages/ArtistScreenDialog';
import { ScreenGallery } from '../components/ScreenGallery';
import type { ScreenIndexShape } from '../pages/screen-index-view';

const theme = { slug: 'skope', title: "skope's screens", status: 'draft' as const, dir: 'Themes/skope', owner: 'skope', screens: 1, mine: true };
const index = { files: { 'Themes/skope/Board/BULL.TXT': { relPath: 'Themes/skope/Board/BULL.TXT', theme: 'skope' } } } as unknown as ScreenIndexShape;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('opening a screen in the studio', () => {
  beforeEach(() => vi.clearAllMocks());

  it('draws it even though the gallery card fetched it first', async () => {
    // The card ALWAYS gets there first in the studio - it is the only way in.
    // Both readers cache ['screen-file', path, theme], so if they disagree
    // about the shape the dialog decodes `undefined` and every screen reports
    // itself unreadable. This is that collision, in one QueryClient.
    const client = new QueryClient({ defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } } });
    const both = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const item = { path: 'Themes/skope/Board/BULL.TXT', label: 'BULL', detail: '' };

    // The gallery is given the SAME theme the dialog carries, because that is
    // what the studio does - and the theme is part of the key, since the same
    // path read through two themes has different readers.
    const view = render(
      <ScreenGallery items={[item]} onOpen={vi.fn()} theme={theme.slug} />,
      { wrapper: both },
    );
    await waitFor(() => expect(client.getQueryData(['screen-file', item.path, theme.slug])).toBeTruthy());
    view.unmount();

    render(<ArtistScreenDialog path={item.path} theme={theme} index={index} onClose={vi.fn()} onOpenPath={vi.fn()} />, { wrapper: both });

    await waitFor(() => expect(screen.queryByTestId('canvas-viewport')).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByText(/cannot be read as ANSI art/)).toBeNull();
  });

  it('one screen it cannot read does not break the next one', async () => {
    // The first file is not base64 at all, so the decoder throws. The second
    // is ordinary art, and must draw.
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/screens/file')) {
        return envelope(url.includes('BROKEN')
          ? { relPath: 'Screens/BROKEN.TXT', content: 'not base64 !!!', format: 'ansi', bytes: 3, mci: [] }
          : { relPath: 'Screens/BULL.TXT', content: base64, format: 'ansi', bytes: art.length, mci: [] });
      }
      if (url.includes('/api/mci')) return envelope({ codes: [] });
      return envelope({});
    });
    const boardIndex = { files: {} } as unknown as ScreenIndexShape;

    const view = render(<ArtistScreenDialog path="Screens/BROKEN.TXT" theme={theme} index={boardIndex} onClose={vi.fn()} onOpenPath={vi.fn()} />, { wrapper });
    await waitFor(() => expect(screen.queryByText(/cannot be read as ANSI art/)).toBeTruthy());

    view.rerender(<ArtistScreenDialog path="Screens/BULL.TXT" theme={theme} index={boardIndex} onClose={vi.fn()} onOpenPath={vi.fn()} />);

    await waitFor(() => expect(screen.queryByTestId('canvas-viewport')).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByText(/cannot be read as ANSI art/)).toBeNull();
  });

  it('draws a BOARD screen read-only instead of refusing it', async () => {
    const boardIndex = { files: { 'Screens/BULL.TXT': { relPath: 'Screens/BULL.TXT' } } } as unknown as ScreenIndexShape;
    render(<ArtistScreenDialog path="Screens/BULL.TXT" theme={theme} index={boardIndex} onClose={vi.fn()} onOpenPath={vi.fn()} />, { wrapper });

    await waitFor(() => expect(screen.queryByTestId('canvas-viewport')).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByText(/cannot be read as ANSI art/)).toBeNull();
  });

  it('draws the artist\'s own screen instead of refusing it', async () => {
    render(<ArtistScreenDialog path="Themes/skope/Board/BULL.TXT" theme={theme} index={index} onClose={vi.fn()} onOpenPath={vi.fn()} />, { wrapper });

    await waitFor(() => expect(screen.queryByTestId('canvas-viewport')).toBeTruthy(), { timeout: 3000 });
    expect(screen.queryByText(/cannot be read as ANSI art/)).toBeNull();
  });

  // "i cant upload screens to this one, it's empty": a blank slot opened
  // only the canvas - no way to bring a PETSCII, RIP or Teletext drawing.
  // The blank canvas IS the ANSI upload; the other three arrive by file.
  it('an empty slot offers every format except the one the canvas draws', async () => {
    const boardIndex = { files: {} } as unknown as ScreenIndexShape;
    render(
      <ArtistScreenDialog
        path="Themes/skope/Node/LOCKOUT0.TXT"
        theme={theme}
        index={boardIndex}
        isNew
        newDescription="Shown to a caller whose account is locked out."
        onClose={vi.fn()}
        onOpenPath={vi.fn()}
      />,
      { wrapper },
    );

    await waitFor(() => expect(screen.getByRole('button', { name: '+ PETSCII' })).toBeTruthy());
    expect(screen.getByRole('button', { name: '+ RIP' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Teletext (native packets - author externally)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ ANSI / text' })).toBeNull();
    expect(screen.getByText(/Nothing has been drawn here yet/)).toBeTruthy();
  });

  // "i still cant upload ansi here on a new screen": the empty slot drew
  // ANSI on canvas but offered no way to BRING an ANSI drawing. The upload
  // writes the slot's own path, like the + format buttons do.
  it('an empty slot takes an uploaded ANSI drawing', async () => {
    const boardIndex = { files: {} } as unknown as ScreenIndexShape;
    const writes: Array<{ url: string; body: any }> = [];
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? 'GET') !== 'GET') {
        writes.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
      }
      if (url.includes('/api/screens/file')) {
        return envelope({ relPath: 'Themes/skope/Node/LOCKOUT0.TXT', content: null, format: 'ansi', bytes: 0, mci: [] });
      }
      if (url.includes('/api/mci')) return envelope({ codes: [] });
      return envelope({});
    });
    render(
      <ArtistScreenDialog
        path="Themes/skope/Node/LOCKOUT0.TXT"
        theme={theme}
        index={boardIndex}
        isNew
        newDescription="Shown to a caller whose account is locked out."
        onClose={vi.fn()}
        onOpenPath={vi.fn()}
      />,
      { wrapper },
    );

    await waitFor(() => expect(screen.getByRole('button', { name: '+ ANSI drawing' })).toBeTruthy());
    const picker = document.querySelector('input[aria-label="Upload ANSI drawing"]') as HTMLInputElement;
    expect(picker).toBeTruthy();
    const bytes = new Uint8Array([0x1b, 0x5b, 0x33, 0x31, 0x6d, 0x48, 0x49]);
    fireEvent.change(picker, { target: { files: [new File([bytes], 'lockout.ans', { type: 'application/octet-stream' })] } });

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    const put = writes.find(w => w.url.includes('/api/screens/file'));
    expect(put).toBeTruthy();
    expect(decodeURIComponent(put!.url)).toContain('Themes/skope/Node/LOCKOUT0.TXT');
  });
});
