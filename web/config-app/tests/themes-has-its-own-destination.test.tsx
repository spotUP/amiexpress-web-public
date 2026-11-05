/**
 * Themes is a destination, not a tab inside Screens.
 *
 * S6 of the screens rework. A theme is a SET of screens with an owner, a
 * status and a board default - the things a sysop administers - while
 * `/admin/screens` is where art is looked at and drawn. Nesting one inside the
 * other is why "Artist studio", "Screen themes" and "Screen files" all lived
 * under one `?tab=` and why no theme could be linked to.
 *
 * Three things are asserted here, and each was broken before this test:
 *
 *   - `themes` is its own route, its own sidebar entry and its own permission
 *     key. The generic `nav-routes` and roles tests then hold it to the same
 *     rules as every other destination.
 *   - Ownership is chosen from the accounts the board HAS. It was a
 *     `window.prompt`, and ownership is not a label: the sandbox grants write
 *     access by matching the name against an account, so one typo made a theme
 *     its artist could not open, with nothing on screen saying so.
 *   - A theme row leads to its art, `/admin/screens?theme=<slug>`. Without it
 *     the sysop's route from "this theme is thin" to the screens themselves was
 *     to change page and re-pick the theme by hand.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { NAV_ITEMS } from '../src/components/AppShell/nav-config';
import { WORKSPACE_TABS } from '../src/pages/workspaces';

const THEMES = [
  {
    slug: 'default', title: "The board's own", dir: '', author: '', owner: '',
    status: 'live', widths: [80], mine: false, writable: true, screens: 12,
  },
  {
    slug: 'tango', title: 'Tango', dir: 'Themes/tango', author: 'tango', owner: 'tango',
    status: 'draft', widths: [80], mine: false, writable: true, screens: 3,
  },
];

const envelope = (data: unknown) => Promise.resolve({
  ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data, timestamp: '' }),
  text: async () => JSON.stringify({ success: true, data }),
} as unknown as Response);

/** Every PUT/PATCH the page made, so the owner write can be read back. */
const writes: { url: string; method: string; body: unknown }[] = [];

const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? 'GET';
  if (method !== 'GET') {
    writes.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    return envelope({ ok: true });
  }
  if (url.includes('/config/users')) {
    return envelope({ users: [{ username: 'tango' }, { username: '607080' }, { username: 'h7' }] });
  }
  if (url.includes('/api/themes')) {
    return envelope({ themes: THEMES, defaultSlug: 'default', canCreate: true });
  }
  if (url.includes('/api/screens')) return envelope({ screens: [], files: {}, unused: [], builtAt: '' });
  return envelope({});
});
vi.stubGlobal('fetch', fetchMock);

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'spot' }, secLevel: 255 }),
}));
vi.mock('../src/components/ScreenPreviewPanel', () => ({ ScreenPreviewPanel: () => null }));

import { ScreenThemesPage } from '../src/pages/ScreenThemesPage';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('themes as a destination of its own', () => {
  it('has a sidebar entry and a route', () => {
    const item = NAV_ITEMS.find(entry => entry.path === 'themes');
    expect(item, 'no sidebar entry for themes').toBeTruthy();
    expect(item!.label).toBe('Themes');

    // Read as text, the way nav-routes.test.ts does: what is asserted is the
    // route table itself, not a rendered router.
    const app = readFileSync(resolve(__dirname, '..', 'src', 'App.tsx'), 'utf8');
    const paths = new Set(
      [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map(match => match[1]),
    );
    expect(paths.has('themes'), 'no <Route path="themes">').toBe(true);
  });

  it('is no longer a tab inside Screen Designer', () => {
    // S9 left that page with no tabs at all, so there is no strip to be in.
    expect(WORKSPACE_TABS.screens).toBeUndefined();
  });
});

describe('handing a theme to an artist', () => {
  beforeEach(() => { writes.length = 0; fetchMock.mockClear(); });

  it('asks with a form, not a browser prompt', async () => {
    const prompt = vi.spyOn(window, 'prompt');
    const user = userEvent.setup();
    render(<ScreenThemesPage />, { wrapper });

    await user.click(await screen.findByTitle('Choose who owns this theme'));

    const dialog = await screen.findByRole('dialog');
    expect(prompt).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('combobox', { name: /owned by/i })).toBeTruthy();
    prompt.mockRestore();
  });

  it('offers the accounts the board has, so the name cannot be a typo', async () => {
    const user = userEvent.setup();
    render(<ScreenThemesPage />, { wrapper });

    await user.click(await screen.findByTitle('Choose who owns this theme'));
    const dialog = await screen.findByRole('dialog');
    const picker = within(dialog).getByRole('combobox', { name: /owned by/i }) as HTMLSelectElement;

    const offered = [...picker.options].map(option => option.value);
    expect(offered).toContain('607080');
    // Nobody is a real answer: it is how a theme is taken back off an artist.
    expect(offered).toContain('');
  });

  it('writes the account that was chosen', async () => {
    const user = userEvent.setup();
    render(<ScreenThemesPage />, { wrapper });

    await user.click(await screen.findByTitle('Choose who owns this theme'));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /owned by/i }), '607080');
    await user.click(within(dialog).getByRole('button', { name: /hand it over/i }));

    await waitFor(() => expect(writes.length).toBeGreaterThan(0));
    const last = writes[writes.length - 1];
    expect(last.url).toContain('tango');
    expect((last.body as { owner: string }).owner).toBe('607080');
  });
});

describe('reaching the art from a theme', () => {
  it('links a theme to its screens', async () => {
    render(<ScreenThemesPage />, { wrapper });

    // Every theme row carries one; this is the one belonging to Tango.
    const links = await screen.findAllByRole('link', { name: /open the art/i });
    const hrefs = links.map(link => link.getAttribute('href'));
    expect(hrefs).toContain('/admin/screens?theme=tango');
    expect(hrefs).toContain('/admin/screens?theme=default');
  });

  it('does not carry a preview of its own', async () => {
    // "Preview as a caller" belongs to Screen health and to the artist's own
    // status bar. Three mounts of one panel was one of the duplications this
    // rework exists to remove.
    render(<ScreenThemesPage />, { wrapper });
    await screen.findByText('Tango');

    expect(screen.queryByTitle('Preview as a caller')).toBeNull();
  });
});
