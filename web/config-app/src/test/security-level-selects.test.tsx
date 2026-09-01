/**
 * A form that asks for a security level asks for one of THIS board's.
 *
 * Reported by the sysop on 2026-09-02: levels still reading 20 where they
 * should read 30. Two pages carried their own hardcoded lists - "20 - New
 * User" on a board whose new users are level 30, and an operator chat page
 * offering 70 and 150 that nobody holds. Driven through the pages with the
 * real client and a stubbed network, because a builder that passes its unit
 * test and is never wired into a form fixes nothing.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const levels = { levels: [10, 20, 50, 255], inUse: [
  { level: 20, users: 2, servedBy: 20 },
  { level: 30, users: 30, servedBy: 20 },
], permissions: [] };

const envelope = (data: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ success: true, data, timestamp: '' }),
    text: async () => JSON.stringify({ success: true, data }),
  } as unknown as Response);

const fetchMock = vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/config/security/levels')) return envelope(levels);
  if (url.includes('/config/system')) return envelope({ new_user_sec_level: 30, bbs_name: 'Up Rough' });
  // The page renders dropdowns from these too, and a non-array crashes it.
  if (url.includes('/languages') || url.includes('/screen-types')) return envelope([]);
  if (url.includes('/operator-chat')) {
    return envelope({ enabled: true, allowedSecLevels: [30], pageTimeout: 30, maxPagesPerSession: 3 });
  }
  return envelope({});
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(),
    confirm: vi.fn(async () => true),
  }),
}));

import { SystemConfigPage } from '../pages/SystemConfigPage';
import { OperatorChatSettingsPage } from '../pages/OperatorChatSettingsPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('the levels a form offers', () => {
  beforeEach(() => fetchMock.mockClear());

  it('New User Defaults offers the levels this board has, not a typed-in table', async () => {
    render(<SystemConfigPage />, { wrapper });

    // 30 is where this board's users are, and it has no ACS file of its own.
    expect(await screen.findByText('30 - no ACS file, served by ACS.20.info, 30 users')).toBeTruthy();
    expect(screen.getByText('20 - own ACS file, 2 users')).toBeTruthy();
  });

  it('drops the invented role names that disagreed with the board', async () => {
    render(<SystemConfigPage />, { wrapper });

    await screen.findByText('10 - own ACS file');
    expect(screen.queryByText(/New User$/)).toBeNull();
    expect(screen.queryByText(/70 - Elite/)).toBeNull();
  });

  it('operator chat lists the same levels, from the same answer', async () => {
    render(<OperatorChatSettingsPage />, { wrapper });

    expect(await screen.findByText('30 - no ACS file, served by ACS.20.info, 30 users')).toBeTruthy();
    expect(screen.queryByText(/150 - /)).toBeNull();
  });
});
