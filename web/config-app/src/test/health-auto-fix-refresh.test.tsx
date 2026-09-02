/**
 * After Auto-Fix, the page has to show what the board looks like NOW.
 *
 * Reported 2026-09-02, twice: "the health page didnt update with the new
 * status when it fixed the issues", with the four escape-byte warnings still
 * listed underneath.
 *
 * The server re-runs the whole check after fixing and returns the result. The
 * page discarded it and refetched, so the old counts and the old issue list
 * stayed on screen until a second full pass over 872 screens came back - long
 * enough for a sysop to read the unchanged list and conclude the button does
 * nothing.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const damaged = {
  timestamp: '2026-09-02T00:00:00.000Z',
  overallStatus: 'warnings',
  totalIssues: 1,
  autoFixableIssues: 1,
  bbsRoot: '/app/data/bbs',
  categories: [{
    category: 'Screen Contents',
    passed: false,
    checkedCount: 872,
    errorCount: 0,
    warningCount: 1,
    issues: [{
      severity: 'warning',
      category: 'Screens',
      description: 'Screens/LOGON24.TXT: colour codes have no escape byte - callers see the codes as text',
      path: '/app/data/bbs/Screens/LOGON24.TXT',
      autoFixable: true,
      fix: { kind: 'screen-escape-byte' },
      fixAction: 'Put the escape byte back (a backup is written first)',
    }],
  }],
};

const repaired = {
  ...damaged,
  overallStatus: 'healthy',
  totalIssues: 0,
  autoFixableIssues: 0,
  categories: [{
    ...damaged.categories[0], passed: true, warningCount: 0, issues: [],
  }],
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

/**
 * The GET keeps answering with the DAMAGED board on purpose: if the page only
 * looks right because a refetch happened to return fresh data, that is the
 * behaviour that was already broken. It has to use what the fix returned.
 */
vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).includes('/health/auto-fix') || init?.method === 'POST') {
    return envelope({ fixed: 1, failed: 0, failures: [], report: repaired });
  }
  return envelope(damaged);
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { HealthCheckPage } from '../pages/HealthCheckPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('the health page after Auto-Fix', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the board as it is now, not as it was before the fix', async () => {
    const user = userEvent.setup();
    render(<HealthCheckPage />, { wrapper });

    // Categories start collapsed; the issue list is what a sysop opens to read.
    await user.click(await screen.findByText('Screen Contents'));
    expect(await screen.findByText(/no escape byte/)).toBeTruthy();

    await user.click(await screen.findByRole('button', { name: /Auto-Fix/ }));

    // The warning it just repaired is gone from the list.
    await vi.waitFor(() => {
      expect(screen.queryByText(/no escape byte/)).toBeNull();
    });
  });
});
