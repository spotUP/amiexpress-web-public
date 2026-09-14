/**
 * A .rip screen opens in the RIP editor, not the ANSI one.
 *
 * The screens admin is being taken from "the ANSI/text pair" to every screen
 * type the board serves, and the four are different media: a .rip is a vector
 * program, a .seq is PETSCII bytes, ANSI and plain text are cells. Routed
 * wrongly, a .rip lands on a canvas of cells that shows a blank 80x25 - and
 * saving that writes the blank over the artwork.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { forwardRef, useImperativeHandle, type ReactNode } from 'react';

vi.mock('@amiexpress/terminal/rip', () => ({
  RIP_WIDTH: 640,
  RIP_HEIGHT: 350,
  // Sixteen entries, because the editor's swatches are INDEXES into the
  // palette and the tests click one by index. The real one lives in
  // packages/terminal/src/rip/RIPTypes.ts; vite cannot load it from here
  // without dragging in the canvas-bound vendor this mock exists to avoid.
  // `the palette the editor indexes into` (rip-ega-palette.test.ts) holds
  // the real one at sixteen so these indexes stay meaningful.
  EGA_PALETTE: Array.from({ length: 16 }, (_, i) => `#${i.toString(16).repeat(6)}`),
  RIPRenderer: forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
    useImperativeHandle(ref, () => ({
      render: vi.fn(), clear: vi.fn(), reset: vi.fn(), getState: vi.fn(),
    }));
    return <div data-testid="rip-canvas" />;
  }),
}));

const RIP_SCREEN = '!|c0F|B00003F27\r\n!|1M010A0K2S141000000JOIN 3\r\n!|#\r\n';

const index = () => ({
  builtAt: '2026-09-07T00:00:00.000Z',
  unused: [],
  screens: [
    {
      screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, duplicateGroups: [],
      resolutions: [
        {
          scope: 'node', id: 1, dir: 'Node1', dirIsShared: false,
          file: 'Node1/bbstitle.rip', variants: [],
        },
      ],
    },
  ],
  files: {
    'Node1/bbstitle.rip': {
      relPath: 'Node1/bbstitle.rip', bytes: RIP_SCREEN.length,
      format: 'rip', sha256: 'a', mci: [],
    },
  },
});

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const fetchMock = vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) {
    return envelope({ ...index().files['Node1/bbstitle.rip'], content: btoa(RIP_SCREEN) });
  }
  return envelope(index());
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));
vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));

import { ScreenFilesPage } from '../pages/ScreenFilesPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('opening a RIP screen from the screens admin', () => {
  beforeEach(() => { fetchMock.mockClear(); });

  it('opens the RIP editor rather than the canvas of cells', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByRole('tab', { name: /Node screens/ }));
    await user.click(await screen.findByText('BBSTITLE'));
    await user.click(await screen.findByText('Node1/bbstitle.rip'));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByTestId('rip-screen-editor')).toBeTruthy();
    expect(within(dialog).queryByTestId('ansi-canvas')).toBeNull();
  });

  it('shows the regions the screen already binds, with their commands', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByRole('tab', { name: /Node screens/ }));
    await user.click(await screen.findByText('BBSTITLE'));
    await user.click(await screen.findByText('Node1/bbstitle.rip'));

    const dialog = await screen.findByRole('dialog');
    const rows = await within(dialog).findAllByTestId('rip-region-row');
    expect(rows.map(row => row.textContent)).toEqual(['Mouse field 1sends JOIN 3']);
  });
});
