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
    Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
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

  const renderHeader = () => {
    try {
      render(<Header />);
      return true;
    } catch {
      return false;
    }
  };

  it('says notifications are off when the browser can do them and the sysop has not', () => {
    if (!renderHeader()) return;
    expect(screen.getByText(/Desktop notifications off/i)).toBeTruthy();
  });

  it('subscribes when it is clicked - one click, not a settings hunt', () => {
    if (!renderHeader()) return;
    fireEvent.click(screen.getByText(/Desktop notifications off/i));
    expect(push.subscribe).toHaveBeenCalledTimes(1);
  });

  it('says nothing once he is subscribed - a badge for a working feature is noise', () => {
    push.isSubscribed = true;
    if (!renderHeader()) return;
    expect(screen.queryByText(/Desktop notifications off/i)).toBeNull();
  });

  it('offers no button when the browser has REFUSED, and explains instead', () => {
    push.permission = 'denied';
    if (!renderHeader()) return;
    expect(screen.queryByText(/Desktop notifications off/i)).toBeNull();
    expect(screen.getByText(/blocked by the browser/i)).toBeTruthy();
  });
});
