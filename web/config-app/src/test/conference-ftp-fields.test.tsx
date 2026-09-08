/**
 * The three FTP settings reach the API from the form.
 *
 * FTPDIRNAME, FTP_DIR_DAYS and NO_FTP_UPLOADS exist in express and had no UI
 * here: a sysop who wanted an FTP name for a conference, a longer listing
 * window, or uploads refused had to edit Conf<N>.info by hand. A setting the
 * admin cannot reach is not configurable, however correct the backend is.
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
    ftpdirname: 'Uploads',
    ftp_dir_days: 30,
    no_ftp_uploads: true,
    no_ftp_uploads_text: 'Ask first',
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

async function openEditor() {
  renderPage();
  await userEvent.click(await screen.findByRole('button', { name: /edit general/i }));
}

describe('the conference form FTP settings', () => {
  beforeEach(() => {
    createConferenceConfig.mockClear();
    updateConferenceConfig.mockClear();
  });

  it('loads what the conference already carries', async () => {
    await openEditor();

    expect((screen.getByLabelText(/ftp directory name/i) as HTMLInputElement).value).toBe('Uploads');
    expect((screen.getByLabelText(/ftp listing days/i) as HTMLInputElement).value).toBe('30');
    expect(screen.getByLabelText(/block ftp uploads/i)).toBeChecked();
    expect((screen.getByLabelText(/upload refusal message/i) as HTMLInputElement).value).toBe('Ask first');
  });

  it('sends an edited FTP name and listing window to the API', async () => {
    await openEditor();

    const name = screen.getByLabelText(/ftp directory name/i);
    await userEvent.clear(name);
    await userEvent.type(name, 'Incoming');
    const days = screen.getByLabelText(/ftp listing days/i);
    await userEvent.clear(days);
    await userEvent.type(days, '90');
    await userEvent.click(screen.getByRole('button', { name: /update conference/i }));

    await waitFor(() => expect(updateConferenceConfig).toHaveBeenCalledTimes(1));
    expect(updateConferenceConfig.mock.calls[0][1]).toMatchObject({
      ftpdirname: 'Incoming',
      ftp_dir_days: 90,
    });
  });

  it('sends the block off when the sysop allows uploads again', async () => {
    await openEditor();

    await userEvent.click(screen.getByLabelText(/block ftp uploads/i));
    // The message field belongs to the block: with uploads allowed there is
    // nothing to say, and leaving it on screen invites a sysop to type a
    // refusal that never appears anywhere.
    expect(screen.queryByLabelText(/upload refusal message/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /update conference/i }));

    await waitFor(() => expect(updateConferenceConfig).toHaveBeenCalledTimes(1));
    expect(updateConferenceConfig.mock.calls[0][1]).toMatchObject({ no_ftp_uploads: false });
  });

  it('defaults a new conference to express\'s ten-day listing window', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /add conference/i }));

    // ftpd.e:1160. Offering 0 would mean every new conference lists its whole
    // history, which is not what a board that says nothing gets.
    expect((screen.getByLabelText(/ftp listing days/i) as HTMLInputElement).value).toBe('10');
  });
});
