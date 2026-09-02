/**
 * Repairing forty-one copies of one screen, and overruling the manager.
 *
 * 41 of this board's 47 damaged screens are copies of one NODE_BULL.TXT, so
 * one repair at a time is forty clicks for a single decision. And the
 * manager's classification is a heuristic that has been wrong on this board
 * before, so the sysop can say what a file actually is.
 *
 * Both are writes to the board, so both are driven through the page: the
 * names are shown before anything is written, and the choice reaches the
 * request.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const artBytes = new TextEncoder().encode('[31mRED');

const index = () => ({
  builtAt: '2026-09-02T00:00:00.000Z',
  unused: [],
  screens: [
    {
      screen: 'NODE_BULL', dirType: 'node', missingScopes: 0, duplicateGroups: [],
      resolutions: [
        { scope: 'node', id: 1, dir: 'Node1', dirIsShared: false, file: 'Node1/NODE_BULL.TXT', variants: [] },
      ],
    },
  ],
  files: {
    'Node1/NODE_BULL.TXT': {
      relPath: 'Node1/NODE_BULL.TXT', bytes: artBytes.length, format: 'ansi', sha256: 'a',
      mci: [], problems: ['colour-codes-without-escape'],
    },
  },
});

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const envelope = (data: unknown, message?: string) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, message, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data, message }),
} as unknown as Response);

const posts: { url: string; body: Record<string, unknown> }[] = [];

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);

  if (url.includes('/screens/repair-all')) {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    posts.push({ url, body });
    return body.dryRun
      ? envelope({ dryRun: true, damaged: ['Node1/NODE_BULL.TXT', 'Node2/NODE_BULL.TXT'] })
      : envelope({ repaired: [{ path: 'Node1/NODE_BULL.TXT', codes: 2 }], refused: [] }, 'Repaired 1 file');
  }

  if (url.includes('/screens/flag')) {
    posts.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    return envelope({ path: 'Node1/NODE_BULL.TXT', flag: 'art' }, 'Marked');
  }

  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) {
    return envelope({ ...index().files['Node1/NODE_BULL.TXT'], content: base64(artBytes) });
  }
  return envelope(index());
});
vi.stubGlobal('fetch', fetchMock);

/** Typed on the argument, so a test can read what the sysop was actually asked. */
const confirmed = vi.fn(async (_ask: { title: string; message: string; confirmText?: string }) => true);
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    confirm: confirmed,
  }),
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

describe('repairing every damaged screen at once', () => {
  beforeEach(() => { posts.length = 0; fetchMock.mockClear(); confirmed.mockClear(); });

  it('names the files before writing any of them', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByRole('button', { name: /Repair every damaged screen/i }));

    await waitFor(() => expect(confirmed).toHaveBeenCalled());
    const asked = confirmed.mock.calls[0][0];
    expect(asked.title).toContain('Repair 2 screens');
    expect(asked.message).toContain('Node1/NODE_BULL.TXT');
    expect(asked.message).toContain('backed up');
  });

  it('asks the board what is damaged before it asks the sysop', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByRole('button', { name: /Repair every damaged screen/i }));

    await waitFor(() => expect(posts.length).toBeGreaterThan(0));
    expect(posts[0].body.dryRun).toBe(true);
  });

  it('writes only after the sysop says so', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByRole('button', { name: /Repair every damaged screen/i }));

    await waitFor(() => expect(posts.some(p => p.body.dryRun === false)).toBe(true));
  });

  it('writes nothing when the sysop says no', async () => {
    confirmed.mockResolvedValueOnce(false as never);
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByRole('button', { name: /Repair every damaged screen/i }));

    await waitFor(() => expect(posts.length).toBeGreaterThan(0));
    expect(posts.every(p => p.body.dryRun === true)).toBe(true);
  });
});

describe('the sysop overruling the manager about a file', () => {
  beforeEach(() => { posts.length = 0; fetchMock.mockClear(); });

  it('sends the mark the sysop picked', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByText('Node1/NODE_BULL.TXT'));
    const select = await screen.findByRole('combobox', { name: /This file is/i });
    await user.selectOptions(select, 'runtime');

    await waitFor(() => expect(posts.some(p => p.url.includes('/screens/flag'))).toBe(true));
    expect(posts.find(p => p.url.includes('/screens/flag'))!.body).toMatchObject({
      path: 'Node1/NODE_BULL.TXT', flag: 'runtime',
    });
  });

  it('clears the mark and gives the heuristic its say back', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByText('Node1/NODE_BULL.TXT'));
    await user.click(await screen.findByRole('button', { name: /use the manager's guess/i }));

    await waitFor(() => expect(posts.some(p => p.url.includes('/screens/flag'))).toBe(true));
    expect(posts.find(p => p.url.includes('/screens/flag'))!.body.flag).toBeNull();
  });
});
