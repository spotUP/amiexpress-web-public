/**
 * A card that stands for several versions says so.
 *
 * One card per screen is only an improvement if the artist can tell WHY the
 * count under it moved. `logoff.txt` on the live board is three versions
 * across 41 scopes, and a card that silently shows the most-read one would
 * hide from the artist the very drift the grouping exists to surface.
 *
 * A screen with one version says nothing at all, so the ordinary card is
 * exactly as it was.
 */
import type { ReactNode } from 'react';
import { expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/api/client', () => ({
  apiClient: { getScreenFile: vi.fn(async () => ({ data: { content: '' } })) },
}));

import { ScreenGallery, type GalleryItem } from '../src/components/ScreenGallery';

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  </MemoryRouter>
);

const card = (over: Partial<GalleryItem> = {}): GalleryItem => ({
  path: 'Node0/logoff.txt',
  label: 'LOGOFF',
  detail: 'read by 38 nodes',
  format: 'ansi',
  ...over,
});

const draw = (item: GalleryItem) =>
  render(<ScreenGallery items={[item]} onOpen={vi.fn()} />, { wrapper });

it('says how many versions there are and how much of the board reads this one', () => {
  draw(card({ versions: 3, scopes: 38, otherScopes: 3 }));

  expect(screen.getByText(/3 versions/i)).toBeInTheDocument();
  expect(screen.getByText(/38 of 41/)).toBeInTheDocument();
});

it('says nothing at all when a screen has one version', () => {
  draw(card({ versions: 1, scopes: 41, otherScopes: 0 }));

  expect(screen.queryByText(/versions/i)).not.toBeInTheDocument();
});

it('says nothing when the grouping did not report versions', () => {
  // Every other caller of this component passes items built elsewhere.
  draw(card());

  expect(screen.queryByText(/versions/i)).not.toBeInTheDocument();
});
