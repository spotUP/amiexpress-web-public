/**
 * Everything that can reach the sysop when he is not looking at the board.
 *
 * The pieces existed and were scattered: the browser subscription behind a
 * header badge, the VAPID server keys and the phone channels two thirds of the
 * way down Operator Chat Settings, and the per-event switches beside them. The
 * sysop, after hunting for them twice: "i think all notification settings
 * deserves its own menu entry its to spread out now hard to find".
 *
 * THE FORM IS NOT COPIED HERE. `OperatorChatSettingsPage` draws its three
 * notification sections under `only="notifications"`, so there is one form
 * writing those keys and one place to fix a bug in them. What this page adds
 * is the half that was never a form at all: THIS browser's subscription.
 */
import { useState } from 'react';
import { Bell, BellOff, BellRing, Send } from 'lucide-react';

import { apiClient } from '../api/client';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { OperatorChatSettingsPage } from './OperatorChatSettingsPage';

export function NotificationsPage() {
  const push = usePushNotifications();
  /** What the last test did, so pressing it is never silent. */
  const [tested, setTested] = useState<'drawn' | null>(null);
  /**
   * What the BOARD's own test push did.
   *
   * The local test answers "will this browser draw one at all". It cannot
   * answer "does one the board sends reach me", which is the half that
   * crosses the push service and the half a sysop otherwise cannot test
   * without asking a caller to page him.
   */
  const [pushed, setPushed] = useState<string | null>(null);
  /** Absent only in a consumer that stubs the hook without it. */
  const diagnostics = push.diagnostics;

  return (
    <div className="space-y-8">
      <section className="bg-surface-1 border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold text-content-primary flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Desktop notifications on this browser
        </h2>

        <p className="text-sm text-content-secondary">
          A caller paging you sends a notification to every browser that has
          been switched on here - with the admin closed, and on every machine
          you switch on separately. This setting belongs to the browser, not to
          the board, so it is one click per computer.
        </p>

        {!push.isSupported && (
          <p className="text-sm text-status-warn" data-testid="push-unsupported">
            This browser cannot receive push notifications.
          </p>
        )}

        {push.isSupported && push.permission === 'denied' && (
          <p className="text-sm text-status-warn" data-testid="push-denied">
            Your browser is blocking notifications for this site. Allow them in
            the browser&apos;s site settings, then reload this page.
          </p>
        )}

        {push.isSupported && push.permission !== 'denied' && (
          <div className="flex flex-wrap items-center gap-3">
            <span
              data-testid="push-state"
              className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm ${
                push.isSubscribed
                  ? 'border-status-ok/40 bg-status-ok/10 text-content-primary'
                  : 'border-status-warn/40 bg-status-warn/10 text-content-primary'
              }`}
            >
              {push.isSubscribed
                ? <><BellRing size={14} className="text-status-ok" /> On for this browser</>
                : <><BellOff size={14} className="text-status-warn" /> Off for this browser</>}
            </span>

            <button
              type="button"
              className={push.isSubscribed ? 'btn-secondary' : 'btn-primary'}
              disabled={push.loading}
              onClick={() => { void (push.isSubscribed ? push.unsubscribe() : push.subscribe()); }}
            >
              {push.loading
                ? 'Working...'
                : push.isSubscribed ? 'Switch off on this browser' : 'Switch on for this browser'}
            </button>

            {/* Proof, rather than a promise: the board draws a real
                notification through the same service worker a page uses. */}
            {/* Offered whether or not a subscription exists: this draws a
                notification locally, which answers "will I see one at all" -
                a different question from "is the board allowed to send me
                one", and the one a sysop is really asking. */}
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-1"
              onClick={async () => {
                setTested(null);
                setPushed(null);
                if (await push.testNotification()) setTested('drawn');
              }}
            >
              <Send size={14} /> Send a test notification
            </button>

            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-1"
              data-testid="push-test-from-board"
              onClick={async () => {
                setTested(null);
                setPushed('sending');
                try {
                  type TestPushResult = {
                    sent: number;
                    failed: number;
                    subscriptions: number;
                    reason?: string;
                    endpoints?: Array<{ tail: string; success: boolean }>;
                  };
                  const response = await apiClient.post<
                    { data?: TestPushResult } & Partial<TestPushResult>
                  >('/api/config/push/test', {});
                  // sendResponse wraps the payload in `data`; the client hands
                  // back the body as it came, so accept either shape.
                  const body = response?.data;
                  const result = body?.data ?? body;
                  if (!result) {
                    setPushed('The board did not answer.');
                  } else if (result.reason) {
                    setPushed(result.reason);
                  } else if ((result.sent ?? 0) > 0) {
                    // The board can be sending, successfully, to a
                    // subscription THIS browser no longer holds: a worker that
                    // re-registered at another scope, or site data cleared.
                    // The push service answers 201 for it either way, so every
                    // send "succeeds" and nothing is ever drawn. The endpoints
                    // are compared here rather than left to the eye.
                    const mine = diagnostics?.endpointTail ?? null;
                    const theirs = (result.endpoints ?? [])
                      .filter((e) => e.success)
                      .map((e) => e.tail);
                    const reachesThisBrowser = mine !== null && theirs.includes(mine);

                    setPushed(
                      `The board sent one to ${result.sent} of ${result.subscriptions} subscribed browsers. ` +
                        (mine === null
                          ? 'This browser holds no subscription of its own, so none of them was this one - ' +
                            'switch it off and on again above.'
                          : reachesThisBrowser
                            ? 'One of them was this browser. If nothing appeared, your operating system is ' +
                              'holding it back - check its notification settings for this browser.'
                            : 'None of them was THIS browser: the board is sending to a subscription this ' +
                              'browser no longer has, which the push service accepts and nothing draws. ' +
                              'Switch this browser off and on again above.'),
                    );
                  } else {
                    setPushed(
                      `The push service refused all ${result.subscriptions} subscriptions, so they were dropped. ` +
                        'Switch this browser off and on again above to re-subscribe.',
                    );
                  }
                } catch (error) {
                  setPushed(error instanceof Error ? error.message : 'The board could not send a test push.');
                }
              }}
            >
              <Send size={14} /> Send one from the board
            </button>
          </div>
        )}

        {push.error && (
          <p className="text-sm text-status-warn" data-testid="push-error">{push.error}</p>
        )}

        {tested === 'drawn' && !push.error && (
          <p className="text-sm text-content-secondary" data-testid="push-tested">
            Drawn by this browser. If nothing appeared, your operating system is
            holding it back - check its notification settings for this browser.
          </p>
        )}

        {pushed && (
          <p className="text-sm text-content-secondary" data-testid="push-from-board">
            {pushed === 'sending' ? 'Asking the board to send one...' : pushed}
          </p>
        )}

        {/* What this browser reports about itself.
            "The board sent one and nothing appeared" has four possible
            answers the sysop cannot see: no worker installed, a worker that
            never activated, a subscription the board holds and the browser
            does not, and a permission that is not what the page thinks. They
            are read here instead of asked for one at a time. */}
        {push.isSupported && diagnostics && (
          <dl
            className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-xs text-content-muted"
            data-testid="push-diagnostics"
          >
            <dt>Browser permission</dt>
            <dd className="text-content-secondary">{push.permission}</dd>

            <dt>Service worker</dt>
            <dd className="text-content-secondary">
              {diagnostics.workerState === 'none'
                ? 'none installed - nothing can be drawn'
                : diagnostics.workerState}
              {diagnostics.workerScope ? ` (${diagnostics.workerScope})` : ''}
            </dd>

            <dt>Subscription in this browser</dt>
            <dd className="text-content-secondary">
              {diagnostics.hasBrowserSubscription
                ? `yes, through ${diagnostics.endpointHost} (...${diagnostics.endpointTail})`
                : 'none - the board may still hold an old one'}
            </dd>
          </dl>
        )}
      </section>

      {/* The board-wide half: which events notify, the VAPID server keys, and
          the phone channels. One form, drawn from its own page. */}
      <OperatorChatSettingsPage only="notifications" />
    </div>
  );
}
