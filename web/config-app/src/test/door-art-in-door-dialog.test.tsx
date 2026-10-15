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
const uploadMenuLogo = vi.fn(async (_kind: string, file: string, _base64: string) => ({ file, rows: 1, cols: 1 }));

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
    getMenuConfig: (k: string) => getMenuConfig(k),
    saveMenuConfig: (k: string, c: unknown) => saveMenuConfig(k, c),
    listMenuLogos: (k: string) => listMenuLogos(k),
    uploadMenuLogo: (k: string, f: string, b: string) => uploadMenuLogo(k, f, b),
    deleteMenuLogo: vi.fn(),
    getScreenFile: vi.fn(),
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
    await waitFor(() => expect(uploadMenuLogo).toHaveBeenCalledWith('BULLETINS', 'cat.txt', 'eA=='));

    await user.selectOptions(screen.getByLabelText('Width for a new header set'), 'Standard');
    await user.selectOptions(screen.getByLabelText('File for a new header set'), 'cat.txt');
    await user.click(screen.getByRole('button', { name: 'Add header set' }));
    await waitFor(() => expect(lastSaved().logos).toEqual([
      { position: 'header', widthClass: 'standard', levelFloor: 0, rule: 'fixed', files: ['cat.txt'], afterSection: 0 },
    ]), { timeout: 4000 });
    expect(saveMenuConfig).toHaveBeenCalledWith('BULLETINS', expect.anything());
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
