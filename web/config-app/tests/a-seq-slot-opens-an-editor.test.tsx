/**
 * A `.seq` slot in the artist studio OPENS AN EDITOR.
 *
 * The studio could edit ANSI and RIP and could only look at PETSCII - the gap
 * the sysop named twice, and the reason "Redraw this in my theme" copied a
 * `.seq` into an artist's theme that they then could not change. This is the
 * reachability pin for the browser half of that work: the dialog has to MOUNT
 * the editor, or every test under it is testing a component nothing opens.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../src/lib/query-client';
import { blankSurface, writeSeq } from '@amiexpress/bbs-door-sdk/petscii';

const seq = writeSeq(blankSurface());
const base64 = btoa(String.fromCharCode(...seq));

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/api/screens/file')) {
    return envelope({ content: base64, format: 'petscii', bytes: seq.length, mci: [] });
  }
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope({});
}));

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ArtistScreenDialog } from '../src/pages/ArtistScreenDialog';
import type { ScreenIndexShape } from '../src/pages/screen-index-view';

const mineTheme = { slug: 'skope', title: "skope's screens", status: 'draft' as const, dir: 'Themes/skope', owner: 'skope', screens: 1, mine: true };
const minePath = 'Themes/skope/Node/BBSTITLE.SEQ';
const theirPath = 'Themes/zzz/Node/BBSTITLE.SEQ';

const indexFor = (path: string, themeSlug: string) => ({
  files: { [path]: { relPath: path, theme: themeSlug } },
}) as unknown as ScreenIndexShape;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  // jsdom has no 2D context; the canvas paints nothing and mounts fine.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

describe('a .seq slot in the artist studio', () => {
  it('opens the PETSCII editor, with tools', async () => {
    render(
      <ArtistScreenDialog path={minePath} theme={mineTheme} index={indexFor(minePath, 'skope')} onClose={vi.fn()} onOpenPath={vi.fn()} />,
      { wrapper },
    );
    expect(await screen.findByTestId('petscii-editor-canvas')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Draw' })).toBeInTheDocument());
    expect(screen.getByLabelText('This screen uses MCI codes')).toBeInTheDocument();
  });

  it("opens another artist's .seq read-only - the art, and nothing to change it with", async () => {
    render(
      // Ownership is the FILE's theme against the theme being viewed
      // (ArtistScreenDialog.tsx:117) - so this is zzz's screen, seen from
      // skope's studio.
      <ArtistScreenDialog path={theirPath} theme={mineTheme} index={indexFor(theirPath, 'zzz')} onClose={vi.fn()} onOpenPath={vi.fn()} />,
      { wrapper },
    );
    expect(await screen.findByTestId('petscii-editor-canvas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Draw' })).toBeNull();
    expect(screen.queryByTestId('petscii-charset-browser')).toBeNull();
  });
});
