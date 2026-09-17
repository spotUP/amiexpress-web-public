/**
 * A .seq screen opens to a PETSCII preview, not a "no preview" apology.
 *
 * The files-page dialog routed ansi/text to ScreenArt and .rip to the RIP
 * editor, but every .seq fell through to a placeholder that read "the board
 * does not render this correctly yet". That predated petscii80 - the board
 * renders .seq correctly now, and PetsciiScreenPreview (the same component the
 * theme page uses) draws it. This pins that a petscii file gets the preview
 * and not the placeholder.
 *
 * 2026-09-14: the component is now PetsciiScreenEditor in its readOnly mode -
 * the same thing the artist studio opens - for the reason the RIP branch
 * beside it already gave: a viewer and an editor that draw a file differently
 * is the bug class this page keeps hitting. The PROPERTY under test has not
 * changed: a .seq gets the board's own PETSCII surface and never an apology.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const seqBytes = new Uint8Array([0x93, 0x12, 0x41, 0x42]); // clear, rvs-on, AB

const index = () => ({
  builtAt: '2026-09-02T00:00:00.000Z',
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
  return envelope(index());
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));
vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));
// The canvas cannot draw in jsdom; a marker proves the branch chose it.
vi.mock('../components/PetsciiScreenEditor', () => ({
  PetsciiScreenEditor: ({ content }: { content: string }) => (
    <div data-testid="petscii-preview">{content.slice(0, 6)}</div>
  ),
}));

import { ScreenScopeTables } from '../pages/ScreenScopeTables';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('a .seq screen opens to a PETSCII preview', () => {
  beforeEach(() => { fetchMock.mockClear(); });

  it('draws the PETSCII surface, not the old placeholder', async () => {
    const user = userEvent.setup();
    render(<ScreenScopeTables />, { wrapper });
    await user.click(await screen.findByRole('tab', { name: /Node screens/ }));
    await user.click(await screen.findByText('BBSTITLE'));
    await user.click(await screen.findByText('Node1/BBSTITLE.SEQ'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByTestId('petscii-preview')).toBeTruthy();
    expect(within(dialog).queryByText(/no preview available/i)).toBeNull();
    expect(within(dialog).queryByText(/does not render this correctly yet/i)).toBeNull();
  });
});
