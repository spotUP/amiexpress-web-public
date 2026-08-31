/**
 * The real page, the real dialog, the real toasts.
 *
 * The sysop deleted conference 9. It worked - NCONFS dropped to 12, the
 * backup was written, the board reloaded twelve message bases - and the admin
 * said nothing: the dialog sat there and no toast appeared. The only way to
 * learn the delete had happened was to go and look.
 *
 * The two tests written before this one both passed while that was true,
 * because each mocked the half the bug lives in: the page test mocks the
 * notification context, and the dialog test drives a fake page. This one
 * mocks nothing but the network.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationProvider } from '../contexts/NotificationContext';

const conferences = [
  { id: 1, conference_id: 1, name: 'General', ndirs: 1, dlpath_1: '', ulpath_1: '',
    min_access_level: 0, max_access_level: 255, force_newscan: false, exclude_ftp: false,
    private_conf: false, read_only: false },
  { id: 2, conference_id: 2, name: 'Elite', ndirs: 1, dlpath_1: '', ulpath_1: '',
    min_access_level: 0, max_access_level: 255, force_newscan: false, exclude_ftp: false,
    private_conf: false, read_only: false },
];

const deleteConferenceConfig = vi.fn<
  (confNumber: number, removeFiles?: boolean) => Promise<unknown>
>(async () => ({
  success: true,
  message:
    'Conference removed - the conferences above it moved down one, and 3 account(s) had their access rewritten to match - its files are still on disk at /app/data/bbs/Conf1',
  data: { renumbered: true, usersMigrated: 3, keptOnDisk: '/app/data/bbs/Conf1' },
}));

vi.mock('../api/client', () => ({
  apiClient: {
    getConferenceConfigs: async () => ({ success: true, data: conferences }),
    createConferenceConfig: vi.fn(),
    updateConferenceConfig: vi.fn(),
    deleteConferenceConfig: (confNumber: number, removeFiles?: boolean) =>
      deleteConferenceConfig(confNumber, removeFiles),
  },
}));

const { ConferencesPage } = await import('../pages/ConferencesPage');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NotificationProvider>
        <ConferencesPage />
      </NotificationProvider>
    </QueryClientProvider>
  );
}

/** Open the delete dialog for conference 1 and satisfy the typed confirmation. */
async function openAndConfirm(tickTheBox = false) {
  await userEvent.click(await screen.findByRole('button', { name: /delete general/i }));
  expect(await screen.findByText(/Remove conference 1/)).toBeInTheDocument();
  if (tickTheBox) await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.type(screen.getByLabelText(/type 1 to confirm/i), '1');
  await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));
}

describe('deleting a conference from the page', () => {
  beforeEach(() => deleteConferenceConfig.mockClear());

  it('closes the dialog when Delete is pressed', async () => {
    renderPage();
    await openAndConfirm();

    await waitFor(() => {
      expect(screen.queryByText(/Remove conference 1/)).not.toBeInTheDocument();
    });
  });

  it('says what happened, in the words the server used', async () => {
    renderPage();
    await openAndConfirm();

    await waitFor(() => expect(deleteConferenceConfig).toHaveBeenCalledTimes(1));
    // Not "Conference deleted successfully": renumbering moved every account's
    // access, and the sysop is entitled to hear that from the thing that did it.
    expect(await screen.findByText(/moved down one/)).toBeInTheDocument();
    expect(screen.getByText(/3 account\(s\)/)).toBeInTheDocument();
  });

  it('reports a failure instead of leaving the page silent', async () => {
    deleteConferenceConfig.mockRejectedValueOnce(new Error('Conference 1 does not exist'));
    renderPage();
    await openAndConfirm();

    expect(await screen.findByText(/Conference 1 does not exist/)).toBeInTheDocument();
  });
});
