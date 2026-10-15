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
const deleteMenuLogo = vi.fn(async (_kind: string, _file: string): Promise<void> => undefined);

vi.mock('../api/client', async importOriginal => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  apiClient: {
    listMenuLogos: (k: string) => listMenuLogos(k),
    uploadMenuLogo: vi.fn(),
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
    render(<MenuLogosEditor kind="MAIN" config={withSet()} update={vi.fn()} />);
    const row = (await screen.findByRole('cell', { name: 'cat.txt' })).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Delete cat.txt' }));
    expect(await screen.findByText('Used by: header, footer')).toBeTruthy();
  });

  it('makes no false "no longer on the board" claim while the logo list is pending or has failed', async () => {
    let release: (f: typeof FILES) => void = () => undefined;
    listMenuLogos.mockImplementationOnce(() => new Promise<typeof FILES>(r => { release = r; }));
    const { unmount } = render(<MenuLogosEditor kind="MAIN" config={withSet()} update={vi.fn()} />);
    await screen.findByLabelText('Rule of header set 1');
    expect(screen.queryByText(/no longer on the board/)).toBeNull();
    release(FILES);
    await screen.findByRole('cell', { name: 'cat.txt' });
    unmount();

    listMenuLogos.mockRejectedValueOnce(new Error('list down'));
    render(<MenuLogosEditor kind="MAIN" config={withSet()} update={vi.fn()} />);
    await screen.findByLabelText('Rule of header set 1');
    await waitFor(() => expect(listMenuLogos).toHaveBeenCalledTimes(2));
    await new Promise(r => setTimeout(r, 100));
    expect(screen.queryByText(/no longer on the board/)).toBeNull();
  });
});
