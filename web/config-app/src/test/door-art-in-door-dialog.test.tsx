/**
 * Door art and menu logos are edited in the door's own dialog on the Doors
 * page. The one wiring test: the real page, the Bulletins door's row, and the
 * door's own art plus the BULLETINS menu logos arriving, writing what the
 * sysop edits. The command filter of the list is tested on the list itself.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { defaultMenuConfig } from '@bbs/screens/menu-config/menu-config';
import { placeLogo } from '@bbs/screens/menu-config/logo-placement';

const door = (id: number, command: string, menu_kind: 'MAIN' | 'BULLETINS' | null) => ({
  id, door_name: command, door_command: command, door_type: 'BBSCMD',
  door_path: `Doors/${command}/${command}`, door_args: '', working_directory: '', priority: 'P0',
  door_options: [], runtime_env: 'NATIVE_NODE', min_security_level: 10,
  max_security_level: 255, required_flags: '', time_limit: 0, memory_limit: 0,
  title: command, description: '', category: 'Games',
  enabled: true, has_settings: false, menu_kind, created_at: new Date(), updated_at: new Date(),
});
const DOORS = [door(1, 'B', 'BULLETINS'), door(2, 'GWALL', null)];
const ART = [
  { command: 'B', name: 'Bulletins', sections: [{ file: 'Bulls.CFG', section: 'Title', label: 'Bulletins title', lines: 3, maxLines: 8, maxLineLength: 77 }] },
  { command: 'GWALL', name: 'Global Wall', sections: [{ file: 'wall.cfg', section: 'Header', label: 'Wall header', lines: 1, maxLines: 4, maxLineLength: 77 }] },
];
const FILES = [{ file: 'cat.txt', rows: 6, cols: 60, alphabet: 'ansi' }];

const listDoorArt = vi.fn(async () => ({ success: true, data: ART }));
const getMenuConfig = vi.fn(async (kind: string) => ({ config: defaultMenuConfig(kind as 'MAIN'), problems: [] as string[] }));
const saveMenuConfig = vi.fn(async (_kind: string, config: unknown) => ({ config, problems: [] as string[] }));
const listMenuLogos = vi.fn(async (_kind: string) => FILES);
const uploadMenuLogo = vi.fn(async (_kind: string, file: string, _base64: string, _place: boolean) => ({ file, rows: 1, cols: 1, shown: false }));
// The board's placement route: the shared placeLogo over the stored config.
const placeMenuLogo = vi.fn(async (kind: string, file: string, position: 'header', cls: 'standard') =>
  ({ config: placeLogo(defaultMenuConfig(kind as 'MAIN'), position, cls, file), problems: [] as string[] }));

vi.mock('../api/client', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  apiClient: {
    getDoors: vi.fn(async () => ({ success: true, data: DOORS })),
    getInfoFile: vi.fn(async () => ({ success: true, data: { tooltypes: [] } })),
    updateInfoFile: vi.fn(),
    getDoorSettings: vi.fn(async () => ({ success: true, data: undefined })),
    saveDoorSettings: vi.fn(),
    updateDoor: vi.fn(),
    listDoorArt: () => listDoorArt(),
    getDoorArt: vi.fn(async () => ({ success: true, data: { sections: [] } })),
    getDoorArtVariant: vi.fn(async () => ({ success: true, data: { content: '' } })),
    getMenuConfig: (k: string) => getMenuConfig(k),
    saveMenuConfig: (k: string, c: unknown) => saveMenuConfig(k, c),
    listMenuLogos: (k: string) => listMenuLogos(k),
    uploadMenuLogo: (k: string, f: string, b: string, p: boolean) => uploadMenuLogo(k, f, b, p),
    placeMenuLogo: (k: string, f: string, p: 'header', c: 'standard') => placeMenuLogo(k, f, p, c),
    deleteMenuLogo: vi.fn(),
    getScreenFile: vi.fn(async () => ({ success: true, data: { content: '' } })),
  },
}));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}));

const { DoorsPage } = await import('../pages/DoorsPage');
const { DoorArtList } = await import('../pages/DoorArtList');

function renderIn(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
const lastSaved = () => saveMenuConfig.mock.calls[saveMenuConfig.mock.calls.length - 1][1] as ReturnType<typeof defaultMenuConfig>;

describe('door art in the door dialog', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('is reachable: the Bulletins door shows its own art and the BULLETINS logos, and a logo set saves', async () => {
    const user = userEvent.setup();
    renderIn(<DoorsPage />);
    await user.click(await screen.findByLabelText('Edit B'));

    // sentinel: both parts ran, for this door
    expect(await screen.findByText('Door art')).toBeTruthy();
    expect(await screen.findByText('Bulletins title')).toBeTruthy();
    expect(screen.queryByText('Wall header')).toBeNull();
    const row = (await screen.findByRole('cell', { name: 'cat.txt' })).closest('tr')!;
    expect(within(row).getByText('6 x 60')).toBeTruthy();
    expect(listDoorArt).toHaveBeenCalled();
    expect(getMenuConfig).toHaveBeenCalledWith('BULLETINS');
    expect(listMenuLogos).toHaveBeenCalledWith('BULLETINS');

    await user.upload(screen.getByLabelText('Upload a logo'), new File(['x'], 'cat.txt', { type: 'text/plain' }));
    await waitFor(() => expect(uploadMenuLogo).toHaveBeenCalledWith('BULLETINS', 'cat.txt', 'eA==', false));

    // One step (sysop decision 2026-10-17): the upload asks where the logo goes, Header and the measured width preselected.
    // The board places it; its saved config becomes the local copy, so the next autosave keeps the set.
    await user.click(await screen.findByRole('button', { name: 'Show on the menu' }));
    await waitFor(() => expect(placeMenuLogo).toHaveBeenCalledWith('BULLETINS', 'cat.txt', 'header', 'standard'));
    await user.selectOptions(await screen.findByLabelText('Rule of header set 1'), 'rotate');
    await waitFor(() => expect(lastSaved().logos).toEqual([
      { position: 'header', widthClass: 'standard', levelFloor: 0, rule: 'rotate', files: ['cat.txt'], afterSection: 0 },
    ]), { timeout: 4000 });
  });

  it('opens the editors from the Edit Door dialog without saving or closing it', async () => {
    const user = userEvent.setup();
    renderIn(<DoorsPage />);
    await user.click(await screen.findByLabelText('Edit B'));

    await user.click(await screen.findByRole('button', { name: 'Open in ANSI editor' }));
    expect(await screen.findByRole('dialog', { name: 'Bulletins - Bulletins title' })).toBeTruthy();
    expect(screen.getAllByText('Edit Door').length).toBeGreaterThan(0);
    await user.keyboard('{Escape}');

    await user.click(await screen.findByLabelText('Open cat.txt in the Screen Designer'));
    expect(await screen.findByRole('dialog', { name: 'cat.txt' })).toBeTruthy();
    expect(screen.getAllByText('Edit Door').length).toBeGreaterThan(0);
    const { apiClient } = await import('../api/client');
    expect(apiClient.updateDoor).not.toHaveBeenCalled();
  });

  it('is in the .info editor too: the Bulletins door shows its art and the BULLETINS logos there', async () => {
    const user = userEvent.setup();
    renderIn(<DoorsPage />);
    await user.click(await screen.findByLabelText('Edit the .info file for B'));

    expect(await screen.findByText('Door art')).toBeTruthy();
    expect(await screen.findByText('Bulletins title')).toBeTruthy();
    expect(screen.queryByText('Wall header')).toBeNull();
    await waitFor(() => expect(listMenuLogos).toHaveBeenCalledWith('BULLETINS'));
    expect(screen.getByLabelText('Upload a logo')).toBeTruthy();
  });

  it('shows no menu logos on a door that is not a menu door', async () => {
    const user = userEvent.setup();
    renderIn(<DoorsPage />);
    await user.click(await screen.findByLabelText('Edit GWALL'));
    expect(await screen.findByText('Wall header')).toBeTruthy();
    expect(listMenuLogos).not.toHaveBeenCalled();
    expect(getMenuConfig).not.toHaveBeenCalled();
  });
});

describe('DoorArtList command filter', () => {
  it('lists only the door whose command it is given, whatever the case, and every door without one', async () => {
    const { unmount } = renderIn(<DoorArtList command="gwall" />);
    expect(await screen.findByText('Wall header')).toBeTruthy();
    expect(screen.queryByText('Bulletins title')).toBeNull();
    unmount();
    renderIn(<DoorArtList />);
    expect(await screen.findByText('Wall header')).toBeTruthy();
    expect(screen.getByText('Bulletins title')).toBeTruthy();
  });
});
