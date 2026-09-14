/**
 * An undrawn `.seq` slot can be DRAWN, not only uploaded into.
 *
 * Sysop, standing in ansiguy's theme on Themes/ansiguy/Node/BBSTITLE.SEQ:
 * "Nothing is drawn at ... yet. Use Upload a drawing on the version that does
 * exist, or the format buttons above, to make one." Every one of those
 * affordances brings a file in from somewhere else. There was no way to draw
 * a PETSCII screen that did not exist yet, in the studio whose whole job is
 * drawing - and the sysop's verdict on finding that out was that the UX is
 * confusing, which it is.
 *
 * ANSI never had this problem: a slot opened from the checklist arrives with
 * `isNew` and a blank 80x25 canvas. PETSCII could not take that path, because
 * a blank PETSCII screen is 40x25 screen codes rather than a canvas of cells.
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
  // The slot is EMPTY: the file route answers 404, which is what "nothing is
  // drawn here yet" actually is.
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

const theme = { slug: 'ansiguy', title: "ansiguy's screens", status: 'draft' as const, dir: 'Themes/ansiguy', owner: 'ansiguy', screens: 1, mine: true };
const slot = 'Themes/ansiguy/Node/BBSTITLE.SEQ';
// The slot is the theme's own, and there is no file at it.
const index = { files: { [slot]: { relPath: slot, theme: 'ansiguy' } } } as unknown as ScreenIndexShape;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  writes.length = 0;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

describe('an undrawn .seq slot', () => {
  it('offers to draw one, and the editor opens on a blank C64 screen', async () => {
    render(<ArtistScreenDialog path={slot} theme={theme} index={index} onClose={vi.fn()} onOpenPath={vi.fn()} />, { wrapper });

    await userEvent.click(await screen.findByRole('button', { name: 'Draw one here' }));

    expect(await screen.findByTestId('petscii-editor-canvas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Draw' })).toBeInTheDocument();
    expect(screen.getByTestId('petscii-charset-browser')).toBeInTheDocument();
  });

  it('saving creates the file at the slot that had none', async () => {
    render(<ArtistScreenDialog path={slot} theme={theme} index={index} onClose={vi.fn()} onOpenPath={vi.fn()} />, { wrapper });

    await userEvent.click(await screen.findByRole('button', { name: 'Draw one here' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Character 1' }));
    await userEvent.click(screen.getByRole('button', { name: /Save/ }));

    expect(writes.length).toBeGreaterThan(0);
    expect(writes[0].url).toContain('/api/screens/file');
  });
});
