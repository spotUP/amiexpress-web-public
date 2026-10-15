/**
 * Pressing Revisions must not blank the page.
 *
 * "i clicked revisions in the screen admin page now for a screen and the page
 * got black." Every route here answers with the API envelope
 * `{ success, data, message }`, and the three revision calls were TYPED as the
 * payload itself - so the panel read `data.revisions` off the envelope, got
 * undefined, handed it to setRevisions, and the next render threw on
 * `revisions.length`. React unmounts the tree on a render throw, which is the
 * black page.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const calls: string[] = [];
const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, message: undefined, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

let revisions: unknown[] = [];
vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  calls.push(url);
  if (url.includes('/screens/revisions')) return envelope({ revisions });
  return envelope({});
}));

/*
 * A restore invalidates what the open editor is drawing from, so the panel
 * takes a query client - and asks in the board's own dialog rather than
 * `window.confirm`.
 */
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true),
  }),
}));

import { ScreenRevisionsPanel } from '../pages/ScreenRevisionsPanel';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}


describe('the revisions panel', () => {
  beforeEach(() => { calls.length = 0; });

  it('renders the revisions the envelope carries', async () => {
    revisions = [
      { ts: '2026-09-07T10:00:00.000Z', file: '1757240000-abc.txt', bytes: 1234, sha256: 'aaa', source: 'editor' },
      { ts: '2026-09-06T10:00:00.000Z', file: '1757150000-def.txt', bytes: 999, sha256: 'bbb', source: 'upload' },
    ];

    render(<ScreenRevisionsPanel path="Node1/BBSTITLE.txt" onClose={() => {}} />, { wrapper });

    expect(await screen.findByText(/Revisions \(2\)/)).toBeTruthy();
    await waitFor(() => expect(calls.some(u => u.includes('/screens/revisions'))).toBe(true));
  });

  it('a screen with no revisions renders empty, not a crash', async () => {
    revisions = [];

    render(<ScreenRevisionsPanel path="Node1/BBSTITLE.txt" onClose={() => {}} />, { wrapper });

    expect(await screen.findByText(/Revisions \(0\)/)).toBeTruthy();
  });

  it('an answer without the expected shape leaves the panel standing', async () => {
    // The shape that caused the blank page: nothing where `revisions` was
    // expected. The panel must show zero, not throw out of render.
    revisions = undefined as never;

    render(<ScreenRevisionsPanel path="Node1/BBSTITLE.txt" onClose={() => {}} />, { wrapper });

    expect(await screen.findByText(/Revisions \(0\)/)).toBeTruthy();
  });
});
