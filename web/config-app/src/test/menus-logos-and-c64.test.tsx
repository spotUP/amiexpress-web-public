/**
 * The Menu Doors page's logo, C64 menu and bulletin-title parts: reachable through
 * the real page and writing what the sysop edits. What each edit does to the
 * config is tested in menu-logo-edit.test.ts; this is the one wiring test.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
const FILES = [
  { file: 'cat.txt', rows: 6, cols: 60, alphabet: 'ansi' },
  { file: 'huge.txt', rows: 6, cols: 100, alphabet: 'ansi' },
  { file: 'pet.seq', rows: 5, cols: 40, alphabet: 'petscii' },
];

const getMenuConfig = vi.fn(async (kind: string) => ({ config: defaultMenuConfig(kind as 'MAIN'), problems: [] as string[] }));
const saveMenuConfig = vi.fn(async (_kind: string, config: unknown) => ({ config, problems: [] as string[] }));
const previewMenu = vi.fn(async () => ({ sections: [], overflow: 'scroll', wipes: { open: 'X', leave: '', page: 'H' }, logos: [] }));
const menuEntries = vi.fn(async (kind: string) => (kind === 'BULLETINS' ? BULLETINS : ROWS));
const listMenuLogos = vi.fn(async (_kind: string) => FILES);
const uploadMenuLogo = vi.fn(async (_kind: string, file: string, _base64: string) => ({ file, rows: 1, cols: 1 }));
const deleteMenuLogo = vi.fn(async (_kind: string, _file: string): Promise<void> => undefined);
const confirm = vi.fn(async () => true);

vi.mock('../api/client', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  apiClient: {
    getMenuConfig: (k: string) => getMenuConfig(k),
    saveMenuConfig: (k: string, c: unknown) => saveMenuConfig(k, c),
    previewMenu: () => previewMenu(),
    menuEntries: (k: string) => menuEntries(k),
    listMenuLogos: (k: string) => listMenuLogos(k),
    uploadMenuLogo: (k: string, f: string, b: string) => uploadMenuLogo(k, f, b),
    deleteMenuLogo: (k: string, f: string) => deleteMenuLogo(k, f),
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

describe('the Menu Doors logo, C64 and bulletin parts', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('is reachable: uploads a logo, writes a logo set, builds a C64 menu and titles a bulletin', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('tab', { name: 'Logos' }));

    // the files, with their size
    const row = (await screen.findByRole('cell', { name: 'cat.txt' })).closest('tr')!;
    expect(within(row).getByText('6 x 60')).toBeTruthy();

    // upload
    await user.upload(screen.getByLabelText('Upload a logo'), new File(['x'], 'cat.txt', { type: 'text/plain' }));
    await waitFor(() => expect(uploadMenuLogo).toHaveBeenCalledWith('MAIN', 'cat.txt', 'eA=='));

    // a header set at Standard with cat.txt; the 100-column file cannot be added
    await user.selectOptions(screen.getByLabelText('Width for a new header set'), 'Standard');
    const file = screen.getByLabelText('File for a new header set');
    const huge = within(file).getByRole('option', { name: /huge\.txt.*Wider than this screen - never drawn/ }) as HTMLOptionElement;
    expect(huge.disabled).toBe(true);
    expect(within(file).queryByRole('option', { name: /pet\.seq/ })).toBeNull();
    await user.selectOptions(file, 'cat.txt');
    await user.click(screen.getByRole('button', { name: 'Add header set' }));
    await user.selectOptions(await screen.findByLabelText('Rule of header set 1'), 'Rotate in order');
    await waitFor(() => expect(lastSaved().logos).toEqual([
      { position: 'header', widthClass: 'standard', levelFloor: 0, rule: 'rotate', files: ['cat.txt'], afterSection: 0 },
    ]), SAVED);

    // a C64 set is offered .seq only
    await user.selectOptions(screen.getByLabelText('Width for a new footer set'), 'C64');
    expect(within(screen.getByLabelText('File for a new footer set')).queryByRole('option', { name: /cat\.txt/ })).toBeNull();

    // the C64 menu
    await user.click(screen.getByRole('tab', { name: 'C64 menu' }));
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

  it('says which parts of the menu still use a logo that cannot be deleted', async () => {
    const user = userEvent.setup();
    // The real mapping: the board answers 409 with usedBy at the top level, client.ts failed() turns it into an ApiError.
    const { apiClient: real } = await vi.importActual<typeof import('../api/client')>('../api/client');
    const refusal = (real as unknown as { failed(s: number, b: object, f: string): Error })
      .failed(409, { success: false, message: 'The menu still shows this logo', usedBy: ['header', 'footer'] }, 'Failed');
    deleteMenuLogo.mockRejectedValueOnce(refusal);
    renderPage('?part=logos');
    const row = (await screen.findByRole('cell', { name: 'cat.txt' })).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Delete cat.txt' }));
    expect(await screen.findByText('Used by: header, footer')).toBeTruthy();
  });
});
