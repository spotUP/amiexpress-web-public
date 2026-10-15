/**
 * The web terminal must not give up reconnecting.
 *
 * Reported 2026-08-31: "every time I wait a bit and do something else on the
 * computer and bring Chrome to front, the BBS at localhost:3001 is stale, I
 * can't type if I don't reload it."
 *
 * socket.io was given `reconnectionAttempts: isDevelopment ? 5 : 30` with the
 * delay capped at 3s, so a localhost session had roughly ELEVEN SECONDS of
 * reconnecting in it before the client stopped for good. Nothing handled
 * `reconnect_failed`, so the page went on showing the last frame of the BBS
 * over a dead socket - every keystroke dropped, only a reload fixing it.
 *
 * Eleven seconds is shorter than what it has to outlast: the dev backend
 * restarts whenever a door file changes and takes tens of seconds to come
 * back. The limit was also the wrong way round - the shorter budget was on
 * localhost, the one place the server restarts several times an hour.
 *
 * This is the policy the BBSTerminal component reads. It lives in
 * packages/terminal, which no CI job builds, so it is pinned from the
 * backend suite - the one that actually runs.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  reconnectPolicy,
  shouldReconnectNow,
} from '../../../../packages/terminal/src/utils/reconnect-policy';

const TERMINAL_SRC = path.resolve(
  __dirname, '../../../../packages/terminal/src/components/BBSTerminal.tsx'
);

describe('how long the terminal keeps trying', () => {
  it('never stops while the page is open', () => {
    // The whole bug in one assertion.
    expect(reconnectPolicy(true).reconnectionAttempts).toBe(Infinity);
    expect(reconnectPolicy(false).reconnectionAttempts).toBe(Infinity);
  });

  it('outlasts a dev backend restart', () => {
    // A restart is tens of seconds. Attempts times the delay ceiling has to
    // be far more than that, which only "forever" actually guarantees.
    const dev = reconnectPolicy(true);
    const budgetMs = dev.reconnectionAttempts * dev.reconnectionDelayMax;
    expect(budgetMs).toBeGreaterThan(60_000);
  });

  it('comes back fast locally and gently over the network', () => {
    expect(reconnectPolicy(true).reconnectionDelayMax)
      .toBeLessThan(reconnectPolicy(false).reconnectionDelayMax);
    expect(reconnectPolicy(false).randomizationFactor).toBeGreaterThan(0);
  });
});

describe('reconnecting the instant the tab comes back', () => {
  it('reconnects when a visible, online tab has a dead socket', () => {
    expect(shouldReconnectNow(false, true, true)).toBe(true);
  });

  it('leaves a working socket alone', () => {
    expect(shouldReconnectNow(true, true, true)).toBe(false);
  });

  it('does not bother while the tab is hidden', () => {
    // Nothing is waiting to be typed, and browsers throttle it anyway.
    expect(shouldReconnectNow(false, false, true)).toBe(false);
  });

  it('waits for the network rather than burning an attempt', () => {
    expect(shouldReconnectNow(false, true, false)).toBe(false);
  });
});

describe('the component actually uses it', () => {
  // A policy nobody reads is no better than the constants it replaced.
  const source = fs.readFileSync(TERMINAL_SRC, 'utf8');

  it('builds its socket options from the policy', () => {
    expect(source).toContain('...reconnectPolicy(isDevelopment)');
    expect(source).not.toContain('reconnectionAttempts: isDevelopment ? 5 : 30');
  });

  it('wakes the socket when the tab comes to the front', () => {
    expect(source).toContain('shouldReconnectNow(');
    for (const event of ['focus', 'online', 'pageshow']) {
      expect({ event, listens: source.includes(`addEventListener('${event}', wakeSocket)`) })
        .toEqual({ event, listens: true });
    }
  });

  it('starts over rather than sitting dead if it ever does give up', () => {
    expect(source).toContain("socket.io.on('reconnect_failed'");
  });

  it('removes the wake listeners when it unmounts', () => {
    for (const event of ['focus', 'online', 'pageshow']) {
      expect({ event, cleaned: source.includes(`removeEventListener('${event}', wakeSocket)`) })
        .toEqual({ event, cleaned: true });
    }
  });
});
