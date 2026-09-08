/**
 * Page title, the system pill, the waiting-callers badge and the density
 * control.
 *
 * The pill is honest about where its numbers come from: Live means the socket
 * is connected and events are arriving, and it shows how long ago the last one
 * was; Polling means the numbers are only as fresh as the last poll.
 */

import { Link, useLocation } from 'react-router-dom';
import { AlignJustify, Rows, PhoneCall, BellOff } from 'lucide-react';
import { useDensity } from '../../hooks/useDensity';
import { NODE_BACKGROUND_POLL_MS, useNodeStatus, useSessionStats } from '../../hooks/useBoardData';
import { useRealtime } from '../../realtime/RealtimeProvider';
import { formatClockTime, formatDuration, formatRelativeTime } from '../../lib/format';
import { StatusDot } from '../ui/StatusDot';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { navItemForPath } from './nav-config';

export function Header() {
  const location = useLocation();
  const { density, toggleDensity } = useDensity();
  const { data: nodeStatus, dataUpdatedAt, isError } = useNodeStatus(NODE_BACKGROUND_POLL_MS);
  const { data: sessionStats } = useSessionStats();
  const { status, lastEventAt, pendingPages } = useRealtime();

  const item = navItemForPath(location.pathname);
  const onlineNodes = nodeStatus?.onlineNodes ?? 0;
  const totalNodes = nodeStatus?.totalNodes ?? 0;
  const uptime = sessionStats?.data?.uptime;

  const push = usePushNotifications();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface-1 px-5">
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold text-content-primary">
          {item?.label ?? 'Administration'}
        </h1>
        {item?.description && (
          <p className="truncate text-xs text-content-muted">{item.description}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {/* A caller waiting on the sysop follows you around the app. */}
        {pendingPages > 0 && (
          <Link
            to="/admin/operator-chat"
            className="flex h-control items-center gap-2 rounded border border-status-warn/40 bg-status-warn/10 px-3 text-xs text-content-primary transition-colors hover:bg-status-warn/20"
          >
            <PhoneCall size={14} aria-hidden="true" className="text-status-warn" />
            {pendingPages === 1 ? '1 caller waiting' : `${pendingPages} callers waiting`}
          </Link>
        )}

        {/*
          * DESKTOP NOTIFICATIONS, OFF BY DEFAULT AND INVISIBLE UNTIL NOW.
          *
          * The board has sent a Web Push on every sysop page since the
          * feature shipped, and the live board had ZERO subscriptions - so
          * every one was a no-op. The switch existed, buried in Operator Chat
          * Settings under "Notification Settings", and the sysop reasonably
          * concluded the feature did not exist: "can the browser push
          * notifications be made browser wide so i dont have to keep the
          * admin page open".
          *
          * It already is browser-wide - a service worker push arrives with
          * every tab closed. It just had to be switched on once. A board with
          * no subscription looks exactly like a broken one from the sysop's
          * chair, so the state now says so where he cannot miss it, beside
          * the callers-waiting pill that follows him around the app.
          *
          * Shown ONLY when the browser can do it and he has not enabled it.
          * Once subscribed this disappears - a permanent badge for a working
          * feature is noise.
          */}
        {push.isSupported && !push.isSubscribed && push.permission !== 'denied' && (
          <button
            type="button"
            onClick={() => { void push.subscribe(); }}
            disabled={push.loading}
            title="Get a desktop notification when a caller pages you, even with this page closed"
            className="flex h-control items-center gap-2 rounded border border-status-warn/40 bg-status-warn/10 px-3 text-xs text-content-primary transition-colors hover:bg-status-warn/20 disabled:opacity-50"
          >
            <BellOff size={14} aria-hidden="true" className="text-status-warn" />
            Desktop notifications off
          </button>
        )}

        {/* Permission refused at the browser level - we cannot fix that from
            here, and a button that cannot work is worse than a sentence. */}
        {push.isSupported && push.permission === 'denied' && (
          <span
            title="Your browser is blocking notifications for this site. Allow them in the browser's site settings, then reload."
            className="flex h-control items-center gap-2 rounded border border-border bg-surface-2 px-3 text-xs text-content-muted"
          >
            <BellOff size={14} aria-hidden="true" />
            Notifications blocked by the browser
          </span>
        )}

        <div className="flex items-center gap-3 rounded border border-border bg-surface-2 px-3 py-1.5 text-xs">
          {/* Honest about where the numbers come from: Live means the socket
              is up and events are arriving, Polling means it is not. */}
          <StatusDot
            tone={status === 'live' ? 'ok' : status === 'reconnecting' ? 'warn' : isError ? 'danger' : 'neutral'}
            label={status === 'live' ? 'Live' : status === 'reconnecting' ? 'Reconnecting' : 'Polling'}
          />
          {status === 'live' && lastEventAt !== null && (
            <span className="text-content-muted">{formatRelativeTime(lastEventAt)}</span>
          )}
          <span className="text-content-muted">|</span>
          <span className="text-content-secondary">
            Nodes <span className="font-mono text-content-primary">{onlineNodes}</span>
            <span className="text-content-muted"> of </span>
            <span className="font-mono text-content-primary">{totalNodes}</span>
          </span>
          {uptime !== undefined && (
            <>
              <span className="text-content-muted">|</span>
              <span className="text-content-secondary">
                Uptime <span className="font-mono text-content-primary">{formatDuration(uptime)}</span>
              </span>
            </>
          )}
          {dataUpdatedAt > 0 && (
            <>
              <span className="text-content-muted">|</span>
              <span className="font-mono text-content-muted">{formatClockTime(dataUpdatedAt)}</span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={toggleDensity}
          className="flex h-control items-center gap-2 rounded border border-border bg-surface-2 px-3 text-xs text-content-secondary transition-colors hover:bg-surface-3 hover:text-content-primary"
          aria-pressed={density === 'compact'}
          title={density === 'compact' ? 'Switch to comfortable rows' : 'Switch to compact rows'}
        >
          {density === 'compact' ? <AlignJustify size={14} aria-hidden="true" /> : <Rows size={14} aria-hidden="true" />}
          {density === 'compact' ? 'Compact' : 'Comfortable'}
        </button>
      </div>
    </header>
  );
}
