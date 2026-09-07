/**
 * One selector on the screens page, and the page becomes that theme's view.
 *
 * "shouldn't we have a select button on the screen files page that lets the
 * user select among his themes and the gallery etc updates with his theme
 * screens?" - and, a minute later, a theme file in the board's view whose
 * detail said "no screen on this board reads this file". Both are one thing:
 * the page must know which theme it is looking through.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const art = new TextEncoder().encode('\x1b[31mHI');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const file = (over: Record<string, unknown>) => ({
  relPath: 'x', bytes: 100, format: 'ansi', sha256: 'h', mci: [], problems: [], readBy: [], ...over,
});

/** The board's own index: BBSTITLE resolved, tango's copy tagged and unread. */
const boardIndex = {
  builtAt: '2026-09-07T00:00:00.000Z', unused: [], conferences: [], bulletins: [], callersByLevel: {},
  screens: [{ screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, resolutions: [{ scope: 'node', id: 1, file: 'Node1/BBSTITLE.txt' }] }],
  files: {
    'Node1/BBSTITLE.txt': file({ relPath: 'Node1/BBSTITLE.txt', sha256: 'board', readBy: [{ screen: 'BBSTITLE', scope: 'node', id: 1, via: 'resolved' }] }),
    'Themes/tango/Node/BBSTITLE.txt': file({ relPath: 'Themes/tango/Node/BBSTITLE.txt', sha256: 'tango', theme: 'tango' }),
  },
};
/** The same board through tango: the theme's copy resolves, the board's does not. */
const tangoIndex = {
  ...boardIndex,
  screens: [{ screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, resolutions: [{ scope: 'node', id: 1, file: 'Themes/tango/Node/BBSTITLE.txt' }] }],
  files: {
    'Node1/BBSTITLE.txt': file({ relPath: 'Node1/BBSTITLE.txt', sha256: 'board' }),
    'Themes/tango/Node/BBSTITLE.txt': file({ relPath: 'Themes/tango/Node/BBSTITLE.txt', sha256: 'tango', theme: 'tango', readBy: [{ screen: 'BBSTITLE', scope: 'node', id: 1, via: 'resolved' }] }),
  },
  unused: [{ relPath: 'Node1/BBSTITLE.txt', bytes: 100, format: 'ansi', sha256: 'board', mci: [], problems: [], readBy: [] }],
};

const requested: string[] = [];
const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  requested.push(url);
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) return envelope({ content: base64(art), format: 'ansi', bytes: art.length, mci: [] });
  if (url.includes('/api/themes')) {
    return envelope({ defaultSlug: 'default', canCreate: true, themes: [
      { slug: 'default', title: 'The board', status: 'live' },
      { slug: 'tango', title: 'Tango', status: 'live' },
    ] });
  }
  if (url.includes('/api/mci')) return envelope({ codes: [] });
  if (url.includes('/api/screens/preview')) {
    return envelope({ screen: 'BBSTITLE', theme: 'default', filePath: 'Node1/BBSTITLE.txt', isPetscii: false,
      isRip: false, secLevel: 255, content: base64(art), commands: [], searched: [] });
  }
  if (/\/api\/screens\?theme=tango/.test(url)) return envelope(tangoIndex);
  return envelope(boardIndex);
}));

// xterm wants window.matchMedia, which jsdom has not got; the other screen
// page tests keep it out the same way. What this suite proves is the wiring
// around the preview, not the terminal inside it.
vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

import { ScreenFilesPage } from '../pages/ScreenFilesPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>;
}

describe('the screens page, looked at through a theme', () => {
  beforeEach(() => { requested.length = 0; });

  it("offers the board's themes in one selector, the board itself first", async () => {
    render(<ScreenFilesPage />, { wrapper });
    const select = await screen.findByLabelText('Viewing');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Tango' })).toBeTruthy());

    expect((select as HTMLSelectElement).value).toBe('default');
  });

  it("asks the server for the theme's index when a theme is selected", async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });
    const select = await screen.findByLabelText('Viewing');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Tango' })).toBeTruthy());

    await user.selectOptions(select, 'tango');

    await waitFor(() => expect(requested.some(u => /\/api\/screens\?theme=tango$/.test(u))).toBe(true));
  });

  it("keeps a theme's art out of the board's gallery, and a theme's view keeps the board's replaced art out", async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });
    // Board view: BBSTITLE once (the board's), tango's copy is not the board's art.
    expect(await screen.findByRole('tab', { name: 'Gallery 1' })).toBeTruthy();

    const select = await screen.findByLabelText('Viewing');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Tango' })).toBeTruthy());
    await user.selectOptions(select, 'tango');

    // Tango view: still one card - tango's copy, the board's now reads as replaced.
    expect(await screen.findByRole('tab', { name: 'Gallery 1' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Gallery 2' })).toBeNull();
  });

  it('has the preview beside the selector, for the theme that is selected', async () => {
    const user = userEvent.setup();
    render(<ScreenFilesPage />, { wrapper });

    await user.click(await screen.findByRole('tab', { name: /Preview as a caller/ }));

    expect(await screen.findByTestId('screen-preview-panel')).toBeTruthy();
    expect(screen.getByText(/wearing the board itself/)).toBeTruthy();
  });
});
