/**
 * Every notification setting behind one menu entry.
 *
 * They were spread over a header badge and three sections two thirds of the
 * way down Operator Chat Settings, and the sysop could not find them twice
 * running: "i think all notification settings deserves its own menu entry its
 * to spread out now hard to find".
 *
 * The form is NOT copied: `OperatorChatSettingsPage` draws the same three
 * sections under `only="notifications"`, and the chat tab draws the rest. Two
 * copies of a form writing the same keys is how they come to disagree.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

const push = {
  isSupported: true,
  isSubscribed: false,
  permission: 'default' as string,
  loading: false,
  error: null as string | null,
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  testNotification: vi.fn(),
};
vi.mock('../hooks/usePushNotifications', () => ({ usePushNotifications: () => push }));

// The board-wide form is a page of its own; this file is about the destination
// that gathers it, so the form is stubbed to what it is asked for.
vi.mock('../pages/OperatorChatSettingsPage', () => ({
  OperatorChatSettingsPage: ({ only }: { only?: string }) => (
    <div data-testid="settings-form">audience: {only ?? 'all'}</div>
  ),
}));

import { NotificationsPage } from '../pages/NotificationsPage';
import { NAV_GROUPS, navItemMatchesQuery } from '../components/AppShell/nav-config';

const wrapper = ({ children }: { children: ReactNode }) => <>{children}</>;

describe('the notifications destination', () => {
  beforeEach(() => {
    push.isSubscribed = false;
    push.permission = 'default';
    push.loading = false;
    push.error = null;
    vi.clearAllMocks();
  });

  it('is in the sidebar, and the words a sysop types reach it', () => {
    const item = NAV_GROUPS.flatMap(group => group.items).find(i => i.path === 'notifications');

    expect(item?.label).toBe('Notifications');
    for (const term of ['push', 'vapid', 'pushover', 'ntfy', 'desktop notifications']) {
      expect(navItemMatchesQuery(item!, term)).toBe(true);
    }
  });

  it('carries the board-wide settings without a second copy of the form', () => {
    render(<NotificationsPage />, { wrapper });

    expect(screen.getByTestId('settings-form').textContent).toContain('audience: notifications');
  });

  it('says whether this browser is on, and switches it on when asked', async () => {
    const user = userEvent.setup();
    render(<NotificationsPage />, { wrapper });

    expect(screen.getByTestId('push-state').textContent).toContain('Off for this browser');

    await user.click(screen.getByRole('button', { name: /switch on for this browser/i }));

    expect(push.subscribe).toHaveBeenCalledTimes(1);
  });

  it('offers the way back off, and a test, once it is on', async () => {
    push.isSubscribed = true;
    const user = userEvent.setup();
    render(<NotificationsPage />, { wrapper });

    expect(screen.getByTestId('push-state').textContent).toContain('On for this browser');

    await user.click(screen.getByRole('button', { name: /send a test notification/i }));
    expect(push.testNotification).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /switch off on this browser/i }));
    expect(push.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('explains a browser that has refused instead of offering a dead switch', async () => {
    push.permission = 'denied';
    render(<NotificationsPage />, { wrapper });

    await waitFor(() => expect(screen.getByTestId('push-denied')).toBeTruthy());
    expect(screen.queryByTestId('push-state')).toBeNull();
  });
});
