/**
 * AN UPLOAD SHOWS YOU WHAT LANDED. IT DOES NOT SHUT THE DOOR BEHIND IT.
 *
 * `save()` ended with `onClose()`, which is right for the editor's Save button
 * and wrong for the upload control that was later wired to the same function:
 * the sysop picked a file and the dialog vanished before showing the art.
 * "when i upload art for the request door the dialog closes when its done, not
 * good" (2026-09-15).
 *
 * Closing is the CALLER's decision now - `save` hands back the bytes it wrote,
 * the Save button closes on a successful write, and the upload path repaints
 * the canvas with them instead.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** The art the door already has, as the API carries it. */
const EXISTING = btoa('OLD ART');

const open = (onClose = vi.fn()) => {
  render(
    <DoorArtDialog
      command="REQ"
      doorName="REQUESTS"
      file="Bulletin_Header.txt"
      section="bulletinHeader"
      label="Bulletin header art"
      maxLines={20}
      maxLineLength={79}
      onClose={onClose}
    />,
    { wrapper },
  );
  return onClose;
};

const pick = async (body: string) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  await userEvent.upload(input, new File([body], 'logo.ans', { type: 'text/plain' }));
};

describe('uploading art into a door art block', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    getDoorArt.mockResolvedValue({
      success: true,
      data: [{
        file: 'Bulletin_Header.txt', section: 'bulletinHeader',
        content: EXISTING, variants: { c64: false, ttx: false },
      }],
      timestamp: '',
    });
    saveDoorArt.mockResolvedValue({ success: true });
  });

  it('keeps the dialog open so the sysop can see what was uploaded', async () => {
    const onClose = open();
    await screen.findByRole('dialog');

    await pick('THE NEW LOGO\n');

    await waitFor(() => expect(saveDoorArt).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeTruthy();
  });

  it('writes the bytes that were picked', async () => {
    open();
    await screen.findByRole('dialog');

    await pick('THE NEW LOGO\n');

    await waitFor(() => expect(saveDoorArt).toHaveBeenCalled());
    const [command, file, section, base64] = saveDoorArt.mock.calls[0];
    expect({ command, file, section }).toEqual({
      command: 'REQ', file: 'Bulletin_Header.txt', section: 'bulletinHeader',
    });
    // The upload goes through the canvas, as a drawing made here does, so
    // the bytes are the canvas's: the text, with trailing blank rows trimmed.
    const written = atob(base64 as string);
    expect(written).toContain('THE NEW LOGO');
    expect(written.split('\n').filter(row => row.trim() !== '')).toHaveLength(1);
  });

  it('does not close when the upload is refused', async () => {
    // A refusal that closed the dialog would take the error message with it.
    const onClose = open();
    await screen.findByRole('dialog');

    await pick(Array.from({ length: 40 }, (_, i) => `row ${i}`).join('\n'));

    expect(await screen.findByText(/40 lines, at most 20/)).toBeTruthy();
    expect(saveDoorArt).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
