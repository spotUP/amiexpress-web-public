/**
 * A `.seq` row in the SCREENS MANAGER opens the editor, not a view of it.
 *
 * The row click has always routed drawable formats into an editor
 * (`setPendingEdit`), and `petscii` was not in that list because until
 * 2026-09-14 there was no PETSCII editor to route to. When one arrived, the
 * dialog's read-only branch drew the art with every tool hidden - which is
 * indistinguishable from the old preview, and is exactly what the sysop
 * reported: "i clicked petscii on the bbstitle in the default theme but i get
 * no editor just a preview".
 *
 * So this pins the ROUTE, which is the part that was missing. The editor's own
 * behaviour is pinned in a-petscii-screen-is-drawn-and-saved.
 *
 * Harness copied from petscii-preview-in-dialog.test.tsx.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { blankSurface, writeSeq } from '@amiexpress/bbs-door-sdk/petscii';

const seqBytes = writeSeq(blankSurface());

const index = () => ({
  builtAt: '2026-09-14T00:00:00.000Z',
  unused: [],
  screens: [
    {
      screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, duplicateGroups: [],
      resolutions: [
        { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/BBSTITLE.SEQ', variants: [] },
      ],
    },
  ],
  files: {
    'Node1/BBSTITLE.SEQ': {
      relPath: 'Node1/BBSTITLE.SEQ', bytes: seqBytes.length, format: 'petscii', sha256: 'a', mci: [],
    },
  },
});

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const fetchMock = vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) {
    return envelope({ ...index().files['Node1/BBSTITLE.SEQ'], content: base64(seqBytes) });
  }
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  return envelope(index());
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));
vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));

import { ScreenScopeTables } from '../pages/ScreenScopeTables';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  fetchMock.mockClear();
  // jsdom has no 2D context; the canvas mounts and paints nothing.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

describe('a .seq row in the screens manager', () => {
  it('opens an editor with tools, not a read-only view of the art', async () => {
    const user = userEvent.setup();
    render(<ScreenScopeTables />, { wrapper });
    await user.click(await screen.findByRole('tab', { name: /Node screens/ }));
    await user.click(await screen.findByText('BBSTITLE'));
    await user.click(await screen.findByText('Node1/BBSTITLE.SEQ'));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByTestId('petscii-editor-canvas')).toBeInTheDocument();
    // The tools are the whole difference between an editor and a preview.
    expect(await within(dialog).findByRole('button', { name: 'Draw' })).toBeInTheDocument();
    expect(within(dialog).getByTestId('petscii-charset-browser')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('This screen uses MCI codes')).toBeInTheDocument();
  });
});
