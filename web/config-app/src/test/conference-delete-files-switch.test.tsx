/**
 * The sysop decides whether a conference's files go with it.
 *
 * Deleting a conference left its directory alone and reported the path, on
 * the reasoning that nothing should destroy every message and upload in a
 * conference as a side effect of a button. That reasoning holds, but it left
 * the sysop cleaning up by hand on the server, which is not a thing an admin
 * should require. So it is a switch: off by default, stated in the
 * confirmation, and the confirmation says which of the two is about to happen.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const conferences = [
  { id: 1, conference_id: 1, name: 'General', ndirs: 1, dlpath_1: '', ulpath_1: '',
    min_access_level: 0, max_access_level: 255, force_newscan: false, exclude_ftp: false,
    private_conf: false, read_only: false },
  { id: 2, conference_id: 2, name: 'Elite', ndirs: 1, dlpath_1: '', ulpath_1: '',
    min_access_level: 0, max_access_level: 255, force_newscan: false, exclude_ftp: false,
    private_conf: false, read_only: false },
];

const deleteConferenceConfig =
  vi.fn<(confNumber: number, removeFiles?: boolean) => Promise<{ success: boolean }>>(
    async () => ({ success: true })
  );

vi.mock('../api/client', () => ({
  apiClient: {
    getConferenceConfigs: async () => ({ success: true, data: conferences }),
    createConferenceConfig: vi.fn(),
    updateConferenceConfig: vi.fn(),
    deleteConferenceConfig: (confNumber: number, removeFiles?: boolean) =>
      deleteConferenceConfig(confNumber as never, removeFiles as never),
  },
}));

/** Captures what the confirmation actually told the sysop. */
const confirmed = { message: '' };
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    confirm: async (options: { message: string }) => {
      confirmed.message = options.message;
      return true;
    },
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

describe('deleting a conference', () => {
  beforeEach(() => {
    deleteConferenceConfig.mockClear();
    confirmed.message = '';
  });

  it('keeps the files by default, and says so', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /delete general/i }));

    await waitFor(() => expect(deleteConferenceConfig).toHaveBeenCalledTimes(1));
    expect(deleteConferenceConfig.mock.calls[0]).toEqual([1, false]);
    expect(confirmed.message).toMatch(/directory is left alone/i);
  });

  it('takes the files when the switch is on, and warns before it does', async () => {
    renderPage();
    await userEvent.click(await screen.findByLabelText(/delete the conference's files too/i));
    await userEvent.click(await screen.findByRole('button', { name: /delete general/i }));

    await waitFor(() => expect(deleteConferenceConfig).toHaveBeenCalledTimes(1));
    expect(deleteConferenceConfig.mock.calls[0]).toEqual([1, true]);
    expect(confirmed.message).toMatch(/DIRECTORY WILL BE DELETED/);
  });

  it('warns that a middle conference renumbers the ones above it', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /delete general/i }));

    // Conference 1 of 2: conference 2 moves down to 1, and access moves with it.
    expect(confirmed.message).toMatch(/move down one/i);
    expect(confirmed.message).toMatch(/conference access moves with/i);
  });

  it('tells the truth about the last conference: nothing else moves', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /delete elite/i }));

    expect(confirmed.message).toMatch(/comes off the end of the list/i);
    expect(confirmed.message).not.toMatch(/move down one/i);
  });
});
