/**
 * AN .ANS FROM PABLODRAW UPLOADS INTO A DOOR'S ART.
 *
 * Artist, 2026-10-19, on MAG's logo: "Is it possible to simply upload an .ans
 * file using the Upload A Drawing option. Just tried that and doesn't seem to
 * work." The upload handed the file's raw bytes to the column check, which
 * counts the CR of every CRLF line and the SAUCE record PabloDraw appends as
 * printable columns - so a full-width 80-column logo was "line 1 is 81
 * columns, at most 80" and nothing was written. The upload now goes through
 * the canvas, like a drawing made here, so the check sees what the board
 * will print.
 *
 * The same dialog carries ONE Save and ONE way out while an editor is open:
 * "there are too many save and write etc buttons in the editors it gets the
 * artists confused" (sysop, 2026-10-19).
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

const open = () => render(
  <DoorArtDialog
    command="MAG" doorName="MAGAZINE" file="Magazine.CFG" section="LOGO"
    label="Logo" maxLines={25} maxLineLength={80} onClose={vi.fn()}
  />,
  { wrapper },
);

/** What PabloDraw writes: CRLF rows, a full-width one, then ^Z and SAUCE. */
function pabloDrawFile(): string {
  const rows = ['\x1b[0;1;36m' + '#'.repeat(80), '\x1b[0m  MAGAZINE', ''];
  const body = rows.join('\r\n');
  const sauce = 'SAUCE00' + 'MAG logo'.padEnd(35) + 'artist'.padEnd(20) + 'group'.padEnd(20)
    + '20261019';
  // All seven-bit, so the File's UTF-8 encoding is these exact bytes.
  return body + '\x1a' + sauce.padEnd(128, '\0');
}

describe('uploading a PabloDraw .ans into door art', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    getDoorArt.mockResolvedValue({
      success: true,
      data: [{ file: 'Magazine.CFG', section: 'LOGO', content: btoa('OLD LOGO'), variants: { c64: false, ttx: false } }],
      timestamp: '',
    });
    saveDoorArt.mockResolvedValue({ success: true });
  });

  it('writes the logo instead of refusing its CRs and SAUCE as columns', async () => {
    open();
    await screen.findByRole('button', { name: /^Save$/ });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File([pabloDrawFile()], 'logo.ans'));

    await waitFor(() => expect(saveDoorArt).toHaveBeenCalled());
    expect(screen.queryByText(/columns, at most/)).toBeNull();
    const written = atob(saveDoorArt.mock.calls[0][3] as string);
    expect(written).toContain('#'.repeat(80));
    expect(written).toContain('MAGAZINE');
    expect(written).not.toContain('SAUCE00');
  });

  it('shows exactly one Save and one way out while the editor is open', async () => {
    open();
    await screen.findByRole('button', { name: /^Save$/ });
    expect(screen.getAllByRole('button', { name: /^Save$/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Cancel|Close/ })).toHaveLength(1);
  });
});
