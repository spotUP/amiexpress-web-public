/**
 * When a share is refused, the sysop is told WHY, per node.
 *
 * Reported: "i tried the check this directory for screens and get 5 nodes
 * cannot share this directory". That sentence is the backend's summary line -
 * the answer also carries, for every blocked node, the files it would lose,
 * the files it would gain and the screens that differ. None of it reached the
 * screen, because ApiError carried only a message and a status: the page read
 * `error.data.blocked`, which was always undefined, and fell back to showing
 * the sentence.
 *
 * SCREENS repoints a node's WHOLE screen set, so "would lose LOGON.TXT" is the
 * difference between an informed choice and a silent one.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { apiClient, ApiError } from '../api/client';

const index = {
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [],
  screens: [
    {
      screen: 'BBSTITLE', dirType: 'node', missingScopes: 0,
      duplicateGroups: [{ sha256: 'a', paths: ['Node1/BBSTITLE.txt', 'Node2/BBSTITLE.txt'] }],
      resolutions: [
        { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/BBSTITLE.txt', variants: [] },
        { scope: 'node', id: 2, dir: 'Node2', dirIsShared: false, file: 'Node2/BBSTITLE.txt', variants: [] },
      ],
    },
  ],
  files: {
    'Node1/BBSTITLE.txt': { relPath: 'Node1/BBSTITLE.txt', bytes: 6, format: 'text', sha256: 'a', mci: [] },
    'Node2/BBSTITLE.txt': { relPath: 'Node2/BBSTITLE.txt', bytes: 6, format: 'text', sha256: 'a', mci: [] },
  },
};

const refusal = {
  success: false,
  error: '1 node cannot share this directory',
  data: {
    blocked: [{ id: 2, reasons: ['LOGON.TXT differs'], losing: ['JOIN.TXT'], gaining: ['GOODBYE.TXT'] }],
    canShare: [1],
  },
};

const reply = (status: number, body: unknown) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body,
  text: async () => JSON.stringify(body),
} as unknown as Response);

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes('/screens/shared-directories')) {
    return reply(200, { success: true, data: { directories: [{ dir: 'Screens', files: 30 }] } });
  }
  if (url.includes('/api/screens/share') && init?.method === 'POST') return reply(409, refusal);
  if (url.includes('/api/screens/file')) {
    return reply(200, { success: true, data: { ...index.files['Node1/BBSTITLE.txt'], content: '' } });
  }
  return reply(200, { success: true, data: index });
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

describe('a refused share', () => {
  beforeEach(() => fetchMock.mockClear());

  it('carries the board\'s answer on the error, not just its sentence', async () => {
    await expect(apiClient.shareScreens([1, 2], 'Screens', true)).rejects.toThrow();

    try {
      await apiClient.shareScreens([1, 2], 'Screens', true);
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(409);
      expect((error as ApiError).data).toMatchObject({ canShare: [1] });
    }
  });

  it('names each blocked node and what it would lose', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByText('BBSTITLE'));
    await user.click(await screen.findByRole('button', { name: /check this directory/i }));

    // 'Node 2' also names the resolution row above; the reasons line is the
    // one this is about.
    expect(await screen.findByText(/LOGON\.TXT differs/)).toBeTruthy();
    expect(screen.getByText(/would lose JOIN\.TXT/)).toBeTruthy();
    expect(screen.getByText(/would gain GOODBYE\.TXT/)).toBeTruthy();
  });

  it('still offers to point the nodes that CAN share', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByText('BBSTITLE'));
    await user.click(await screen.findByRole('button', { name: /check this directory/i }));

    expect(await screen.findByRole('button', { name: /Point 1 node at Screens/i })).toBeTruthy();
  });
});
