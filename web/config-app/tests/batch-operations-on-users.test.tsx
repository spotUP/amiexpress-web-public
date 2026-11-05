/**
 * Doing one thing to several accounts at once.
 *
 * "batch operations on users would be nice as well" (the sysop, 2026-09-15),
 * and asked which, he picked three: delete several, change the access level,
 * and block or unblock.
 *
 * Each runs the SAME per-account endpoint the single-row actions run, in a
 * loop, rather than a new batch API. There are 46 accounts on this board, so
 * the round trips cost nothing - and a batch endpoint would be a second place
 * that has to remember deleting a user takes the disk slot with the database
 * row (config-routes DELETE /users/:id). A second copy of a rule is how this
 * board keeps getting caught.
 *
 * What is pinned here is the part that would be dangerous if it were wrong:
 * WHICH accounts a batch touches, and that it asks first.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getUsers = vi.fn();
const updateUser = vi.fn();
const deleteUser = vi.fn();
const confirmMock = vi.fn();

vi.mock('../src/api/client', () => ({
  apiClient: {
    getUsers: (...a: unknown[]) => getUsers(...a),
    updateUser: (...a: unknown[]) => updateUser(...a),
    deleteUser: (...a: unknown[]) => deleteUser(...a),
    createUser: vi.fn(),
  },
}));

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    confirm: (...a: unknown[]) => confirmMock(...a),
  }),
}));

import { UsersPage } from '../src/pages/UsersPage';

const account = (id: string, username: string, over: Record<string, unknown> = {}) => ({
  // realname deliberately differs from username: with both the same, a query
  // for the name matches two cells and the test fails for its own reasons.
  id, username, realname: `${username} the caller`, location: '', email: '', phone: '',
  secLevel: 10, timeLimit: 60, expert: false, calls: 1, uploads: 0, downloads: 0,
  accountLocked: 0, invalidAttempts: 0, ...over,
});

const BOARD = [
  account('user-1', 'coffe'),
  account('user-2', 'dalton'),
  account('user-3', 'sysop', { secLevel: 255 }),
];

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

/** Tick the named accounts by their row checkboxes. */
async function tick(...ids: string[]) {
  for (const id of ids) {
    await userEvent.click(await screen.findByLabelText(`Select ${id}`));
  }
}

beforeEach(() => {
  getUsers.mockReset();
  getUsers.mockResolvedValue({ data: BOARD });
  updateUser.mockReset();
  updateUser.mockResolvedValue({});
  deleteUser.mockReset();
  deleteUser.mockResolvedValue({ deleted: true });
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(true);
});

describe('batch operations', () => {
  it('offers nothing until something is ticked', async () => {
    wrap(<UsersPage />);
    await screen.findByLabelText('Select user-1');

    expect(screen.queryByText(/accounts? selected/i)).toBeNull();
  });

  it('says how many are selected', async () => {
    wrap(<UsersPage />);
    await tick('user-1', 'user-2');

    expect(await screen.findByText('2 accounts selected')).toBeInTheDocument();
  });

  it('deletes exactly the ticked accounts, and nothing else', async () => {
    wrap(<UsersPage />);
    await tick('user-1', 'user-3');

    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(deleteUser).toHaveBeenCalledTimes(2));
    expect(deleteUser.mock.calls.map((c) => c[0]).sort()).toEqual(['user-1', 'user-3']);
  });

  it('sets the access level on the ticked accounts', async () => {
    wrap(<UsersPage />);
    await tick('user-1', 'user-2');

    await userEvent.type(screen.getByLabelText(/access level to set/i), '30');
    await userEvent.click(screen.getByRole('button', { name: /set level/i }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(2));
    expect(updateUser.mock.calls[0][1]).toEqual({ secLevel: 30 });
  });

  it('refuses a level that is not a level, without calling anything', async () => {
    wrap(<UsersPage />);
    await tick('user-1');

    await userEvent.type(screen.getByLabelText(/access level to set/i), '999');
    await userEvent.click(screen.getByRole('button', { name: /set level/i }));

    expect(updateUser).not.toHaveBeenCalled();
  });

  it('blocks the ticked accounts, and unblocking also clears the failure count', async () => {
    wrap(<UsersPage />);
    await tick('user-2');

    await userEvent.click(screen.getByRole('button', { name: /^block$/i }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith('user-2', { accountLocked: 1 }));

    // The bar clears itself after a batch, so choosing again is deliberate -
    // that is the behaviour pinned below, not an accident of this test.
    updateUser.mockClear();
    await waitFor(() => expect(screen.queryByText(/accounts? selected/i)).toBeNull());
    await tick('user-2');
    await userEvent.click(screen.getByRole('button', { name: /^unblock$/i }));
    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith('user-2', { accountLocked: 0, invalidAttempts: 0 }),
    );
  });

  it('asks once, naming every account it is about to touch', async () => {
    wrap(<UsersPage />);
    await tick('user-1', 'user-2');

    await userEvent.click(screen.getByRole('button', { name: /^block$/i }));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    const asked = confirmMock.mock.calls[0][0] as { message: string };
    expect(asked.message).toContain('coffe');
    expect(asked.message).toContain('dalton');
  });

  it('does nothing at all when the sysop cancels', async () => {
    confirmMock.mockResolvedValue(false);
    wrap(<UsersPage />);
    await tick('user-1', 'user-2');

    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('clears the selection afterwards, so a second press cannot repeat it', async () => {
    wrap(<UsersPage />);
    await tick('user-1');

    await userEvent.click(screen.getByRole('button', { name: /^block$/i }));

    await waitFor(() => expect(screen.queryByText(/accounts? selected/i)).toBeNull());
  });

  it('select-all takes what is SHOWN, not what the search hid', async () => {
    wrap(<UsersPage />);
    await screen.findByLabelText('Select user-1');

    // Narrow to one account, then select all.
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'dalton');
    await waitFor(() => expect(screen.queryByLabelText('Select user-1')).toBeNull());
    await userEvent.click(screen.getByLabelText(/select all shown/i));

    expect(await screen.findByText('1 account selected')).toBeInTheDocument();
  });
});
