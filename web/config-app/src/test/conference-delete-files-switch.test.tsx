/**
 * The sysop decides whether a conference's files go with it.
 *
 * Deleting a conference left its directory alone and reported the path, on
 * the reasoning that nothing should destroy every message and upload in a
 * conference as a side effect of a button. That reasoning holds, but it left
 * the sysop cleaning up by hand on the server, which is not a thing an admin
 * should require. So it is a switch, off by default.
 *
 * It lives IN the confirmation dialog. It first sat above the table, as page
 * state to be set before pressing delete - "i dont se any switch", and fair
 * enough: the choice belongs at the moment it is made, next to the button
 * that acts on it, not somewhere the dialog never mentions.
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

/** Captures what the confirmation offered, and answers it. */
const dialog = {
  message: '',
  checkbox: undefined as { label: string; description?: string } | undefined,
  /** What the sysop does with the box when the dialog is up. */
  tick: false,
};
vi.mock('../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    confirm: async (options: {
      message: string;
      checkbox?: { label: string; description?: string };
    }) => {
      dialog.message = options.message;
      dialog.checkbox = options.checkbox;
      return options.checkbox ? { confirmed: true, checked: dialog.tick } : true;
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
    dialog.message = '';
    dialog.checkbox = undefined;
    dialog.tick = false;
  });

  it('offers the choice in the dialog, not as page state to set first', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /delete general/i }));

    await waitFor(() => expect(deleteConferenceConfig).toHaveBeenCalledTimes(1));
    expect(dialog.checkbox?.label).toMatch(/files too/i);
    expect(dialog.checkbox?.description).toMatch(/every message posted there/i);
  });

  it('keeps the files when the box is left alone', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /delete general/i }));

    await waitFor(() => expect(deleteConferenceConfig).toHaveBeenCalledTimes(1));
    expect(deleteConferenceConfig.mock.calls[0]).toEqual([1, false]);
  });

  it('takes the files when the box is ticked', async () => {
    dialog.tick = true;
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /delete general/i }));

    await waitFor(() => expect(deleteConferenceConfig).toHaveBeenCalledTimes(1));
    expect(deleteConferenceConfig.mock.calls[0]).toEqual([1, true]);
  });

  it('warns that a middle conference renumbers the ones above it', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /delete general/i }));

    // Conference 1 of 2: conference 2 moves down to 1, and access moves with it.
    expect(dialog.message).toMatch(/move down one/i);
    expect(dialog.message).toMatch(/conference access moves with/i);
  });

  it('tells the truth about the last conference: nothing else moves', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /delete elite/i }));

    expect(dialog.message).toMatch(/comes off the end of the list/i);
    expect(dialog.message).not.toMatch(/move down one/i);
  });
});
