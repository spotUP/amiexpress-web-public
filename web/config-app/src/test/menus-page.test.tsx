/**
 * The Main Menu and Bulletins admin page: reachable, and writing what the sysop edits.
 * The reachability test drives the real route table through the sidebar entry;
 * what each edit does to the config is tested in menu-edit.test.ts.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactNode } from 'react';
import { defaultMenuConfig } from '@bbs/screens/menu-config/menu-config';

const ROWS = [
  { key: 'R', label: 'Read Mail', description: 'Read your mail', section: 'messages', source: 'internal' },
  { key: 'T', label: 'Time', description: 'Show the time', section: 'system', source: 'internal' },
  { key: 'FROGGER', label: 'Frogger', description: 'Cross the road', section: 'doors', source: 'door' },
];

const getMenuConfig = vi.fn(async (kind: string) => ({ config: defaultMenuConfig(kind as 'MAIN'), problems: [] as string[] }));
const saveMenuConfig = vi.fn(async (_kind: string, config: unknown) => ({ config, problems: ['placement X: cleaned'] }));
const previewMenu = vi.fn(async (_kind: string, _q: unknown) => ({
  sections: [{ id: 'messages', title: 'Messages', entries: [{ key: 'R', label: 'Read Mail', description: 'Read your mail' }] }],
  overflow: 'scroll', wipes: { open: 'X', leave: '', page: 'H' }, logos: [],
}));
const menuEntries = vi.fn(async (_kind: string) => ROWS);

vi.mock('../api/client', () => ({
  apiClient: {
    getMenuConfig: (k: string) => getMenuConfig(k),
    saveMenuConfig: (k: string, c: unknown) => saveMenuConfig(k, c),
    previewMenu: (k: string, q: unknown) => previewMenu(k, q),
    menuEntries: (k: string) => menuEntries(k),
  },
}));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => false) }),
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

describe('the Main Menu and Bulletins page', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('is reachable: a sidebar entry and a route lead to it, and it loads the menu through the API', async () => {
    const app = readFileSync(resolve(__dirname, '..', 'App.tsx'), 'utf8');
    expect(app).toMatch(/<Route path="menus" element=\{<LevelRoute><MenusPage \/><\/LevelRoute>\} \/>/);
    const { NAV_ITEMS } = await import('../components/AppShell/nav-config');
    expect(NAV_ITEMS.find(i => i.path === 'menus')?.label).toBe('Main Menu and Bulletins');
    renderPage();
    await screen.findByRole('tab', { name: 'Main menu' });
    expect(screen.getByRole('tab', { name: 'Bulletins' })).toBeTruthy();
    await waitFor(() => expect(getMenuConfig).toHaveBeenCalledWith('MAIN'));
    await waitFor(() => expect(previewMenu).toHaveBeenCalledWith('MAIN', { level: 255, columns: 80, conference: 1, mode: 'ansi' }));
  });

  it('autosaves a typed description under descriptions', async () => {
    const user = userEvent.setup();
    renderPage();
    const box = await screen.findByLabelText('Description for R');
    await user.type(box, 'Mail here');
    await waitFor(() => expect(saveMenuConfig).toHaveBeenCalledWith('MAIN', expect.objectContaining({ descriptions: { R: 'Mail here' } })), SAVED);
    // the repaired answer's problems are shown above the tabs
    expect(await screen.findByText(/placement X: cleaned/)).toBeTruthy();
  });

  it('writes placement when a command is moved to another section', async () => {
    const user = userEvent.setup();
    renderPage();
    const select = await screen.findByLabelText('Section for FROGGER');
    await user.selectOptions(select, 'Messages');
    await waitFor(() => expect(lastSaved().placement).toEqual({ FROGGER: 'messages' }), SAVED);
  });

  it('adds level 100 with T hidden', async () => {
    const user = userEvent.setup();
    renderPage('?part=levels');
    await user.type(await screen.findByLabelText('New level floor'), '100');
    await user.click(screen.getByRole('button', { name: 'Add level' }));
    await user.click(await screen.findByLabelText('Hide T at level 100'));
    await waitFor(() => expect(lastSaved().levels['100'].hide).toEqual(['T']), SAVED);
  });

  it('writes the paging wipe', async () => {
    const user = userEvent.setup();
    renderPage('?part=wipes');
    await user.selectOptions(await screen.findByLabelText('Changing pages'), 'Vertical blinds');
    await waitFor(() => expect(lastSaved().wipes.page).toBe('V'), SAVED);
  });

  it('asks the preview for PETSCII at 40 columns', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(await screen.findByLabelText('Preview width'), '40');
    await waitFor(() => expect(previewMenu).toHaveBeenCalledWith('MAIN', expect.objectContaining({ columns: 40, mode: 'petscii' })));
  });

  it('does not let a section be removed while the entries failed to load', async () => {
    menuEntries.mockRejectedValueOnce(new Error('entries down'));
    renderPage('?part=sections');
    await screen.findByLabelText('Title of section 1');
    await waitFor(() => expect(menuEntries).toHaveBeenCalled());
    for (const b of screen.getAllByRole('button', { name: 'Remove' })) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the section title when it is cleared', async () => {
    const user = userEvent.setup();
    renderPage('?part=sections');
    const box = await screen.findByLabelText('Title of section 1');
    await user.clear(box);
    expect(await screen.findByText(/needs a title/)).toBeTruthy();
    await new Promise(r => setTimeout(r, 900));
    expect(saveMenuConfig).not.toHaveBeenCalled();
  });

  it('shows the entries as a design-system table and names nothing with an abbreviation', async () => {
    const { container } = renderPage();
    await screen.findByLabelText('Description for R');
    expect(container.querySelector('table')).toBeTruthy();
    const words = within(container).getAllByText(/./).map(n => n.textContent ?? '');
    expect(words.filter(t => /\b(Msg|Conf|Cfg|Desc|Lvl)\b/.test(t))).toEqual([]);
    for (const l of [...container.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label') ?? '')) {
      expect(l).not.toMatch(/\b(Msg|Conf|Cfg|Desc|Lvl)\b/);
    }
  });
});
