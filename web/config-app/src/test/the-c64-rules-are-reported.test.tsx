/**
 * The screens that break the two C64 rules are a report, not a repair.
 *
 * "only lowercase characters are allowed and only black background ... this
 * should apply bbs wide" (sysop, 2026-09-14). A save that breaks either is
 * refused by the board (`screens/petscii-board-rules.ts`); the files that were
 * here before the rules were go on reaching callers exactly as drawn, and this
 * is where a sysop finds them.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const index = () => ({
  builtAt: '2026-09-18T00:00:00.000Z',
  unused: [],
  screens: [],
  files: {
    'Node1/BBSTITLE.seq': {
      relPath: 'Node1/BBSTITLE.seq', bytes: 1834, format: 'petscii', sha256: 'g', mci: [],
      problems: ['petscii-graphics-bank'],
    },
    'Node1/LOGON.seq': {
      relPath: 'Node1/LOGON.seq', bytes: 400, format: 'petscii', sha256: 'k', mci: [], problems: [],
    },
  },
});

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/api/mci')) return envelope({ families: [], codes: [], enablingTilde: { uses: 0, files: 0 } });
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/themes')) return envelope({ themes: [], defaultSlug: 'default', canCreate: true });
  return envelope(index());
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));
vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));

import { ScreenHealthPage } from '../pages/ScreenHealthPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('the C64 rules on Screen Health', () => {
  it('counts the screens that break a rule, and names the one that does', async () => {
    render(<ScreenHealthPage />, { wrapper });

    // The count comes from the index, so waiting on it waits for the load.
    const tab = await screen.findByRole('tab', { name: /C64 rules 1/ });
    await userEvent.setup().click(tab);

    expect(await screen.findByText('Node1/BBSTITLE.seq')).toBeTruthy();
    // The row says WHICH rule, in the sysop's terms - not the problem's key.
    expect(screen.getByText(/Drawn in the graphics bank/)).toBeTruthy();
    // The screen that follows the rules is not in the report.
    expect(screen.queryByText('Node1/LOGON.seq')).toBeNull();
  });
});
