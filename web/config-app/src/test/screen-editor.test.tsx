/**
 * The editor as a sysop reaches it: a screen in the list, a file under it, an
 * Edit button, and bytes back on the board.
 *
 * Driven through the page rather than the component, and through the REAL
 * apiClient with only the network stubbed - the Screen Files page shipped
 * broken once because a test mocked the client and repeated the envelope
 * convention instead of what the method returns.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { base64ToBytes, bytesToBase64 } from '../pages/screen-bytes';

let ansiBytes = new TextEncoder().encode('\x1b[31mHI');
let fileFormat: 'ansi' | 'rip' = 'ansi';
let fileMci: { code: string; target: string; resolves: boolean; scopeSpecific: boolean }[] = [];

const screenIndex = () => ({
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [],
  screens: [
    {
      screen: 'BBSTITLE',
      dirType: 'node',
      missingScopes: 0,
      duplicateGroups: [],
      resolutions: [
        { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/BBSTITLE.txt', variants: [] },
      ],
    },
  ],
  files: {
    'Node1/BBSTITLE.txt': {
      relPath: 'Node1/BBSTITLE.txt', bytes: ansiBytes.length, format: fileFormat, sha256: 'a', mci: fileMci,
    },
  },
});

const envelope = (data: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ success: true, data, message: undefined, timestamp: '' }),
    text: async () => JSON.stringify({ success: true, data }),
  } as unknown as Response);

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes('/api/screens/file') && init?.method === 'PUT') {
    return envelope({ written: ['Node1/BBSTITLE.txt'] });
  }
  if (url.includes('/api/screens/file')) {
    return envelope({
      ...screenIndex().files['Node1/BBSTITLE.txt'],
      content: bytesToBase64(ansiBytes),
    });
  }
  return envelope(screenIndex());
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    confirm: vi.fn(async () => true),
  }),
}));

// xterm wants a real canvas; the caller's-eye preview is not what this is about.
vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));

import { ScreenFilesPage } from '../pages/ScreenFilesPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Open BBSTITLE, then the file under it - what a sysop clicks to get here. */
async function openTheFile(user: ReturnType<typeof userEvent.setup>) {
  render(<ScreenFilesPage />, { wrapper });
  await user.click(await screen.findByText('BBSTITLE'));
  await user.click(await screen.findByRole('button', { name: 'Node1/BBSTITLE.txt' }));
}

describe('editing a screen in the browser', () => {
  beforeEach(() => {
    fileFormat = 'ansi';
    ansiBytes = new TextEncoder().encode('\x1b[31mHI');
    fileMci = [];
    fetchMock.mockClear();
  });

  it('opens the art on a canvas, and saves it through the same fan-out a replace uses', async () => {
    const user = userEvent.setup();
    await openTheFile(user);

    await user.click(await screen.findByRole('button', { name: /edit/i }));
    expect(await screen.findByTestId('ansi-canvas')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^save$/i }));
    // The fan-out is the upload path's, unchanged: editing the LOGON screen has
    // to offer "all the nodes that have it" exactly as replacing it does.
    await user.click(await screen.findByText('this file only'));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
      expect(put).toBeTruthy();
      const body = JSON.parse(String((put?.[1] as RequestInit).body));
      expect(base64ToBytes(body.content).length).toBeGreaterThan(0);
    });
  });

  it('saves what was drawn, not what was loaded', async () => {
    const user = userEvent.setup();
    await openTheFile(user);
    await user.click(await screen.findByRole('button', { name: /edit/i }));

    // A stroke on an empty row, in a colour the loaded screen does not carry.
    await user.click(screen.getByRole('button', { name: 'Bright green foreground' }));
    const canvas = screen.getByTestId('ansi-canvas');
    await user.pointer([{ target: canvas, coords: { clientX: 0, clientY: 32 }, keys: '[MouseLeft]' }]);

    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await user.click(await screen.findByText('this file only'));

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
      const body = JSON.parse(String((put?.[1] as RequestInit).body));
      const saved = base64ToBytes(body.content);
      const text = new TextDecoder('latin1').decode(saved);
      // Bright green is SGR 92, and the default brush is the full block, which
      // is byte 0xDB once it is CP437 again.
      expect(text).toContain('\x1b[92');
      expect(saved).toContain(0xdb);
    });
  });

  it('leaves the screen alone when the edit is abandoned', async () => {
    const user = userEvent.setup();
    await openTheFile(user);

    await user.click(await screen.findByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /cancel editing/i }));

    expect(screen.queryByTestId('ansi-canvas')).toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'PUT')).toBe(false);
  });

  it('shows a dead MCI code as dead, where it sits on the screen', async () => {
    // A screen is a program: a ~CC_ pointing at a deleted door is a menu item
    // that fails when a caller presses the key, and the editor is where a sysop
    // would see that before saving over it.
    ansiBytes = new TextEncoder().encode('press K for ~CC_nosuchdoor|');
    fileMci = [{ code: 'CC', target: 'nosuchdoor', resolves: false, scopeSpecific: false }];

    const user = userEvent.setup();
    await openTheFile(user);
    await user.click(await screen.findByRole('button', { name: /edit/i }));

    expect(await screen.findByText(/~CC_nosuchdoor - points at nothing/)).toBeTruthy();
  });

  it('inserts a code at the cursor, as one thing the sysop can undo', async () => {
    const user = userEvent.setup();
    await openTheFile(user);
    await user.click(await screen.findByRole('button', { name: /edit/i }));

    await user.click(screen.getByRole('button', { name: 'List the conferences' }));

    expect(await screen.findByText(/line 1, column 1: ~CL\./)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(screen.queryByText(/line 1, column 1: ~CL\./)).toBeNull();
  });

  it('offers no editor for a RIP screen, and says which phase owns it', async () => {
    fileFormat = 'rip';
    const user = userEvent.setup();
    await openTheFile(user);

    expect(await screen.findByText(/RIP graphics/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
  });
});
