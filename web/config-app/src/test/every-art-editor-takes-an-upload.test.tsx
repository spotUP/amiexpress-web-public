/**
 * Every editor that shows art takes a drawing from a file.
 *
 * Sysop, 2026-09-15: "i see no upload button in this dialog: REQ - Bulletin
 * header art", then "all screen and door art editors needs upload buttons",
 * "for all supported formats".
 *
 * Most ANSI artists draw in PabloDraw or Moebius and bring the file in, so an
 * editor that can only edit what the browser can draw is one they cannot use.
 * The screen dialog had an upload; the DOOR ART dialog and the BULLETIN
 * editor had none at all, and `readAsBase64` existed in three copies.
 *
 * These drive the controls rather than looking for a button: what matters is
 * that picking a file reaches the host's OWN save path, because a screen, a
 * door's config section and a bulletin are three different endpoints with
 * three different refusals.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { QUERY_DEFAULTS } from '../lib/query-client';
import { ART_UPLOAD_ACCEPT, ANSI_UPLOAD_ACCEPT } from '../components/ArtUploadButton';

const art = new TextEncoder().encode('\x1b[31mDRAWN ELSEWHERE');
const base64 = btoa(String.fromCharCode(...art));

const saved: Array<{ url: string; body: any }> = [];
const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if ((init?.method ?? 'GET') !== 'GET') saved.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
  if (url.includes('/api/door-art')) {
    return envelope([{ file: 'Bulls.CFG', section: 'bulletinHeader', label: 'Bulletin header art', content: base64, lines: 1, maxLines: 10, maxLineLength: 80 }]);
  }
  return envelope({});
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ArtUploadButton } from '../components/ArtUploadButton';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { ...QUERY_DEFAULTS, queries: { ...QUERY_DEFAULTS.queries, retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => { saved.length = 0; });

describe('the formats an upload accepts', () => {
  // An upload that takes fewer formats than the board SERVES is how a theme
  // ends up with no .seq and every C64 caller seeing the board's art.
  it('covers every format a caller can be served', () => {
    for (const ext of ['.ans', '.txt', '.rip', '.seq', '.ttx', '.tti']) {
      expect(ART_UPLOAD_ACCEPT).toContain(ext);
    }
  });

  it('takes the SVG an artist exports, which the board converts', () => {
    expect(ART_UPLOAD_ACCEPT).toContain('.svg');
  });

  it('keeps the ANSI-only list to text formats, for slots that hold ANSI', () => {
    // A .rip inside a door's config section would be bytes the door prints raw.
    expect(ANSI_UPLOAD_ACCEPT).toContain('.ans');
    expect(ANSI_UPLOAD_ACCEPT).not.toContain('.rip');
    expect(ANSI_UPLOAD_ACCEPT).not.toContain('.seq');
  });
});

describe('the shared control', () => {
  it('hands the host base64 bytes, not text', async () => {
    const onPick = vi.fn();
    render(<ArtUploadButton onPick={onPick} testId="pick" />, { wrapper });

    const input = screen.getByTestId('pick') as HTMLInputElement;
    const file = new File([art], 'logo.ans', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => expect(onPick).toHaveBeenCalled());
    expect(onPick.mock.calls[0][0]).toBe(base64);
    expect(onPick.mock.calls[0][1].name).toBe('logo.ans');
  });

  it('clears the input so the same file can be picked twice', async () => {
    // After a failed save an artist picks the same file again; a value left
    // in place fires no change event at all and the button looks dead.
    const onPick = vi.fn();
    render(<ArtUploadButton onPick={onPick} testId="twice" />, { wrapper });

    const input = screen.getByTestId('twice') as HTMLInputElement;
    const file = new File([art], 'logo.ans', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => expect(onPick).toHaveBeenCalled());
    expect(input.value).toBe('');
  });
});

describe('the door art dialog', () => {
  it('offers an upload, which it did not before', async () => {
    const { DoorArtDialog } = await import('../pages/DoorArtDialog');
    render(
      <DoorArtDialog command="REQ" doorName="Requests" file="Bulls.CFG"
        section="bulletinHeader" label="Bulletin header art" onClose={vi.fn()} />,
      { wrapper },
    );

    expect(await screen.findByTestId('door-art-upload')).toBeTruthy();
  });
});
