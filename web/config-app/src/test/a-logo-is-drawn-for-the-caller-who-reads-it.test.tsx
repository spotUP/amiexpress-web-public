/**
 * "they should get custom petscii art" (sysop, 2026-09-14).
 *
 * A door's 80-column logo cannot be folded to forty - art has no seams - so
 * the sysop draws one per alphabet and the shadow serves it. This is the
 * dialog that lets him: one canvas per variant, and the one rule that
 * differs between them is the width.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../api/client', () => ({
  apiClient: {
    getDoorArt: vi.fn(),
    getDoorArtVariant: vi.fn(),
    saveDoorArt: vi.fn(),
  },
}));

import { apiClient } from '../api/client';
import { NotificationProvider } from '../contexts/NotificationContext';
import { DoorArtDialog } from '../pages/DoorArtDialog';

const b64 = (s: string) => btoa(s);
const WIDE = b64('\x1b[36m WIDE LOGO');
const NARROW = b64('\x1b[36m NARROW');

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <NotificationProvider>{children}</NotificationProvider>
    </QueryClientProvider>
  );
}

function renderDialog() {
  return render(
    <DoorArtDialog
      command="B" doorName="Bulls" file="Bulls.CFG" section="title"
      label="Title logo" maxLines={20} maxLineLength={200} onClose={() => {}}
    />,
    { wrapper },
  );
}

beforeEach(() => {
  vi.mocked(apiClient.getDoorArt).mockResolvedValue({
    data: [{
      file: 'Bulls.CFG', section: 'title', label: 'Title logo', content: WIDE,
      lines: 1, maxLines: 20, maxLineLength: 200, variants: { c64: true, ttx: false },
    }],
  } as never);
  vi.mocked(apiClient.getDoorArtVariant).mockResolvedValue({
    data: {
      file: 'Bulls.CFG', section: 'title', label: 'Title logo', content: NARROW,
      lines: 1, maxLines: 20, maxLineLength: 40, variants: { c64: true, ttx: false },
    },
  } as never);
});

describe('a logo is drawn for the caller who reads it', () => {
  it('offers a canvas per alphabet, and says which have been drawn', async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Wide$/ })).toBeTruthy());
    expect(screen.getByRole('button', { name: /^C64$/ })).toBeTruthy();
    // The one nobody has drawn says so, rather than opening a blank canvas
    // that looks the same as a drawing somebody emptied.
    expect(screen.getByRole('button', { name: /Teletext \(not drawn\)/ })).toBeTruthy();
  });

  it('loads the C64 drawing when its canvas is chosen', async () => {
    renderDialog();
    await waitFor(() => screen.getByRole('button', { name: /^C64$/ }));
    await userEvent.click(screen.getByRole('button', { name: /^C64$/ }));
    await waitFor(() =>
      expect(apiClient.getDoorArtVariant).toHaveBeenCalledWith('B', 'Bulls.CFG', 'title', 'c64'),
    );
  });

  it('offers to start a variant from the wide art, and only on a variant', async () => {
    renderDialog();
    await waitFor(() => screen.getByRole('button', { name: /^C64$/ }));
    expect(screen.queryByRole('button', { name: /Start from the wide art/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^C64$/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Start from the wide art/ })).toBeTruthy(),
    );
  });
});
