/**
 * The screen themes page, where SP6's two surfaces meet a sysop.
 *
 * Two behaviours, both of which used to be missing entirely:
 *
 * - Publish asks the server whether the theme CAN go live, and shows the
 *   reasons instead of offering a confirmation the server would then refuse.
 * - Preview draws the bytes the board's own loader returned, so a sysop can
 *   see a themed screen before a caller does.
 *
 * Rendered, not unit-tested: a validator the page never calls, and a preview
 * route no button reaches, are exactly the shape of "unit-perfect and never
 * invoked".
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const themes = {
  defaultSlug: 'default',
  canCreate: true,
  themes: [
    {
      slug: 'neon', title: 'Neon', author: 'Skope', owner: 'skope', dir: 'Themes/neon',
      widths: [80], doorTheme: '', status: 'draft', screens: 3, exists: true,
      mine: false, wearable: true, writable: true,
    },
  ],
};

const validation = {
  slug: 'neon',
  publishable: false,
  coverage: { provided: 3, total: 44 },
  blocking: [{
    rule: 'unresolved-reference',
    severity: 'blocking',
    file: 'Board/BULL.TXT',
    message: 'Board/BULL.TXT runs ~CC_nosuchdoor, and this board has no such command',
  }],
  advisory: [{
    rule: 'coverage',
    severity: 'advisory',
    message: "3 of the board's 44 screens; 41 fall through to the board's own art.",
  }],
};

const preview = {
  screen: 'BULL',
  theme: 'neon',
  filePath: 'Themes/neon/Board/BULL.TXT',
  isPetscii: false,
  isRip: false,
  secLevel: 255,
  content: btoa('the neon bulletin'),
  commands: [],
  searched: [],
};

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const asked: string[] = [];

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  asked.push(url);
  if (url.includes('/validation')) return envelope(validation);
  if (url.includes('/screens/preview')) return envelope(preview);
  if (url.includes('/api/screens')) return envelope({ screens: [{ screen: 'BULL' }], files: {}, unused: [], conferences: [], bulletins: [] });
  return envelope(themes);
}));

const showError = vi.fn();
const confirm = vi.fn(async () => true);
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError, confirm }),
}));

// xterm needs a real canvas; the preview only has to prove it was ASKED for
// and handed the bytes, not that a terminal painted them.
vi.mock('../components/ScreenPreview', () => ({
  ScreenPreview: ({ content, cols }: { content: string; cols?: number }) => (
    <div data-testid="screen-preview" data-cols={cols}>{content}</div>
  ),
}));

import { ScreenThemesPage } from '../pages/ScreenThemesPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('publishing a theme', () => {
  beforeEach(() => { asked.length = 0; vi.clearAllMocks(); });

  it('refuses, and names the reason, when the server says the theme is not publishable', async () => {
    render(<ScreenThemesPage />, { wrapper });
    await screen.findByText('Neon');

    await userEvent.click(screen.getByTitle('Publish'));

    await waitFor(() => expect(screen.getByTestId('theme-validation')).toBeTruthy());
    expect(screen.getByText(/no such command/)).toBeTruthy();
    // Never offered: the sysop is not asked to confirm something that would fail.
    expect(confirm).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalled();
  });

  it('shows the whole report on its own, without publishing anything', async () => {
    render(<ScreenThemesPage />, { wrapper });
    await screen.findByText('Neon');

    await userEvent.click(screen.getByTitle('Check this theme'));

    await waitFor(() => expect(screen.getByTestId('theme-validation')).toBeTruthy());
    expect(screen.getByText(/41 fall through/)).toBeTruthy();
  });
});

describe('previewing a theme', () => {
  beforeEach(() => { asked.length = 0; vi.clearAllMocks(); });

  it('asks the board what a caller would be served and draws those bytes', async () => {
    render(<ScreenThemesPage />, { wrapper });
    await screen.findByText('Neon');

    await userEvent.click(screen.getByTitle('Preview as a caller'));

    await waitFor(() => expect(screen.getByTestId('screen-preview')).toBeTruthy());
    expect(screen.getByTestId('screen-preview').textContent).toBe('the neon bulletin');
    expect(asked.some(url => url.includes('/screens/preview') && url.includes('theme=neon'))).toBe(true);
    expect(screen.getByText('Themes/neon/Board/BULL.TXT')).toBeTruthy();
  });

  it('previews a C64 caller on a 40-column surface', async () => {
    render(<ScreenThemesPage />, { wrapper });
    await screen.findByText('Neon');

    await userEvent.click(screen.getByTitle('Preview as a caller'));
    await waitFor(() => expect(screen.getByTestId('screen-preview')).toBeTruthy());

    await userEvent.selectOptions(screen.getByLabelText('Terminal'), 'c64');

    await waitFor(() =>
      expect(screen.getByTestId('screen-preview').getAttribute('data-cols')).toBe('40'));
  });
});
