/**
 * The doors list says which doors describe their own settings.
 *
 * GET /api/config/doors has reported has_settings since the door-settings API
 * landed, and the admin read it nowhere - so every row looked identical and a
 * sysop had to open each door's .info editor one at a time to find out which
 * ones are configurable. Reported from the board on 2026-09-01: "they all look
 * the same no settings badge".
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
    enabled: true, has_settings: true, created_at: new Date(), updated_at: new Date(),
  },
  {
    id: 2, door_name: 'Grandmaster', door_command: 'CHESS', door_type: 'BBSCMD',
    door_path: 'Doors/grandmaster', door_args: '', working_directory: '', priority: 'P0',
    door_options: [], runtime_env: 'NATIVE_NODE', min_security_level: 10,
    max_security_level: 255, required_flags: '', time_limit: 0, memory_limit: 0,
    title: 'Grandmaster', description: 'Chess', category: 'Games',
    enabled: true, has_settings: false, created_at: new Date(), updated_at: new Date(),
  },
];

const SETTINGS_VIEW = {
  manifest: {
    command: 'LIVECHAT',
    settings: [{ key: 'defaultChannel', label: 'Default channel', type: 'string', default: 'general' }],
  },
  values: { defaultChannel: 'general' },
  secretsSet: [] as string[],
};

vi.mock('../api/client', () => ({
  apiClient: {
    getDoors: vi.fn(async () => ({ success: true, data: DOORS })),
    getInfoFile: vi.fn(async () => ({ success: true, data: { tooltypes: [] } })),
    getDoorSettings: vi.fn(async (_command: string) => ({ success: true, data: SETTINGS_VIEW })),
    saveDoorSettings: vi.fn(async (_command: string, _values: Record<string, unknown>) => ({ success: true, data: SETTINGS_VIEW })),
    updateDoor: vi.fn(async (_id: number, _updates: unknown) => ({ success: true, data: {} })),
  },
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => false) }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}));

const { DoorsPage } = await import('../pages/DoorsPage');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DoorsPage />
    </QueryClientProvider>
  );
}

describe('the doors list', () => {
  // Calls, not implementations: the mocks are module-level and one test's
  // save would otherwise count as the next one's.
  beforeEach(() => vi.clearAllMocks());

  it('badges the door that describes its own settings', async () => {
    renderPage();

    const bbslink = await screen.findByText('BBSLink');
    await waitFor(() => expect(within(bbslink.closest('td') as HTMLElement).getByText('Settings')).toBeTruthy());
  });

  it('leaves a door that declares none unmarked', async () => {
    renderPage();

    const grandmaster = await screen.findByText('Grandmaster');
    expect(within(grandmaster.closest('td') as HTMLElement).queryByText('Settings')).toBeNull();
  });

  // The badge sent sysops to the screen they open to configure a door - the
  // pencil - and the form was only in the .info editor behind another icon,
  // so the door looked exactly like every other one.
  it('shows the door settings on the screen the badge sends a sysop to', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByLabelText('Edit BBSLink'));

    expect(await screen.findByText('Door settings')).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText('Default channel')).toBeTruthy());
  });

  it('leaves the edit screen of a door with no settings as it was', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByLabelText('Edit Grandmaster'));

    await screen.findByDisplayValue('Grandmaster');
    expect(screen.queryByText('Door settings')).toBeNull();
  });

  // The first attempt put the section after the footer. The modal is capped at
  // 90vh and scrolls, so on a door with a full form the settings were below
  // the Cancel/Update buttons and off-screen - reported as "nope, still not
  // there". Order is the assertion: settings before the buttons.
  it('puts the settings above the modal buttons, not below them', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByLabelText('Edit BBSLink'));

    const heading = await screen.findByText('Door settings');
    const update = screen.getByRole('button', { name: /update door/i });
    expect(heading.compareDocumentPosition(update) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // A form inside a form is dropped by the browser, and the inner save button
  // then submits the OUTER one - saving the door instead of its settings.
  it('does not nest the settings form inside the door form', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(await screen.findByLabelText('Edit BBSLink'));
    await screen.findByText('Door settings');

    const forms = document.querySelectorAll('form');
    for (const form of Array.from(forms)) {
      expect(form.querySelector('form')).toBeNull();
    }
    expect(container).toBeTruthy();
  });

  // Two save buttons in one dialog is a trap, and the first sysop to use the
  // feature fell in it: typed a board address, pressed Update Door, and the
  // value never reached the disk.
  it('saves the door settings when the sysop presses Update Door', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByLabelText('Edit BBSLink'));
    const channel = await screen.findByLabelText('Default channel');
    await user.clear(channel);
    await user.type(channel, 'uprough');

    await user.click(screen.getByRole('button', { name: /update door/i }));

    const { apiClient } = await import('../api/client');
    await waitFor(() => expect(apiClient.saveDoorSettings).toHaveBeenCalled());
    const [command, values] = (apiClient.saveDoorSettings as any).mock.calls[0];
    expect(command).toBe('BBSLINK');
    expect(values.defaultChannel).toBe('uprough');
  });

  it('leaves the door settings alone when the sysop changed none of them', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByLabelText('Edit BBSLink'));
    await screen.findByText('Door settings');
    await user.click(screen.getByRole('button', { name: /update door/i }));

    const { apiClient } = await import('../api/client');
    expect(apiClient.saveDoorSettings).not.toHaveBeenCalled();
  });
});
