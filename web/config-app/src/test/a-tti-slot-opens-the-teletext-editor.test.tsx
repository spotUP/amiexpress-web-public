/**
 * A `.tti` slot in the artist studio opens the teletext editor.
 *
 * The ladder used to call a native teletext page "bytes this board cannot
 * draw". The route reports it as `teletext-native`; the dialog has to MOUNT
 * the teletext editor for it, or the editor is a component nothing opens.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../lib/query-client';
import { latin1ToBase64 } from '../pages/screen-bytes';

const page = 'PN,10000\nOL,1,HELLO\n';

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/api/screens/file')) {
    return envelope({ content: latin1ToBase64(page), format: 'teletext-native', bytes: page.length, mci: [] });
  }
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope({});
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ArtistScreenDialog } from '../pages/ArtistScreenDialog';
import type { ScreenIndexShape } from '../pages/screen-index-view';

const mineTheme = { slug: 'skope', title: "skope's screens", status: 'draft' as const, dir: 'Themes/skope', owner: 'skope', screens: 1, mine: true };
const minePath = 'Themes/skope/Node/BBSTITLE.TTI';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

describe('a .tti slot in the artist studio', () => {
  it('opens the teletext editor', async () => {
    const index = { files: { [minePath]: { relPath: minePath, theme: 'skope' } } } as unknown as ScreenIndexShape;
    render(
      <ArtistScreenDialog path={minePath} theme={mineTheme} index={index} onClose={vi.fn()} onOpenPath={vi.fn()} />,
      { wrapper },
    );
    expect(await screen.findByTestId('teletext-screen-editor')).toBeInTheDocument();
  });
});
