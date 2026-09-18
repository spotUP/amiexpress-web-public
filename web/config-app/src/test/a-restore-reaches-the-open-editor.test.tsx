/**
 * A restore the editor cannot see is a restore nobody believes.
 *
 * Sysop, 2026-09-18: "restoring from history didnt work" - then, exactly, "the
 * ansi editor didnt update with the restored file". The restore HAD worked:
 * `Conf2/bull20.txt` went back to sha 888fe31a4eb4 nineteen seconds after the
 * upload that replaced it, byte-identical to the revision before it. What did
 * not happen is the invalidation, so the dialog went on drawing the bytes it
 * had cached under `['screen-file', path, theme]` - the art that had just been
 * undone.
 *
 * The pin is on the CACHE, not on a repainted canvas: the editor reloads from
 * whatever that entry holds, so the entry going stale is the whole bug.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const REVISIONS = [
  { ts: '2026-09-16T22:09:56.656Z', file: '2026-09-16T22-09-56-656Z_888fe31a4eb4.bin', bytes: 3530, sha256: '888fe31a4eb4', source: 'editor' },
];

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const restores: string[] = [];

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/screens/restore')) {
    restores.push(url);
    return envelope({ restored: true });
  }
  if (url.includes('/revisions')) return envelope({ revisions: REVISIONS });
  return envelope({});
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true),
  }),
}));
vi.mock('../components/ScreenArt', () => ({ ScreenArt: () => null }));

import { ScreenRevisionsPanel } from '../pages/ScreenRevisionsPanel';

describe('restoring a revision', () => {
  it('drops what the open editor is drawing from', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // What the dialog has already fetched and is showing.
    client.setQueryData(['screen-file', 'Conf2/bull20.txt', 'default'], { content: 'the art that was just uploaded' });

    const user = userEvent.setup();
    const wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    render(<ScreenRevisionsPanel path="Conf2/bull20.txt" onClose={() => {}} />, { wrapper });

    await user.click(await screen.findByRole('button', { name: /restore/i }));

    await waitFor(() => expect(restores.length).toBeGreaterThan(0));
    // Stale, so the dialog refetches and redraws instead of keeping the art.
    await waitFor(() =>
      expect(client.getQueryState(['screen-file', 'Conf2/bull20.txt', 'default'])?.isInvalidated).toBe(true));
  });

  it('asks in the board\'s own dialog, not a browser box', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const native = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    const wrapper = ({ children }: { children: ReactNode }) =>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    render(<ScreenRevisionsPanel path="Conf2/bull20.txt" onClose={() => {}} />, { wrapper });

    await user.click(await screen.findByRole('button', { name: /restore/i }));

    expect(native).not.toHaveBeenCalled();
    native.mockRestore();
  });
});
