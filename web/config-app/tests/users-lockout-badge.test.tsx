/**
 * A locked account is visible in the admin, and the admin can unlock it.
 *
 * The report that started this: a caller failed his password, got locked
 * out, and the Users page showed no sign of it - no badge, no count, no
 * button. The backend carries accountLocked/invalidAttempts on each row
 * now; this pins that the page renders them and that Unlock sends the
 * explicit zeroes (absent would preserve, which unblocks nothing).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const USERS = [
  {
    id: 'user-14', username: 'dalton', realname: 'Dalton', email: '', secLevel: 30,
    timeLimit: 60, calls: 12, uploads: 0, downloads: 3, expert: false, ansi: true,
    firstLogin: new Date(), accountLocked: 1, invalidAttempts: 0,
  },
  {
    id: 'user-26', username: 'strawa', realname: '', email: '', secLevel: 30,
    timeLimit: 60, calls: 4, uploads: 0, downloads: 0, expert: false, ansi: true,
    firstLogin: new Date(), accountLocked: 0, invalidAttempts: 2,
  },
  {
    id: 'user-23', username: 'spot', realname: 'Spot', email: '', secLevel: 255,
    timeLimit: -1, calls: 400, uploads: 10, downloads: 10, expert: true, ansi: true,
    firstLogin: new Date(), accountLocked: 0, invalidAttempts: 0,
  },
];

const getUsers = vi.fn(async () => ({ success: true, data: USERS }));
const updateUser = vi.fn(async (_id: string, _updates: unknown) => ({ success: true, data: {} }));
const confirmMock = vi.fn(async (_opts: unknown) => true);

vi.mock('../src/api/client', () => ({
  apiClient: {
    getUsers: () => getUsers(),
    updateUser: (id: string, updates: unknown) => updateUser(id, updates),
    createUser: vi.fn(async () => ({ success: true, data: {} })),
    deleteUser: vi.fn(async () => ({ success: true, data: {} })),
  },
}));

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: confirmMock }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}));

const { UsersPage } = await import('../src/pages/UsersPage');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UsersPage />
    </QueryClientProvider>
  );
}

describe('the users list lockout state', () => {
  beforeEach(() => {
    getUsers.mockClear();
    updateUser.mockClear();
    confirmMock.mockClear();
  });

  it('badges a locked account and offers Unlock on its row', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('dalton')).toBeTruthy());

    expect(screen.getByText('Locked')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unlock dalton' })).toBeTruthy();
  });

  it('shows a running fail count short of a lock', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('strawa')).toBeTruthy());

    expect(screen.getByText('2 fails')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unlock strawa' })).toBeTruthy();
  });

  it('shows nothing alarming on a clean account', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('spot')).toBeTruthy());

    const row = screen.getByText('spot').closest('tr')!;
    expect(within(row).queryByText('Locked')).toBeNull();
    expect(within(row).queryByRole('button', { name: /Unlock/ })).toBeNull();
  });

  it('unlock sends explicit zeroes after confirmation', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('dalton')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Unlock dalton' }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(confirmMock.mock.calls[0][0]).toMatchObject({ title: 'Unlock account' });
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith(
      'user-14', { accountLocked: 0, invalidAttempts: 0 }
    ));
  });
});
