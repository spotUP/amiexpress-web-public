/**
 * The sysop can ask the BOARD to send him a notification.
 *
 * Reported 2026-09-08: "desktop notifications still dont fire in the admin ui
 * or in the desktop or wherever i should see them" - while the board's own log
 * said it had sent one successfully. The page could only draw a notification
 * locally, which answers "will this browser show me one at all" and says
 * nothing about the half that crosses the push service. Without a caller
 * paging him, the sysop had no way to test that half.
 *
 * The button sends a real push through the same path an operator page takes,
 * and says what came back - including the two answers that are not failures of
 * delivery at all: no VAPID keys, and no subscribed browser.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

const post = vi.fn();

vi.mock('../src/api/client', () => ({
  apiClient: {
    post: (...args: unknown[]) => post(...args),
    get: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  },
}));

vi.mock('../src/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    isSupported: true,
    permission: 'granted',
    isSubscribed: true,
    loading: false,
    error: null,
    diagnostics: {
      workerState: 'active',
      workerScope: 'https://board.example/admin/',
      hasBrowserSubscription: true,
      endpointHost: 'fcm.googleapis.com',
      endpointTail: 'THIS-BROWSER',
    },
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    testNotification: vi.fn(async () => true),
    registerServiceWorker: vi.fn(),
  }),
}));

vi.mock('./OperatorChatSettingsPage', () => ({
  OperatorChatSettingsPage: () => null,
}));

vi.mock('../src/pages/OperatorChatSettingsPage', () => ({
  OperatorChatSettingsPage: () => null,
}));

vi.mock('../src/contexts/NotificationContext', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn(), confirm: vi.fn(async () => false) }),
  NotificationProvider: ({ children }: { children: ReactNode }) => children,
}));

const { NotificationsPage } = await import('../src/pages/NotificationsPage');

async function press(): Promise<void> {
  await userEvent.click(await screen.findByTestId('push-test-from-board'));
}

describe('a test push from the board', () => {
  beforeEach(() => post.mockReset());

  it('asks the board, and says how many browsers it reached', async () => {
    post.mockResolvedValue({
      data: { data: { sent: 2, failed: 0, subscriptions: 2, endpoints: [
        { tail: 'THIS-BROWSER', success: true },
        { tail: 'another-one1', success: true },
      ] } },
    });
    render(<NotificationsPage />);

    await press();

    expect(post).toHaveBeenCalledWith('/api/config/push/test', {});
    await waitFor(() =>
      expect(screen.getByTestId('push-from-board')).toHaveTextContent('sent one to 2 of 2 subscribed browsers')
    );
    expect(screen.getByTestId('push-from-board')).toHaveTextContent('One of them was this browser');
  });

  it('names the operating system path when the message did reach this browser', async () => {
    // "check its notification settings" is what cost an evening: macOS mutes a
    // browser at the system level while the site's permission still reads
    // granted, and nothing in the web platform reports it.
    const realAgent = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/152.0.0.0',
    });
    post.mockResolvedValue({
      data: { data: { sent: 1, failed: 0, subscriptions: 1, endpoints: [
        { tail: 'THIS-BROWSER', success: true },
      ] } },
    });

    try {
      render(<NotificationsPage />);
      await press();

      await waitFor(() =>
        expect(screen.getByTestId('push-from-board')).toHaveTextContent('Allow Notifications')
      );
    } finally {
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: realAgent });
    }
  });

  it('says when the board is sending to a subscription this browser does not have', async () => {
    // The push service answers 201 for an endpoint whose worker is gone, so
    // the board reports success and nothing is ever drawn. This is the case
    // that looked exactly like "macOS is suppressing it".
    post.mockResolvedValue({
      data: { data: { sent: 1, failed: 0, subscriptions: 1, endpoints: [
        { tail: 'a-stale-one1', success: true },
      ] } },
    });
    render(<NotificationsPage />);

    await press();

    await waitFor(() =>
      expect(screen.getByTestId('push-from-board')).toHaveTextContent('None of them was THIS browser')
    );
    expect(screen.getByTestId('push-from-board')).toHaveTextContent('Switch this browser off and on again');
  });

  it('says when the board has no keys to send with, rather than "failed"', async () => {
    post.mockResolvedValue({
      data: { data: { sent: 0, failed: 0, subscriptions: 0, reason: 'The board has no VAPID keys, so it cannot send a push at all.' } },
    });
    render(<NotificationsPage />);

    await press();

    await waitFor(() =>
      expect(screen.getByTestId('push-from-board')).toHaveTextContent('no VAPID keys')
    );
  });

  it('says when every subscription was refused, and what to do about it', async () => {
    post.mockResolvedValue({ data: { data: { sent: 0, failed: 1, subscriptions: 1 } } });
    render(<NotificationsPage />);

    await press();

    await waitFor(() =>
      expect(screen.getByTestId('push-from-board')).toHaveTextContent('re-subscribe')
    );
  });

  it('says so when the board answers with nothing at all', async () => {
    post.mockResolvedValue({ data: undefined });
    render(<NotificationsPage />);

    await press();

    await waitFor(() =>
      expect(screen.getByTestId('push-from-board')).toHaveTextContent('The board did not answer.')
    );
  });
});

describe('what this browser reports about itself', () => {
  it('names the worker, the permission and the browser subscription', async () => {
    post.mockResolvedValue({ data: { data: { sent: 1, failed: 0, subscriptions: 1 } } });
    render(<NotificationsPage />);

    const facts = await screen.findByTestId('push-diagnostics');

    // Four answers to "the board says it sent one and nothing appeared", read
    // off the page instead of asked for one at a time over chat.
    expect(facts).toHaveTextContent('granted');
    expect(facts).toHaveTextContent('active');
    expect(facts).toHaveTextContent('fcm.googleapis.com');
  });
});
