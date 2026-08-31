/**
 * The doors list says which doors describe their own settings.
 *
 * GET /api/config/doors has reported has_settings since the door-settings API
 * landed, and the admin read it nowhere - so every row looked identical and a
 * sysop had to open each door's .info editor one at a time to find out which
 * ones are configurable. Reported from the board on 2026-09-01: "they all look
 * the same no settings badge".
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

vi.mock('../api/client', () => ({
  apiClient: {
    getDoors: vi.fn(async () => ({ success: true, data: DOORS })),
    getInfoFile: vi.fn(async () => ({ success: true, data: { tooltypes: [] } })),
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
});
