/**
 * The create form decides who gets the new conference, and the choice reaches
 * the API.
 *
 * "i created a new conference now in the web admin but it's not visible via
 * the join conference command in the bbs": create granted nothing itself and
 * left it to padding that skipped long access strings - the sysop's among
 * them. The grant is now an explicit choice sent with the create.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const conferences = [
  {
    id: 1,
    conference_id: 1,
    name: 'General',
    ndirs: 1,
    dlpath_1: '',
    ulpath_1: '',
    min_access_level: 0,
    max_access_level: 255,
    force_newscan: false,
    exclude_ftp: false,
    private_conf: false,
    read_only: false,
  },
];

type Conference = (typeof conferences)[number];

const createConferenceConfig =
  vi.fn<(config: Partial<Conference>) => Promise<Conference>>(async () => conferences[0]);
const updateConferenceConfig =
  vi.fn<(confNumber: number, updates: Partial<Conference>) => Promise<Conference>>(
    async () => conferences[0]
  );

vi.mock('../src/api/client', () => ({
  apiClient: {
    getConferenceConfigs: async () => ({ success: true, data: conferences }),
    createConferenceConfig: (config: Partial<Conference>) => createConferenceConfig(config),
    updateConferenceConfig: (confNumber: number, updates: Partial<Conference>) =>
      updateConferenceConfig(confNumber, updates),
    deleteConferenceConfig: vi.fn(),
  },
}));

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    confirm: vi.fn(async () => false),
  }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}));

const { ConferencesPage } = await import('../src/pages/ConferencesPage');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConferencesPage />
    </QueryClientProvider>
  );
}

describe('the create form access choice', () => {
  beforeEach(() => {
    createConferenceConfig.mockClear();
    updateConferenceConfig.mockClear();
  });

  it('defaults to everyone and sends it with the create', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /add conference/i }));

    expect((screen.getByLabelText(/who gets access/i) as HTMLSelectElement).value).toBe('everyone');
    await userEvent.type(screen.getByLabelText(/conference name/i), 'Scene Tools');
    await userEvent.click(screen.getByRole('button', { name: /create conference/i }));

    await waitFor(() => expect(createConferenceConfig).toHaveBeenCalledTimes(1));
    expect(createConferenceConfig.mock.calls[0][0]).toMatchObject({ grant: { kind: 'everyone' } });
  });

  it('sends a level grant with its lowest level', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /add conference/i }));

    await userEvent.type(screen.getByLabelText(/conference name/i), 'Elite Lounge');
    await userEvent.selectOptions(screen.getByLabelText(/who gets access/i), 'level');
    const level = screen.getByLabelText(/lowest access level granted/i);
    await userEvent.clear(level);
    await userEvent.type(level, '100');
    await userEvent.click(screen.getByRole('button', { name: /create conference/i }));

    await waitFor(() => expect(createConferenceConfig).toHaveBeenCalledTimes(1));
    expect(createConferenceConfig.mock.calls[0][0]).toMatchObject({ grant: { kind: 'level', minLevel: 100 } });
  });

  it('is not offered when editing - it applies once, at create', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /edit general/i }));

    expect(screen.queryByLabelText(/who gets access/i)).toBeNull();
  });
});
