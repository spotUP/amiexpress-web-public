/**
 * When the terminal tries to reconnect, and for how long.
 *
 * Reported 2026-08-31: "every time I wait a bit and do something else on the
 * computer and bring Chrome to front, the BBS page is stale, I can't type if
 * I don't reload it."
 *
 * The terminal used to give up. reconnectionAttempts was 5 on localhost and
 * 30 elsewhere, with a delay capped at 3s - so a dev session had about
 * ELEVEN SECONDS of reconnecting in it, and then socket.io stopped for good.
 * Nothing handled `reconnect_failed`, so the page kept showing the last
 * frame of the BBS with a dead socket underneath: every keystroke went
 * nowhere and only a reload brought it back.
 *
 * Eleven seconds is shorter than the thing it has to survive. The dev
 * backend restarts whenever a door changes and takes tens of seconds to come
 * up; a laptop that sleeps is out for as long as the sysop is away. The
 * limit was also backwards - the SHORTER budget was on localhost, which is
 * the only place the server restarts several times an hour.
 *
 * A page that is still open is a page that still wants its BBS. It retries
 * until it succeeds or the tab closes.
 */

/** Options for socket.io's client, kept in one place for both callers. */
export interface ReconnectPolicy {
  reconnection: true;
  /** Never stop while the page is open. */
  reconnectionAttempts: number;
  reconnectionDelay: number;
  reconnectionDelayMax: number;
  randomizationFactor: number;
}

/**
 * @param isDevelopment localhost, where the backend restarts often and is
 *                      reachable instantly - so retry faster, not fewer times.
 */
export function reconnectPolicy(isDevelopment: boolean): ReconnectPolicy {
  return {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    // How long the user waits after the server comes back. A local server is
    // back in one hop; a remote one deserves a gentler ceiling so a room full
    // of terminals does not stampede it.
    reconnectionDelayMax: isDevelopment ? 3000 : 10000,
    // Spread the stampede when a server restarts under many clients.
    randomizationFactor: 0.5,
  };
}

/**
 * Whether to stop waiting for the backoff and reconnect THIS INSTANT.
 *
 * Backoff is right while nothing has changed, but three things say the world
 * just changed and the wait is now pointless: the tab came to the front, the
 * machine came back online, or the page was restored from the back/forward
 * cache. Reconnecting on those turns "bring Chrome to front and it is dead"
 * into "bring Chrome to front and it is already back".
 *
 * @param connected  socket.connected
 * @param pageVisible document.visibilityState === 'visible'
 * @param online     navigator.onLine
 */
export function shouldReconnectNow(
  connected: boolean,
  pageVisible: boolean,
  online: boolean
): boolean {
  if (connected) return false;
  // Reconnecting while the tab is hidden buys nothing the backoff would not
  // get to anyway, and browsers throttle it regardless.
  if (!pageVisible) return false;
  // No network yet: let the 'online' event bring us back rather than burning
  // an attempt that cannot succeed.
  return online;
}
