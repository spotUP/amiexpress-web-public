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

import { usePushNotifications } from '../hooks/usePushNotifications';
import { OperatorChatSettingsPage } from './OperatorChatSettingsPage';

export function NotificationsPage() {
  const push = usePushNotifications();
  /** What the last test did, so pressing it is never silent. */
  const [tested, setTested] = useState<'drawn' | null>(null);

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
                if (await push.testNotification()) setTested('drawn');
              }}
            >
              <Send size={14} /> Send a test notification
            </button>
          </div>
        )}

        {push.error && (
          <p className="text-sm text-status-warn" data-testid="push-error">{push.error}</p>
        )}

        {tested === 'drawn' && !push.error && (
          <p className="text-sm text-content-secondary" data-testid="push-tested">
            Sent. If nothing appeared, your operating system is holding it back -
            check its notification settings for this browser.
          </p>
        )}
      </section>

      {/* The board-wide half: which events notify, the VAPID server keys, and
          the phone channels. One form, drawn from its own page. */}
      <OperatorChatSettingsPage only="notifications" />
    </div>
  );
}
