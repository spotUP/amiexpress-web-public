/**
 * The per-command flags express.e's runCommand() reads off a door's own
 * BBSCmd/SysCmd .info (SILENT, EXPERT_MODE, LOG_INPUTS, QUICKMODE, TRAPON,
 * SCRIPTCHECK, PASS_PARAMETERS, MIMICVER - express.e:4732-4804) had no model
 * and no admin control at all. Setting one meant knowing the exact tooltype
 * spelling and typing it into the raw tooltype table by hand.
 *
 * These checkboxes read and write the SAME tooltype list the raw table
 * below edits - there is deliberately no second path to the .info file, so
 * a save carries every other tooltype on the icon forward untouched.
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

// The command's .info as it exists on disk: SILENT is already set, the
// other seven flags are absent, and NAME is an ordinary tooltype that has
// nothing to do with any of them.
const EXISTING_TOOLTYPES = [
  { key: 'NAME', value: 'BBSLink', commented: false, originalLine: 'NAME=BBSLink' },
  { key: 'SILENT', value: '', commented: false, originalLine: 'SILENT' },
];

const updateInfoFile = vi.fn(async (_path: string, _tooltypes: unknown[]) => ({ success: true, data: {} }));

vi.mock('../src/api/client', () => ({
  apiClient: {
    getDoors: vi.fn(async () => ({ success: true, data: DOORS })),
    getInfoFile: vi.fn(async () => ({
      success: true,
      data: { tooltypes: EXISTING_TOOLTYPES.map((t) => ({ ...t })) },
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

describe("a command's per-command flags", () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a flag already set on the .info as checked, and an absent one as unchecked', async () => {
    const user = userEvent.setup();
    renderPage();
    await openInfoEditor(user);

    expect(await screen.findByRole('checkbox', { name: /Silent/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Quick Mode/ })).not.toBeChecked();
  });

  it('writes the tooltype when a flag is switched on, keeping the .info\'s other tooltypes', async () => {
    const user = userEvent.setup();
    renderPage();
    await openInfoEditor(user);

    await user.click(await screen.findByRole('checkbox', { name: /Quick Mode/ }));

    await waitFor(() => expect(updateInfoFile).toHaveBeenCalled(), { timeout: 3000 });
    const [path, tooltypes] = updateInfoFile.mock.calls[0] as [string, Array<{ key: string; value: string; commented: boolean }>];

    expect(path).toBe('Commands/BBSCmd/BBSLINK.info');
    expect(tooltypes.some((t) => t.key === 'QUICKMODE' && !t.commented)).toBe(true);
    // A flag toggle must not drop the door's other tooltypes.
    expect(tooltypes.some((t) => t.key === 'NAME' && t.value === 'BBSLink')).toBe(true);
    expect(tooltypes.some((t) => t.key === 'SILENT')).toBe(true);
  });

  it('removes the tooltype entirely when a set flag is switched off', async () => {
    const user = userEvent.setup();
    renderPage();
    await openInfoEditor(user);

    await user.click(await screen.findByRole('checkbox', { name: /Silent/ }));

    await waitFor(() => expect(updateInfoFile).toHaveBeenCalled(), { timeout: 3000 });
    const [, tooltypes] = updateInfoFile.mock.calls[0] as [string, Array<{ key: string }>];

    expect(tooltypes.some((t) => t.key === 'SILENT')).toBe(false);
    expect(tooltypes.some((t) => t.key === 'NAME')).toBe(true);
  });

  it('writes Mimic Version with the value typed, not just its presence', async () => {
    const user = userEvent.setup();
    renderPage();
    await openInfoEditor(user);

    await user.type(await screen.findByLabelText('Mimic Version'), '5.0.0');

    await waitFor(() => expect(updateInfoFile).toHaveBeenCalled(), { timeout: 3000 });
    const [, tooltypes] = updateInfoFile.mock.calls[0] as [string, Array<{ key: string; value: string }>];

    expect(tooltypes.find((t) => t.key === 'MIMICVER')?.value).toBe('5.0.0');
  });

  it('leaves Pass Parameters unset when left blank', async () => {
    const user = userEvent.setup();
    renderPage();
    await openInfoEditor(user);

    // Touch an unrelated flag: a write only follows an edit.
    await user.click(await screen.findByRole('checkbox', { name: /Trap On/ }));

    await waitFor(() => expect(updateInfoFile).toHaveBeenCalled(), { timeout: 3000 });
    const [, tooltypes] = updateInfoFile.mock.calls[0] as [string, Array<{ key: string }>];

    expect(tooltypes.some((t) => t.key === 'PASS_PARAMETERS')).toBe(false);
  });
});
