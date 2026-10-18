/**
 * MenuLogosEditor on its own (the dialog wiring is tested in
 * door-art-in-door-dialog.test.tsx): a logo the menu still uses cannot be
 * deleted and the sysop is told which parts use it; and no "no longer on the
 * board" claim is made while the logo list is pending or has failed.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultMenuConfig } from '@bbs/screens/menu-config/menu-config';

const FILES = [{ file: 'cat.txt', rows: 6, cols: 60, alphabet: 'ansi' }];

const listMenuLogos = vi.fn(async (_kind: string) => FILES);
const uploadMenuLogo = vi.fn(async (_kind: string, file: string, _base64: string, _place: boolean) => ({ file, rows: 6, cols: 80, shown: false }));
const deleteMenuLogo = vi.fn(async (_kind: string, _file: string): Promise<void> => undefined);

vi.mock('../api/client', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  apiClient: {
    listMenuLogos: (k: string) => listMenuLogos(k),
    uploadMenuLogo: (k: string, f: string, b: string, p: boolean) => uploadMenuLogo(k, f, b, p),
    deleteMenuLogo: (k: string, f: string) => deleteMenuLogo(k, f),
  },
}));
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => true) }),
}));

const { MenuLogosEditor } = await import('../components/menus/MenuLogosEditor');

const withSet = () => {
  const c = defaultMenuConfig('MAIN');
  c.logos = [{ position: 'header', widthClass: 'standard', levelFloor: 0, rule: 'fixed', files: ['cat.txt'], afterSection: 0 }];
  return c;
};

describe('MenuLogosEditor', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('says which parts of the menu still use a logo that cannot be deleted', async () => {
    const user = userEvent.setup();
    // The real mapping: the board answers 409 with usedBy at the top level, client.ts failed() turns it into an ApiError.
    const { apiClient: real } = await vi.importActual<typeof import('../api/client')>('../api/client');
    const refusal = (real as unknown as { failed(s: number, b: object, f: string): Error })
      .failed(409, { success: false, message: 'The menu still shows this logo', usedBy: ['header', 'footer'] }, 'Failed');
    deleteMenuLogo.mockRejectedValueOnce(refusal);
    render(<MenuLogosEditor kind="MAIN" config={withSet()} update={vi.fn()} placeLogo={vi.fn()} />);
    const row = (await screen.findByRole('cell', { name: 'cat.txt' })).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Delete cat.txt' }));
    expect(await screen.findByText('Used by: header, footer')).toBeTruthy();
  });

  it('makes no false "no longer on the board" claim while the logo list is pending or has failed', async () => {
    let release: (f: typeof FILES) => void = () => undefined;
    listMenuLogos.mockImplementationOnce(() => new Promise<typeof FILES>(r => { release = r; }));
    const { unmount } = render(<MenuLogosEditor kind="MAIN" config={withSet()} update={vi.fn()} placeLogo={vi.fn()} />);
    await screen.findByLabelText('Rule of header set 1');
    expect(screen.queryByText(/no longer on the board/)).toBeNull();
    release(FILES);
    await screen.findByRole('cell', { name: 'cat.txt' });
    unmount();

    listMenuLogos.mockRejectedValueOnce(new Error('list down'));
    render(<MenuLogosEditor kind="MAIN" config={withSet()} update={vi.fn()} placeLogo={vi.fn()} />);
    await screen.findByLabelText('Rule of header set 1');
    await waitFor(() => expect(listMenuLogos).toHaveBeenCalledTimes(2));
    await new Promise(r => setTimeout(r, 100));
    expect(screen.queryByText(/no longer on the board/)).toBeNull();
  });
  /*
   * Live 2026-10-17: the sysop uploaded mainmenu2.ans (6 x 80) for the main menu and it never showed - the
   * board had no Menus/MAIN.json, so no set ever named it. Every new-set row opened on C64, where only a .seq
   * is offered, so the .ans was not in the file list until the width was changed by hand.
   */
  it('offers an uploaded .ans in the header row at once and adds it as a Standard set', async () => {
    const user = userEvent.setup();
    listMenuLogos.mockResolvedValueOnce([{ file: 'mainmenu2.ans', rows: 6, cols: 80, alphabet: 'ansi' }]);
    let config = defaultMenuConfig('MAIN');
    const update = vi.fn((change: (c: typeof config) => typeof config) => { config = change(config); });
    render(<MenuLogosEditor kind="MAIN" config={config} update={update} placeLogo={vi.fn()} />);
    const pick = screen.getByLabelText('File for a new header set') as HTMLSelectElement;
    await waitFor(() => expect(within(pick).queryByRole('option', { name: 'mainmenu2.ans' })).toBeTruthy());
    await user.selectOptions(pick, 'mainmenu2.ans');
    await user.click(screen.getByRole('button', { name: 'Add header set' }));
    expect(config.logos).toEqual([expect.objectContaining({ position: 'header', widthClass: 'standard', files: ['mainmenu2.ans'] })]);
  });

  it('says a logo no set names is not shown, and where one that is named shows', async () => {
    listMenuLogos.mockResolvedValueOnce([...FILES, { file: 'mainmenu2.ans', rows: 6, cols: 80, alphabet: 'ansi' }]);
    render(<MenuLogosEditor kind="MAIN" config={withSet()} update={vi.fn()} placeLogo={vi.fn()} />);
    const loose = (await screen.findByRole('cell', { name: 'mainmenu2.ans' })).closest('tr')!;
    expect(within(loose).getByText(/Not shown/)).toBeTruthy();
    const used = screen.getByRole('cell', { name: 'cat.txt' }).closest('tr')!;
    expect(within(used).getByText('Header, Standard')).toBeTruthy();
  });

  /*
   * Sysop decision 2026-10-17: an upload puts the logo on screen in one step. Before, the upload only stored
   * the file (live had no Menus/MAIN.json, so nothing ever named it). The dialog opens on Header and the width
   * the board measured (80 columns = Standard); one click asks the board to place it (the placement route,
   * the shared placeLogo), and the dialog's own upload only stores the file.
   */
  it('an upload asks where the logo goes and one click puts it in the header set for its measured width', async () => {
    const user = userEvent.setup();
    const config = defaultMenuConfig('MAIN');
    config.logos = [{ position: 'header', widthClass: 'standard', levelFloor: 0, rule: 'fixed', files: ['logo-a.txt'], afterSection: 0 }];
    const update = vi.fn();
    const placeLogo = vi.fn(async () => undefined);
    const { container } = render(<MenuLogosEditor kind="MAIN" config={config} update={update} placeLogo={placeLogo} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['\x1b[1mLOGO'], 'mainmenu2.ans'));
    await waitFor(() => expect(uploadMenuLogo).toHaveBeenCalledWith('MAIN', 'mainmenu2.ans', expect.any(String), false));
    expect((await screen.findByLabelText('Position for the uploaded logo') as HTMLSelectElement).value).toBe('header');
    expect((screen.getByLabelText('Screen width for the uploaded logo') as HTMLSelectElement).value).toBe('standard');
    expect(screen.getByText(/takes the place of logo-a.txt/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show on the menu' }));
    await waitFor(() => expect(placeLogo).toHaveBeenCalledWith('mainmenu2.ans', 'header', 'standard'));
    expect(update).not.toHaveBeenCalled();   // placement has one home: the board
  });

  it('a wide logo opens on Wide with Standard not offered, and keeping the file only changes no set', async () => {
    const user = userEvent.setup();
    uploadMenuLogo.mockResolvedValueOnce({ file: 'big.ans', rows: 8, cols: 110, shown: false });
    const update = vi.fn();
    const placeLogo = vi.fn(async () => undefined);
    const { container } = render(<MenuLogosEditor kind="MAIN" config={defaultMenuConfig('MAIN')} update={update} placeLogo={placeLogo} />);
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'big.ans'));
    const width = await screen.findByLabelText('Screen width for the uploaded logo') as HTMLSelectElement;
    expect(width.value).toBe('wide');
    expect(within(width).queryByRole('option', { name: 'Standard' })).toBeNull();   // 110 columns never fits 80
    await user.click(screen.getByRole('button', { name: 'Only keep the file' }));
    expect(update).not.toHaveBeenCalled();
    expect(placeLogo).not.toHaveBeenCalled();
    expect(uploadMenuLogo).toHaveBeenLastCalledWith('MAIN', 'big.ans', expect.any(String), false);
  });
});
