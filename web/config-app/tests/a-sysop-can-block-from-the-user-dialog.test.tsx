/**
 * "no user is blocked now but i see no way to block or unblock users in the
 * user edit dialog and i want to be able to click the entire row to edit a
 * user" - the sysop, 2026-09-14.
 *
 * Unblocking existed only as a row button that APPEARS ONLY WHEN THE ROW IS
 * ALREADY LOCKED - so there was nowhere to block anybody, and nowhere to look
 * to find out whether someone was. The account dialog is where a sysop goes
 * to change an account.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getUsers = vi.fn();
const updateUser = vi.fn();

vi.mock('../src/api/client', () => ({
  apiClient: {
    getUsers: (...a: unknown[]) => getUsers(...a),
    updateUser: (...a: unknown[]) => updateUser(...a),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    confirm: vi.fn().mockResolvedValue(true),
  }),
}));

import { UsersPage } from '../src/pages/UsersPage';

const user = (over: Record<string, unknown> = {}) => ({
  id: 'u-13', username: 'coffe', realname: 'Coffe', location: 'Sweden', phone: '',
  email: '', secLevel: 30, timeLimit: 60, expert: false, calls: 12,
  uploads: 0, downloads: 0, accountLocked: 0, invalidAttempts: 0, ...over,
});

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  getUsers.mockReset();
  updateUser.mockReset();
  updateUser.mockResolvedValue({});
});

describe('the account dialog', () => {
  it('opens from anywhere on the row, not only the pencil', async () => {
    getUsers.mockResolvedValue({ data: [user()] });
    wrap(<UsersPage />);
    const cell = await screen.findByText('coffe');

    await userEvent.click(cell);

    // The dialog is open on that account.
    await waitFor(() => expect(screen.getByDisplayValue('coffe')).toBeInTheDocument());
  });

  it('offers Blocked, showing the state the account is in', async () => {
    getUsers.mockResolvedValue({ data: [user({ accountLocked: 1 })] });
    wrap(<UsersPage />);
    await userEvent.click(await screen.findByText('coffe'));

    const blocked = await screen.findByRole('checkbox', { name: /blocked/i });
    expect(blocked).toBeChecked();
  });

  it('blocks an account that was not blocked', async () => {
    getUsers.mockResolvedValue({ data: [user()] });
    wrap(<UsersPage />);
    await userEvent.click(await screen.findByText('coffe'));

    const blocked = await screen.findByRole('checkbox', { name: /blocked/i });
    expect(blocked).not.toBeChecked();
    await userEvent.click(blocked);
    await userEvent.click(screen.getByRole('button', { name: /save|update/i }));

    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    expect(updateUser.mock.calls[0]![1]).toMatchObject({ accountLocked: 1 });
  });

  it('unblocking clears the failure count with it', async () => {
    getUsers.mockResolvedValue({ data: [user({ accountLocked: 1, invalidAttempts: 2 })] });
    wrap(<UsersPage />);
    await userEvent.click(await screen.findByText('coffe'));

    await userEvent.click(await screen.findByRole('checkbox', { name: /blocked/i }));
    await userEvent.click(screen.getByRole('button', { name: /save|update/i }));

    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    // The same pair the row's Unlock button sends, so the two cannot disagree.
    expect(updateUser.mock.calls[0]![1]).toMatchObject({ accountLocked: 0, invalidAttempts: 0 });
  });

  it('does not offer it when creating an account nobody has yet', async () => {
    getUsers.mockResolvedValue({ data: [] });
    wrap(<UsersPage />);
    await userEvent.click(await screen.findByRole('button', { name: /add user/i }));

    expect(screen.queryByRole('checkbox', { name: /blocked/i })).not.toBeInTheDocument();
  });
});
