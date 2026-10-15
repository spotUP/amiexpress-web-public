/**
 * A SYSOP MUST BE ABLE TO SEE THAT DESKTOP NOTIFICATIONS ARE OFF.
 *
 * The board has sent a Web Push on every sysop page since the feature
 * shipped. The live board had ZERO subscriptions, so every one of them was a
 * no-op, and the switch was buried in Operator Chat Settings under
 * "Notification Settings". The sysop concluded the feature did not exist:
 * "can the browser push notifications be made browser wide so i dont have to
 * keep the admin page open to see them?"
 *
 * It already is browser-wide - a service worker push arrives with every tab
 * closed. It only had to be switched on once. A board with no subscription is
 * indistinguishable from a broken one unless the admin says so, so the state
 * lives in the header now, beside the callers-waiting pill.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const push = {
  isSupported: true,
  isSubscribed: false,
  permission: 'default' as string,
  loading: false,
  subscribe: vi.fn(),
};

vi.mock('../hooks/usePushNotifications', () => ({
  usePushNotifications: () => push,
}));

// Every context the Header reaches for. Stubbed rather than provided because
// this file is about ONE control; a real provider tree here would test the
// providers. The first version of this test mocked only the router, the render
// threw `useAuth must be used within an AuthProvider`, a try/catch swallowed
// it, and all four assertions became unreachable while the suite reported
// green. That is why there is no try/catch below.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>{children}</a>
    ),
    useLocation: () => ({ pathname: '/admin' }),
  };
});
vi.mock('../hooks/useDensity', () => ({
  useDensity: () => ({ density: 'comfortable', toggleDensity: vi.fn() }),
}));
vi.mock('../hooks/useBoardData', () => ({
  NODE_BACKGROUND_POLL_MS: 5000,
  useNodeStatus: () => ({ data: [], dataUpdatedAt: Date.now(), isError: false }),
  useSessionStats: () => ({ data: undefined }),
}));
vi.mock('../realtime/RealtimeProvider', () => ({
  useRealtime: () => ({ status: 'live', lastEventAt: Date.now(), pendingPages: 0 }),
}));

import { Header } from '../components/AppShell/Header';

describe('the desktop-notification switch in the header', () => {
  beforeEach(() => {
    push.isSupported = true;
    push.isSubscribed = false;
    push.permission = 'default';
    push.loading = false;
    push.subscribe.mockClear();
  });

  // No try/catch. A render that throws must FAIL the test - the first version
  // of this file swallowed `useAuth must be used within an AuthProvider` and
  // reported green with every assertion unreachable.
  const renderHeader = () => render(<Header />);

  it('says notifications are off when the browser can do them and the sysop has not', () => {
    renderHeader();
    expect(screen.getByText(/Desktop notifications off/i)).toBeTruthy();
  });

  /*
   * THE BADGE SURVIVES ITS OWN CLICK.
   *
   * It used to subscribe in place and then remove itself, so the sysop's click
   * made the control vanish under the cursor with nothing confirming what had
   * happened - and he had to click twice before anything reached the server:
   * "the button should not be removed when i click it".
   */
  it('is still there after it is clicked, and leads to the notifications page', () => {
    renderHeader();
    const badge = screen.getByText(/Desktop notifications off/i).closest('a');

    expect(badge?.getAttribute('href')).toBe('/admin/notifications');

    fireEvent.click(badge!);

    expect(screen.getByText(/Desktop notifications off/i)).toBeTruthy();
  });

  it('says ON once he is subscribed, rather than going quiet', () => {
    push.isSubscribed = true;
    renderHeader();

    expect(screen.getByText(/Desktop notifications on/i)).toBeTruthy();
    expect(screen.queryByText(/Desktop notifications off/i)).toBeNull();
  });

  it('offers no switch when the browser has REFUSED, and explains instead', () => {
    push.permission = 'denied';
    renderHeader();

    expect(screen.queryByText(/Desktop notifications off/i)).toBeNull();
    expect(screen.getByText(/blocked by the browser/i)).toBeTruthy();
  });
});
