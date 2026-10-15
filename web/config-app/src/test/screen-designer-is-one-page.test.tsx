/**
 * ONE PAGE, ONE SELECTOR, NO TABS.
 *
 * S9. Sysop, 2026-09-17: "i'm pondering if we could merge the 'screen files'
 * tab into an option in the select button in the ansi studio tab so we dont
 * need tabs, just an ansi studio item in the sidebar".
 *
 * Most of that was already true and nobody had noticed: the studio's selector
 * has carried "The board's own screens" for a sysop since ownership was
 * added. What made it read as two places was the tab strip around it and a
 * `secLevel < 255` fork that sent an artist somewhere else entirely - so a
 * sysop and an artist were looking at two different pages over the same data,
 * and every fix had to land twice.
 *
 * What this pins:
 *
 *   - `/admin/screens` is ONE page. No tab strip, for anybody.
 *   - The board is an option in the selector, beside the themes.
 *   - `?theme=<slug>` opens on that theme, which is what the Themes page's
 *     "Open the art" link has pointed at since S6 - it did nothing at all
 *     until now.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const ansi = new TextEncoder().encode('\x1b[31mHI');
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const THEMES = {
  defaultSlug: 'default',
  canCreate: true,
  themes: [
    {
      slug: 'default', title: "The board's own screens", dir: '', author: '', owner: '',
      status: 'live', widths: [80], mine: false, writable: true, exists: true, wearable: true,
    },
    {
      slug: 'tango', title: 'Tango', dir: 'Themes/tango', author: 'tango', owner: 'tango',
      status: 'draft', widths: [80], mine: false, writable: true, exists: true, wearable: true,
    },
  ],
};

const index = () => ({
  builtAt: '2026-09-17T00:00:00.000Z',
  unused: [],
  screens: [{
    screen: 'BBSTITLE', dirType: 'node', missingScopes: 0, duplicateGroups: [],
    resolutions: [{
      scope: 'node', id: 1, dir: 'Node1', dirIsShared: false,
      file: 'Node1/BBSTITLE.txt', variants: ['BBSTITLE.txt'],
    }],
  }],
  files: {
    'Node1/BBSTITLE.txt': {
      relPath: 'Node1/BBSTITLE.txt', bytes: ansi.length, format: 'ansi', sha256: 'a',
      mci: [], readBy: [{ screen: 'BBSTITLE', scope: 'node', id: 1, via: 'resolved' }],
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
  if (url.includes('/config/users')) return envelope({ users: [] });
  if (url.includes('/api/themes')) return envelope(THEMES);
  if (url.includes('/api/screens/file')) {
    return envelope({ ...index().files['Node1/BBSTITLE.txt'], content: base64(ansi) });
  }
  if (url.includes('/screens/shared-directories')) return envelope({ directories: [] });
  return envelope(index());
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'sysop' }, secLevel: 255 }),
}));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));
vi.mock('../components/ScreenPreview', () => ({ ScreenPreview: () => null }));
vi.mock('../components/ScreenThumbnail', () => ({ ScreenThumbnail: () => null }));

import { ScreensWorkspace } from '../pages/workspaces';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

/** The same page, opened at a URL. */
function openAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}><ScreensWorkspace /></QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('Screen Designer is one page', () => {
  it('has no tab strip', async () => {
    render(<ScreensWorkspace />, { wrapper });

    await waitFor(() => expect(screen.getByLabelText(/Viewing|theme/i)).toBeTruthy());
    // Not one tab, for anybody: the strip WAS the second place.
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('offers the board beside the themes, in one selector', async () => {
    render(<ScreensWorkspace />, { wrapper });

    const picker = await screen.findByLabelText(/Viewing|theme/i) as HTMLSelectElement;
    const offered = [...picker.options].map(option => option.value);
    expect(offered).toContain('default');
    expect(offered).toContain('tango');
  });

  it('opens on the theme a link names', async () => {
    // What "Open the art" on the Themes page has pointed at since S6.
    openAt('/admin/screens?theme=tango');

    const picker = await screen.findByLabelText(/Viewing|theme/i) as HTMLSelectElement;
    await waitFor(() => expect(picker.value).toBe('tango'));
  });
});
