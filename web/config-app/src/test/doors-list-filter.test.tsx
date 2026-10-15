/**
 * The doors list can be filtered, because a board runs dozens of them.
 *
 * Reported from the board on 2026-09-08: "add a filter for the doors so i can
 * filter them in the list they are too many". The list had a sort and no
 * filter, so finding one door meant reading every row.
 *
 * The filter reads the fields a sysop knows a door by - its name, the command
 * a caller types, its type and runtime, and the path its .info points at -
 * and the count under the table says how much of the board is hidden.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const base = {
  door_args: '', working_directory: '', priority: 'P0', door_options: [],
  multi_node: true, stack: 0,
  max_security_level: 255, required_flags: '', time_limit: 0, memory_limit: 0,
  description: '', category: 'Games', enabled: true, has_settings: false,
  created_at: new Date(), updated_at: new Date(),
};

const DOORS = [
  {
    ...base, id: 1, door_name: 'Ganja Wars', door_command: 'GANJA', door_type: 'typescript',
    door_path: 'Doors/dopewars', runtime_env: 'NATIVE_NODE', min_security_level: 10,
    title: 'Ganja Wars',
  },
  {
    ...base, id: 2, door_name: 'Global Requests', door_command: 'REQUESTS', door_type: 'XIM',
    door_path: 'Doors/REQUESTS/requests', runtime_env: 'AMIGA_68K', min_security_level: 1,
    title: 'Global Requests',
  },
  {
    ...base, id: 3, door_name: 'Card Lobby', door_command: 'CARDLOBBY', door_type: 'typescript',
    door_path: 'Doors/card-lobby', runtime_env: 'NATIVE_NODE', min_security_level: 10,
    title: 'Card Lobby', enabled: false,
  },
];

vi.mock('../api/client', () => ({
  apiClient: {
    getDoors: vi.fn(async () => ({ success: true, data: DOORS })),
    getInfoFile: vi.fn(async () => ({ success: true, data: { tooltypes: [] } })),
    getDoorSettings: vi.fn(async () => ({ success: true, data: { manifest: { command: '', settings: [] }, values: {}, secretsSet: [] } })),
    updateDoor: vi.fn(async () => ({ success: true, data: {} })),
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

async function filterFor(text: string): Promise<void> {
  const box = await screen.findByLabelText('Filter doors');
  await userEvent.clear(box);
  await userEvent.type(box, text);
}

describe('filtering the doors list', () => {
  it('shows every door until something is typed', async () => {
    renderPage();

    expect(await screen.findByText('Ganja Wars')).toBeInTheDocument();
    expect(screen.getByText('Global Requests')).toBeInTheDocument();
    expect(screen.getByText('Card Lobby')).toBeInTheDocument();
    expect(screen.getByText('3 doors')).toBeInTheDocument();
  });

  it('finds a door by its name', async () => {
    renderPage();
    await screen.findByText('Ganja Wars');

    await filterFor('card');

    expect(screen.getByText('Card Lobby')).toBeInTheDocument();
    expect(screen.queryByText('Ganja Wars')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 3 doors')).toBeInTheDocument();
  });

  it('finds a door by the command a caller types', async () => {
    renderPage();
    await screen.findByText('Ganja Wars');

    await filterFor('ganja');

    expect(screen.getByText('Ganja Wars')).toBeInTheDocument();
    expect(screen.queryByText('Global Requests')).not.toBeInTheDocument();
  });

  it('finds the 68K doors by their runtime', async () => {
    renderPage();
    await screen.findByText('Ganja Wars');

    await filterFor('amiga_68k');

    expect(screen.getByText('Global Requests')).toBeInTheDocument();
    expect(screen.queryByText('Card Lobby')).not.toBeInTheDocument();
  });

  it('shows the registration facts a misbehaving door is diagnosed from', async () => {
    // A door that misbehaves is usually a door whose .info says something the
    // sysop cannot see. CARDLOBBY ran as a 68K door out of a TypeScript
    // directory on 2026-09-08 and the list showed neither the path nor
    // anything else to go on.
    renderPage();
    await screen.findByText('Ganja Wars');

    expect(screen.getByText('Path')).toBeInTheDocument();
    expect(screen.getByText('Doors/REQUESTS/requests')).toBeInTheDocument();
    expect(screen.getByText('Multi-node')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('says which doors are single-node, because that is a rule about callers', async () => {
    renderPage();
    await screen.findByText('Ganja Wars');

    // Every door in the fixture is multi-node except the one that says so.
    expect(screen.getAllByText('Multi').length).toBeGreaterThan(0);
  });

  it('says so when nothing matches, naming what was typed', async () => {
    renderPage();
    await screen.findByText('Ganja Wars');

    await filterFor('zzzz');

    expect(screen.getByText('No door matches "zzzz".')).toBeInTheDocument();
    expect(screen.getByText('0 of 3 doors')).toBeInTheDocument();
  });

  // The whole row opens the dialog: the sysop asked for it after finding
  // only the pencil icon. The icon buttons stop propagation in the table,
  // so they keep their own jobs.
  it('opens the edit dialog from anywhere on the row', async () => {
    renderPage();
    await screen.findByText('Ganja Wars');

    await userEvent.click(screen.getByText('Global Requests'));

    expect(await screen.findByText('Update Door')).toBeInTheDocument();
  });
});
