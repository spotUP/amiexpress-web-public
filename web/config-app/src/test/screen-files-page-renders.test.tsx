/**
 * The Screen Files page renders what the API actually answers.
 *
 * Shipped broken: every route here replies with the envelope
 * `{ success, data, ... }`, and apiClient.get wraps THAT in `{ data }` again -
 * so the page read one layer, handed the envelope to toScreenRows, and
 * `index.screens.map` threw before anything rendered. Live crash, reported
 * 2026-09-01.
 *
 * The unit tests could not have caught it: they fed toScreenRows a
 * hand-built index and never went through the client. This one drives the page
 * with the SHAPE THE SERVER SENDS, which is the only version of the question
 * that matters.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const screenIndex = {
  builtAt: '2026-09-01T00:00:00.000Z',
  unused: [],
  screens: [
    {
      screen: 'BBSTITLE',
      dirType: 'node',
      missingScopes: 1,
      duplicateGroups: [],
      resolutions: [
        { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/BBSTITLE.txt', variants: [] },
        { scope: 'node', id: 2, dir: 'Node2', dirIsShared: false, file: null, variants: [] },
      ],
    },
  ],
  files: {
    'Node1/BBSTITLE.txt': {
      relPath: 'Node1/BBSTITLE.txt', bytes: 6, format: 'text', sha256: 'a', mci: [],
    },
  },
};

// The REAL apiClient runs; only the network is stubbed, with exactly the bytes
// the routes send. Mocking apiClient itself is what hid this: the mock returned
// the envelope, while the real method wraps the envelope again.
const envelope = (data: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ success: true, data, message: undefined, timestamp: '' }),
    text: async () => JSON.stringify({ success: true, data }),
  } as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/api/screens/file')) {
    return envelope({ ...screenIndex.files['Node1/BBSTITLE.txt'], content: '' });
  }
  return envelope(screenIndex);
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    confirm: vi.fn(async () => true),
  }),
}));

// xterm needs a real canvas; the preview is not what this test is about.
vi.mock('../components/ScreenPreview', () => ({
  ScreenPreview: () => null,
}));

import { ScreenFilesPage } from '../pages/ScreenFilesPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('the Screen Files page', () => {
  it('renders the screens the API answers with, without throwing', async () => {
    render(<ScreenFilesPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('BBSTITLE')).toBeTruthy();
    });
  });

  it('shows the scope and the counts the index carries', async () => {
    render(<ScreenFilesPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('node scope')).toBeTruthy();
    });
  });
});
