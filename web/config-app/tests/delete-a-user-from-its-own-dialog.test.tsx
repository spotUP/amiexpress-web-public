/**
 * Deleting a user happens in the account's own dialog, not from the row.
 *
 * "i cant delete users in the web admin ui" (the sysop, 2026-09-15). Asked
 * what actually happened, the answer was that he could not get to Delete at
 * all - and the reason was the affordance, not the code. Delete was a 14px
 * trash icon at the end of the row, immediately beside the 14px pencil that
 * opens the account, on rows that are themselves clickable.
 *
 * I chased two wrong causes before asking: a typed-confirmation mismatch
 * (the dialog compares `typed.trim()` against an untrimmed name, which would
 * silently block a space-padded username) and a case-folding miss. Both are
 * real latent traps; neither was this. Every name in the board's own
 * `user.data` - read back at the 232-byte stride the reader actually uses -
 * is clean.
 *
 * So: "move the delete button to the dialog a click on a user should open the
 * edit dialog". The row opens the account; the account's dialog is where it
 * can be destroyed, with the thing being deleted on screen and named.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getUsers = vi.fn();
const deleteUser = vi.fn();
const confirmMock = vi.fn();

vi.mock('../src/api/client', () => ({
  apiClient: {
    getUsers: (...a: unknown[]) => getUsers(...a),
    deleteUser: (...a: unknown[]) => deleteUser(...a),
    updateUser: vi.fn().mockResolvedValue({}),
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

const account = (over: Record<string, unknown> = {}) => ({
  id: 'user-25', username: 'sysop', realname: 'The Sysop', location: 'Server Room',
  email: '', phone: '', secLevel: 255, timeLimit: 60, expert: false, calls: 1,
  uploads: 0, downloads: 0, accountLocked: 0, invalidAttempts: 0, ...over,
});

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

/** Open the account the way a sysop does: click its row. */
async function openTheAccount() {
  getUsers.mockResolvedValue({ data: [account()] });
  wrap(<UsersPage />);
  await userEvent.click(await screen.findByText('sysop'));
  await waitFor(() => expect(screen.getByDisplayValue('sysop')).toBeInTheDocument());
  return screen.getByDisplayValue('sysop').closest('form') as HTMLElement;
}

beforeEach(() => {
  getUsers.mockReset();
  deleteUser.mockReset();
  deleteUser.mockResolvedValue({ deleted: true });
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(true);
});

describe('deleting a user', () => {
  it('is not offered on the row - that is where the mis-click was', async () => {
    getUsers.mockResolvedValue({ data: [account()] });
    wrap(<UsersPage />);
    await screen.findByText('sysop');

    expect(screen.queryByLabelText('Delete sysop')).toBeNull();
  });

  it('is offered inside the account dialog, and deletes the account it shows', async () => {
    const form = await openTheAccount();

    await userEvent.click(within(form).getByRole('button', { name: /delete user/i }));

    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith('user-25'));
  });

  it('still asks first, naming the account and requiring it typed back', async () => {
    const form = await openTheAccount();

    await userEvent.click(within(form).getByRole('button', { name: /delete user/i }));

    expect(confirmMock).toHaveBeenCalled();
    const asked = confirmMock.mock.calls[0][0] as { message: string; requireTypedConfirmation?: string };
    expect(asked.message).toContain('sysop');
    expect(asked.requireTypedConfirmation).toBe('sysop');
  });

  it('deletes nothing when the sysop cancels', async () => {
    confirmMock.mockResolvedValue(false);
    const form = await openTheAccount();

    await userEvent.click(within(form).getByRole('button', { name: /delete user/i }));

    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('closes the dialog afterwards - Update would recreate what was deleted', async () => {
    const form = await openTheAccount();

    await userEvent.click(within(form).getByRole('button', { name: /delete user/i }));

    await waitFor(() => expect(screen.queryByDisplayValue('sysop')).toBeNull());
  });

  it('offers nothing to delete while CREATING an account', async () => {
    getUsers.mockResolvedValue({ data: [account()] });
    wrap(<UsersPage />);
    await screen.findByText('sysop');

    await userEvent.click(screen.getByRole('button', { name: /add user/i }));

    // The create form is open when the username box is empty rather than
    // carrying an account - "Add User" itself appears twice by then (the
    // toolbar button and the dialog's own heading).
    await waitFor(() => expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /delete user/i })).toBeNull();
  });
});
