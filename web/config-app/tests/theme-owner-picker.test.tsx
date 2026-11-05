/**
 * A sysop picks the owner from the board's accounts, never types one.
 *
 * "me the sysop needs to be able to set a user as owner of the theme."
 * Ownership is not a label: the sandbox grants write access by matching the
 * owner against the caller's account name, so a typed name with a typo makes
 * a theme its artist cannot open, and nothing says so until they try.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const calls: { method: string; url: string; body?: unknown }[] = [];
const envelope = (data: unknown, message?: string) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, message, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  if (url.includes('/config/users')) {
    return envelope({ users: [{ username: 'skope' }, { username: 'Tango' }, { username: 'sysop' }] });
  }
  if (url.includes('/api/themes') && (init?.method ?? 'GET') === 'POST') {
    return envelope({ slug: 'neon', seeded: { copied: 32, screens: 12, conflicts: [] } },
      'Theme "neon" created with 32 screen file(s) copied from the board');
  }
  if (url.includes('/api/themes')) {
    return envelope({ defaultSlug: 'default', canCreate: true, themes: [] });
  }
  return envelope({});
}));

let secLevel = 255;
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'sysop' }, secLevel }),
}));
const showSuccess = vi.fn();
vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess, showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));
vi.mock('../src/components/ScreenPreviewPanel', () => ({ ScreenPreviewPanel: () => null }));

import { ScreenThemesPage } from '../src/pages/ScreenThemesPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('naming the owner of a new theme', () => {
  beforeEach(() => { calls.length = 0; secLevel = 255; showSuccess.mockClear(); });

  it('offers the board\'s accounts, with sysops-only as the default', async () => {
    const user = userEvent.setup();
    render(<ScreenThemesPage />, { wrapper });
    await user.click(await screen.findByRole('button', { name: /New theme/i }));

    const owner = await screen.findByLabelText('Owned by');
    expect((owner as HTMLSelectElement).tagName).toBe('SELECT');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Tango' })).toBeTruthy());
    expect(screen.getByRole('option', { name: 'skope' })).toBeTruthy();
    // Empty is still legal and says what it means.
    expect(screen.getByRole('option', { name: 'Sysops only' })).toBeTruthy();
    expect((owner as HTMLSelectElement).value).toBe('');
  });

  it('sends the chosen account as the owner', async () => {
    const user = userEvent.setup();
    render(<ScreenThemesPage />, { wrapper });
    await user.click(await screen.findByRole('button', { name: /New theme/i }));

    await user.type(await screen.findByLabelText(/Slug/i), 'neon');
    await user.type(screen.getByLabelText(/Title/i), 'Neon');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Tango' })).toBeTruthy());
    await user.selectOptions(screen.getByLabelText('Owned by'), 'Tango');
    await user.click(screen.getByRole('button', { name: /^Create/i }));

    await waitFor(() => expect(calls.some(c => c.method === 'POST' && c.url.includes('/api/themes'))).toBe(true));
    const post = calls.find(c => c.method === 'POST' && c.url.includes('/api/themes'))!;
    expect((post.body as { owner: string }).owner).toBe('Tango');
  });

  it('an artist is not asked - the theme is theirs', async () => {
    secLevel = 100;
    const user = userEvent.setup();
    render(<ScreenThemesPage />, { wrapper });
    await user.click(await screen.findByRole('button', { name: /New theme/i }));

    expect(screen.queryByLabelText('Owned by')).toBeNull();
    expect(await screen.findByText(/This theme will be yours/)).toBeTruthy();
  });
});
