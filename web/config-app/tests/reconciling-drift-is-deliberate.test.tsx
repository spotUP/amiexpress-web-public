/**
 * Drift is shown inside the card, and reconciled only when asked.
 *
 * Task 2 made a drifted card say "3 versions - serving 38 of 41 scopes". That
 * is the summary; this is the detail behind it - WHICH scopes read something
 * else, so the artist can decide whether a node is deliberately different or
 * simply never updated.
 *
 * Opening the detail must change nothing. A delete or a rewrite that happens
 * because somebody looked at a card is the failure this board keeps finding,
 * and the backup only covers the file that was written.
 */
import type { ReactNode } from 'react';
import { expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const putScreenFile = vi.fn(async () => ({ data: {} }));
vi.mock('../src/api/client', () => ({
  apiClient: {
    getScreenFile: vi.fn(async () => ({ data: { content: '' } })),
    putScreenFile: (...args: unknown[]) => putScreenFile(...(args as [])),
  },
}));

import { ScreenGallery, type GalleryItem } from '../src/components/ScreenGallery';

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  putScreenFile.mockClear();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  </MemoryRouter>
);

const drifted: GalleryItem = {
  path: 'Node0/logoff.txt',
  label: 'LOGOFF',
  detail: 'read by 38 nodes',
  format: 'ansi',
  versions: 3,
  scopes: 38,
  otherScopes: 3,
  otherVersions: [
    [{ relPath: 'Node7/logoff.txt', readBy: [{ scopeName: 'Node7' }] }],
    [{ relPath: 'Conf4/logoff.txt', readBy: [{ scopeName: 'Conf4' }] }],
  ],
};

const draw = (item: GalleryItem = drifted) =>
  render(<ScreenGallery items={[item]} onOpen={vi.fn()} />, { wrapper });

it('shows what the other versions are, and where they are read', async () => {
  draw();

  await userEvent.click(screen.getByRole('button', { name: /3 versions/i }));

  expect(await screen.findByText(/Node7\/logoff\.txt/)).toBeInTheDocument();
  expect(screen.getByText(/Conf4\/logoff\.txt/)).toBeInTheDocument();
});

it('never writes anything just because the detail was opened', async () => {
  draw();

  await userEvent.click(screen.getByRole('button', { name: /3 versions/i }));

  // Looking is not a decision.
  expect(putScreenFile).not.toHaveBeenCalled();
});

it('has nothing to open when a screen has one version', () => {
  draw({ ...drifted, versions: 1, otherVersions: [], otherScopes: 0 });

  expect(screen.queryByRole('button', { name: /versions/i })).not.toBeInTheDocument();
});
