/**
 * A door's Teletext tab draws the NATIVE page and saves it as variant `tti`.
 *
 * The board serves a teletext caller `<section>.tti` before `.ttx.ans`, so
 * the tab edits the page the caller actually gets. Where only the ANSI
 * version exists, the tab says the board shows that one until a page is saved.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { base64ToLatin1 } from '../src/pages/screen-bytes';

const getDoorArt = vi.fn();
const getDoorArtVariant = vi.fn();
const saveDoorArt = vi.fn();

vi.mock('../src/api/client', () => ({
  apiClient: {
    getDoorArt: (...args: unknown[]) => getDoorArt(...args),
    getDoorArtVariant: (...args: unknown[]) => getDoorArtVariant(...args),
    saveDoorArt: (...args: unknown[]) => saveDoorArt(...args),
  },
}));
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { DoorArtDialog } from '../src/pages/DoorArtDialog';

beforeEach(() => {
  vi.clearAllMocks();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  getDoorArt.mockResolvedValue({
    success: true,
    data: [{
      file: 'Bulls.CFG', section: 'TITLE', content: btoa('WIDE'),
      variants: { c64: false, ttx: true, tti: false }, offers: ['ttx'],
    }],
  });
  getDoorArtVariant.mockResolvedValue({ success: true, data: { content: '' } });
  saveDoorArt.mockResolvedValue({ success: true });
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('the Teletext tab of a door art block', () => {
  it('opens the teletext editor on variant tti and saves the page there', async () => {
    render(
      <DoorArtDialog command="MT" doorName="MegaTop" file="Bulls.CFG" section="TITLE"
        label="Title logo" maxLines={10} maxLineLength={79} onClose={vi.fn()} />,
      { wrapper },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Teletext' }));

    expect(await screen.findByTestId('teletext-screen-editor')).toBeInTheDocument();
    expect(getDoorArtVariant).toHaveBeenCalledWith('MT', 'Bulls.CFG', 'TITLE', 'tti');
    expect(screen.getByTestId('door-art-ttx-ans-notice')).toHaveTextContent('until a native page is saved');

    fireEvent.click(screen.getByRole('button', { name: /Save/ }));

    await waitFor(() => expect(saveDoorArt).toHaveBeenCalled());
    const [, , , written, variant] = saveDoorArt.mock.calls[0];
    expect(variant).toBe('tti');
    expect(base64ToLatin1(written as string)).toBe('PN,10000\n');
  });
});
