/**
 * The board's audit is a destination, not six tabs in the artist's way.
 *
 * S7 of the screens rework. `/admin/screens` opened on ELEVEN tabs, six of
 * which are a sysop auditing 1,155 files: what nothing reads, what is only
 * codes, what the manager does not read as art, every MCI code, and the
 * screens whose copies have drifted. An artist looking for a picture had to
 * walk past all of it - "only sysops should see files with no art in them
 * etc".
 *
 * What is asserted: the destination exists and is the sysop's, the reports
 * are on it, the Screens page no longer carries them, and a row there still
 * opens the one dialog every screen is opened through.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { NAV_ITEMS } from '../src/components/AppShell/nav-config';

const ansi = new TextEncoder().encode('\x1b[31mHI');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const index = () => ({
  builtAt: '2026-09-17T00:00:00.000Z',
  unused: [{ relPath: 'Screens/leftover.txt', bytes: 4, format: 'text', sha256: 'l', mci: [] }],
  screens: [{
    screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, duplicateGroups: [],
    resolutions: [{
      scope: 'node', id: 1, dir: 'Node1', dirIsShared: false,
      file: 'Node1/BBSTITLE.txt', variants: ['BBSTITLE.txt'],
    }],
  }],
  files: {
    'Node1/BBSTITLE.txt': {
      relPath: 'Node1/BBSTITLE.txt', bytes: ansi.length, format: 'ansi', sha256: 'a', mci: [],
    },
    'Screens/leftover.txt': {
      relPath: 'Screens/leftover.txt', bytes: 4, format: 'text', sha256: 'l', mci: [],
    },
  },
});

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

const fetchMock = vi.fn((input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/api/mci')) return envelope({ families: [], codes: [], enablingTilde: { uses: 0, files: 0 } });
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  if (url.includes('/api/screens/file')) {
    return envelope({ ...index().files['Screens/leftover.txt'], content: base64(ansi) });
  }
  if (url.includes('/api/themes')) return envelope({ themes: [], defaultSlug: 'default', canCreate: true });
  return envelope(index());
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));
vi.mock('../src/components/ScreenPreview', () => ({ ScreenPreview: () => null }));

import { ScreenHealthPage } from '../src/pages/ScreenHealthPage';
import { ScreenScopeTables } from '../src/pages/ScreenScopeTables';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('screen health as a destination of its own', () => {
  it('has a sysop sidebar entry and a route', () => {
    const item = NAV_ITEMS.find(entry => entry.path === 'screen-health');
    expect(item, 'no sidebar entry for screen-health').toBeTruthy();
    // 255: it is the board's audit and its board-wide writes. The Screens
    // page stays at 100, which is the whole point of splitting them.
    expect(item!.minLevel).toBe(255);

    const app = readFileSync(resolve(__dirname, '..', 'src', 'App.tsx'), 'utf8');
    const paths = new Set(
      [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map(match => match[1]),
    );
    expect(paths.has('screen-health'), 'no <Route path="screen-health">').toBe(true);
  });

  it('carries the reports', async () => {
    render(<ScreenHealthPage />, { wrapper });

    // Wait on a COUNT: the strip renders before the index arrives.
    expect(await screen.findByRole('tab', { name: /Read by nothing 1/ })).toBeTruthy();
    for (const name of [/Commands and text/, /Not art/, /Codes/, /Duplicates/]) {
      expect(screen.getByRole('tab', { name })).toBeTruthy();
    }
  });

  it('carries the writes that touch every screen', async () => {
    render(<ScreenHealthPage />, { wrapper });

    expect(await screen.findByRole('button', { name: /Export every screen/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Import an archive/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Repair every damaged screen/i })).toBeTruthy();
  });

  it('opens the same dialog every screen is opened through', async () => {
    const user = userEvent.setup();
    render(<ScreenHealthPage />, { wrapper });

    await user.click(await screen.findByRole('tab', { name: /Read by nothing/ }));
    await user.click(await screen.findByText('Screens/leftover.txt'));

    // The one dialog, with the file's own path as its title - not a second
    // inspector built for this page.
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.textContent).toContain('Screens/leftover.txt'));
  });

  it('leaves the resolution tables to resolution', async () => {
    render(<ScreenScopeTables />, { wrapper });

    // S9 took the gallery and the preview off this page for good: Screen
    // Designer is the gallery, and a theme is previewed from its status bar.
    expect(await screen.findByRole('tab', { name: /Node screens/ })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Gallery/ })).toBeNull();
    for (const name of [/Read by nothing/, /Commands and text/, /Not art/, /^Codes/, /Duplicates/]) {
      expect(screen.queryByRole('tab', { name })).toBeNull();
    }
    // The board-wide writes went with them.
    expect(screen.queryByRole('button', { name: /Repair every damaged screen/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Export every screen/i })).toBeNull();
  });

  it('does not carry a preview of its own', async () => {
    // It previews a THEME, and the selector that picks one is Screen
    // Designer's. Screen Health reports on the board's own files and has no
    // theme to choose, so a preview here would answer for one theme only.
    render(<ScreenScopeTables />, { wrapper });
    await screen.findByRole('tab', { name: /Node screens/ });

    expect(screen.queryByRole('tab', { name: /Preview as a caller/ })).toBeNull();
  });
});
