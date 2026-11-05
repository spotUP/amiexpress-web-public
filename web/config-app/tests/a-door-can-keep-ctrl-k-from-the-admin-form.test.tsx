/**
 * A door could keep Ctrl+K only by a hand edit of its .info.
 *
 * The board reads NO_PALETTE off a door's .info (doorOptsOutOfPalette in
 * web/backend/src/services/door-input-routing.ts): the command palette does
 * not open over that door and Ctrl+K goes to the door. The admin door form
 * had no switch for it, so a sysop had to know the spelling and type it into
 * the raw tooltype table. The form now offers "Keep Ctrl+K for the door",
 * written TRUTHY (`1`) like the C64 switches, through the same tooltype list.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const DOORS = [
  {
    id: 1, door_name: 'BBSLink', door_command: 'BBSLINK', door_type: 'BBSCMD',
    door_path: 'Doors/bbslink', door_args: '', working_directory: '', priority: 'P0',
    door_options: [], runtime_env: 'NATIVE_NODE', min_security_level: 10,
    max_security_level: 255, required_flags: '', time_limit: 0, memory_limit: 0,
    title: 'BBSLink', description: 'InterBBS games', category: 'Games',
    enabled: true, has_settings: false, created_at: new Date(), updated_at: new Date(),
  },
];

/** The command's .info as it exists on disk; each test sets it. */
let existingTooltypes: Array<{ key: string; value: string; commented: boolean; originalLine: string }> = [];

const updateInfoFile = vi.fn(async (_path: string, _tooltypes: unknown[]) => ({ success: true, data: {} }));

vi.mock('../src/api/client', () => ({
  apiClient: {
    getDoors: vi.fn(async () => ({ success: true, data: DOORS })),
    getInfoFile: vi.fn(async () => ({
      success: true,
      data: { tooltypes: existingTooltypes.map((t) => ({ ...t })) },
    })),
    updateInfoFile,
    getDoorSettings: vi.fn(async () => ({ success: true, data: undefined })),
    saveDoorSettings: vi.fn(),
    updateDoor: vi.fn(async () => ({ success: true, data: {} })),
  },
}));

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => false) }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}));

const { DoorsPage } = await import('../src/pages/DoorsPage');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DoorsPage />
    </QueryClientProvider>
  );
}

async function openInfoEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByLabelText('Edit the .info file for BBSLink'));
}

describe('a door can keep Ctrl+K from the admin form', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ticking "Keep Ctrl+K for the door" writes NO_PALETTE=1 and keeps the other tooltypes', async () => {
    existingTooltypes = [{ key: 'NAME', value: 'BBSLink', commented: false, originalLine: 'NAME=BBSLink' }];
    const user = userEvent.setup();
    renderPage();
    await openInfoEditor(user);

    const box = await screen.findByRole('checkbox', { name: /Keep Ctrl\+K for the door/ });
    expect(box).not.toBeChecked();
    await user.click(box);

    await waitFor(() => expect(updateInfoFile).toHaveBeenCalled(), { timeout: 3000 });
    const [, tooltypes] = updateInfoFile.mock.calls[0] as [string, Array<{ key: string; value: string; commented: boolean }>];
    expect(tooltypes.find((t) => t.key === 'NO_PALETTE')).toMatchObject({ value: '1', commented: false });
    expect(tooltypes.some((t) => t.key === 'NAME' && t.value === 'BBSLink')).toBe(true);
  });

  it('a door that already declared NO_PALETTE=YES shows the switch ticked', async () => {
    existingTooltypes = [{ key: 'NO_PALETTE', value: 'YES', commented: false, originalLine: 'NO_PALETTE=YES' }];
    const user = userEvent.setup();
    renderPage();
    await openInfoEditor(user);

    expect(await screen.findByRole('checkbox', { name: /Keep Ctrl\+K for the door/ })).toBeChecked();
  });

  it('ticking "Keep Ctrl+C for the door" writes KEEP_CTRL_C=1', async () => {
    existingTooltypes = [{ key: 'NAME', value: 'BBSLink', commented: false, originalLine: 'NAME=BBSLink' }];
    const user = userEvent.setup();
    renderPage();
    await openInfoEditor(user);

    const box = await screen.findByRole('checkbox', { name: /Keep Ctrl\+C for the door/ });
    expect(box).not.toBeChecked();
    await user.click(box);
    await waitFor(() => expect(updateInfoFile).toHaveBeenCalled(), { timeout: 3000 });
    const [, on] = updateInfoFile.mock.calls[0] as [string, Array<{ key: string; value: string; commented: boolean }>];
    expect(on.find((t) => t.key === 'KEEP_CTRL_C')).toMatchObject({ value: '1', commented: false });
  });

  it('unticking "Keep Ctrl+C for the door" removes KEEP_CTRL_C', async () => {
    existingTooltypes = [{ key: 'KEEP_CTRL_C', value: '1', commented: false, originalLine: 'KEEP_CTRL_C=1' }];
    const user = userEvent.setup();
    renderPage();
    await openInfoEditor(user);

    const box = await screen.findByRole('checkbox', { name: /Keep Ctrl\+C for the door/ });
    expect(box).toBeChecked();
    await user.click(box);
    await waitFor(() => expect(updateInfoFile).toHaveBeenCalled(), { timeout: 3000 });
    const [, off] = updateInfoFile.mock.calls[0] as [string, Array<{ key: string; value: string; commented: boolean }>];
    expect(off.some((t) => t.key === 'KEEP_CTRL_C' && !t.commented)).toBe(false);
  });
});
