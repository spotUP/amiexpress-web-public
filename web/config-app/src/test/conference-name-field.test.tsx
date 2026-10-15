/**
 * A conference's name is editable, and the name reaches the API.
 *
 * The backend was fixed to honour it - ConferenceConfigSchema declares `name`,
 * create writes NAME.<N> into ConfConfig.info and update rewrites it - but the
 * form had no name field at all: ConferenceFormData never carried one, so the
 * page could not send one and every conference the admin created was called
 * "Conference N". A fix the UI cannot reach is not a fix.
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

vi.mock('../api/client', () => ({
  apiClient: {
    getConferenceConfigs: async () => ({ success: true, data: conferences }),
    createConferenceConfig: (config: Partial<Conference>) => createConferenceConfig(config),
    updateConferenceConfig: (confNumber: number, updates: Partial<Conference>) =>
      updateConferenceConfig(confNumber, updates),
    deleteConferenceConfig: vi.fn(),
  },
}));

vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    confirm: vi.fn(async () => false),
  }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}));

const { ConferencesPage } = await import('../pages/ConferencesPage');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConferencesPage />
    </QueryClientProvider>
  );
}

describe('the conference form', () => {
  beforeEach(() => {
    createConferenceConfig.mockClear();
    updateConferenceConfig.mockClear();
  });

  it('offers a name field when adding a conference', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /add conference/i }));

    expect(screen.getByLabelText(/conference name/i)).toBeInTheDocument();
  });

  it('sends the typed name to the API instead of dropping it', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /add conference/i }));

    await userEvent.type(screen.getByLabelText(/conference name/i), 'Testzone');
    await userEvent.click(screen.getByRole('button', { name: /create conference/i }));

    await waitFor(() => expect(createConferenceConfig).toHaveBeenCalledTimes(1));
    expect(createConferenceConfig.mock.calls[0][0]).toMatchObject({ name: 'Testzone' });
  });

  it('opens the editor when the row itself is clicked, not just the pencil', async () => {
    renderPage();
    await userEvent.click(await screen.findByText('General'));

    const field = (await screen.findByLabelText(/conference name/i)) as HTMLInputElement;
    expect(field.value).toBe('General');
  });

  it('loads the existing name when editing, so a rename is possible', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /edit general/i }));

    const field = screen.getByLabelText(/conference name/i) as HTMLInputElement;
    expect(field.value).toBe('General');

    await userEvent.clear(field);
    await userEvent.type(field, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: /update conference/i }));

    await waitFor(() => expect(updateConferenceConfig).toHaveBeenCalledTimes(1));
    expect(updateConferenceConfig.mock.calls[0][1]).toMatchObject({ name: 'Renamed' });
  });
});
