/**
 * The Main Menu and Bulletins page's logo, C64 menu and bulletin-title parts: reachable through
 * the real page and writing what the sysop edits. What each edit does to the
 * config is tested in menu-logo-edit.test.ts; this is the one wiring test.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { defaultMenuConfig } from '@bbs/screens/menu-config/menu-config';

const ROWS = [
  { key: 'R', label: 'Read Mail', description: 'Read your mail', section: 'messages', source: 'internal' },
  { key: 'G', label: 'Goodbye', description: 'Leave the board', section: 'system', source: 'internal' },
];
const BULLETINS = [{ key: '1', label: 'Top Uploaders', description: 'Who gave most', section: 'bulletins', source: 'bulletin' }];

const getMenuConfig = vi.fn(async (kind: string) => ({ config: defaultMenuConfig(kind as 'MAIN'), problems: [] as string[] }));
const saveMenuConfig = vi.fn(async (_kind: string, config: unknown) => ({ config, problems: [] as string[] }));
const previewMenu = vi.fn(async () => ({ sections: [], style: 'coverflow', wipes: { open: 'X', leave: '', page: 'H' }, logos: [] }));
const menuEntries = vi.fn(async (kind: string) => (kind === 'BULLETINS' ? BULLETINS : ROWS));
const confirm = vi.fn(async () => true);

vi.mock('../api/client', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  apiClient: {
    getMenuConfig: (k: string) => getMenuConfig(k),
    saveMenuConfig: (k: string, c: unknown) => saveMenuConfig(k, c),
    previewMenu: () => previewMenu(),
    menuEntries: (k: string) => menuEntries(k),
    getScreenFile: vi.fn(),
  },
}));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}));

const { MenusPage } = await import('../pages/MenusPage');

function renderPage(search = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/menus${search}`]}><MenusPage /></MemoryRouter>
    </QueryClientProvider>
  );
}
const lastSaved = () => saveMenuConfig.mock.calls[saveMenuConfig.mock.calls.length - 1][1] as ReturnType<typeof defaultMenuConfig>;
const SAVED = { timeout: 4000 };

describe('the Main Menu and Bulletins logo, C64 and bulletin parts', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('is reachable: builds a C64 menu', async () => {
    const user = userEvent.setup();
    renderPage();
    // the C64 menu
    await user.click(await screen.findByRole('tab', { name: 'C64 menu' }));
    await user.type(await screen.findByLabelText('New C64 level floor'), '0');
    await user.click(screen.getByRole('button', { name: 'Add C64 level' }));
    await user.click(await screen.findByRole('button', { name: 'Add section to level 0' }));
    const title = await screen.findByLabelText('Title of section 1 at level 0');
    await user.clear(title);
    await user.type(title, 'Quick');
    for (const key of ['R', 'G']) {
      await user.selectOptions(screen.getByLabelText('Key to add to section 1 at level 0'), key);
      await user.click(screen.getByRole('button', { name: 'Add key to section 1 at level 0' }));
    }
    await waitFor(() => expect(lastSaved().c64Menus['0'].sections).toEqual([{ title: 'Quick', keys: ['R', 'G'] }]), SAVED);
  });

  it('titles a bulletin from its Bulls.CFG title and writes the sysop title under labels', async () => {
    const user = userEvent.setup();
    renderPage('?tab=bulletins');
    const box = await screen.findByLabelText('Title for 1');
    expect((box as HTMLInputElement).placeholder).toBe('Top Uploaders');
    expect(screen.getByRole('columnheader', { name: /Title/ })).toBeTruthy();
    await user.type(box, 'Best uploaders');
    await waitFor(() => expect(saveMenuConfig).toHaveBeenCalledWith('BULLETINS', expect.objectContaining({ labels: { '1': 'Best uploaders' } })), SAVED);
  });
});
