/**
 * Live WHIP feed: pure formatter plus thin socket wiring.
 *
 * formatWhipEvent is pure (payload in, Discord line or null out) and fully
 * tested. startFeed does login -> socket -> channel post and stays thin and
 * untested (no live Discord/socket in tests).
 *
 * The board broadcasts every door event as 'bbs:event'; WHIP door activity
 * arrives as type 'custom_door_event' with data.doorName 'WHIP' (see
 * Doors/whip/BBS_EVENTS.md for the 9 event types). Everything else returns
 * null and never reaches the feed channel.
 */

import axios from 'axios';
import { io, type Socket } from 'socket.io-client';

import { BOARD_HTTP_TIMEOUT_MS } from './http';

export interface BbsEventPayload {
  type: string;
  username: string;
  nodeId: number;
  timestamp: number;
  data?: Record<string, unknown>;
}

/** The 9 event types the WHIP door emits (Doors/whip/BBS_EVENTS.md). */
const WHIP_EVENT_TYPES = new Set([
  'project_created',
  'project_updated',
  'project_deleted',
  'task_created',
  'task_updated',
  'task_deleted',
  'task_moved',
  'task_completed',
  'achievement_unlocked',
]);

/**
 * Format one bbs:event payload as a Discord line, or null when the payload
 * is not WHIP door activity (wrong type, wrong door, unknown event).
 */
export function formatWhipEvent(payload: BbsEventPayload | null | undefined): string | null {
  if (!payload || payload.type !== 'custom_door_event') return null;
  const data = payload.data;
  if (!data || typeof data !== 'object') return null;
  const doorName = data['doorName'];
  if (typeof doorName !== 'string' || doorName.toUpperCase() !== 'WHIP') return null;
  const eventType = data['eventType'];
  if (typeof eventType !== 'string' || !WHIP_EVENT_TYPES.has(eventType)) return null;
  const message = data['message'];
  if (typeof message !== 'string' || !message) return null;
  return `**[WHIP]** ${payload.username}: ${message}`;
}

export interface FeedDeps {
  apiUrl: string;
  bbsUser: string;
  bbsPassword: string;
  post: (line: string) => Promise<void> | void;
  login?: (apiUrl: string, username: string, password: string) => Promise<string>;
  connect?: (
    apiUrl: string,
    token: string,
    onEvent: (payload: BbsEventPayload) => void,
    onDisconnect?: (reason: string) => void,
    /**
     * The socket really connected. Not the same thing as connect() having
     * returned a handle: socket.io answers a refused board with
     * connect_error, so a handle is only an attempt.
     */
    onConnected?: () => void
  ) => { close: () => void };
  log?: (message: string) => void;
}

async function defaultLogin(apiUrl: string, username: string, password: string): Promise<string> {
  // POST /api/chat/login -> envelope { success, data: { token, user } }
  // Bounded: an untimed login against a half-booted board hangs forever
  // and wedges the retry loop below in silence (seen live 2026-09-10).
  const res = await axios.post(`${apiUrl.replace(/\/$/, '')}/api/chat/login`, { username, password }, { timeout: BOARD_HTTP_TIMEOUT_MS });
  const token = (res.data as { data?: { token?: string }; token?: string })?.data?.token ??
    (res.data as { token?: string })?.token;
  if (!token) throw new Error('chat login did not return a token');
  return token;
}

function defaultConnect(
  apiUrl: string,
  token: string,
  onEvent: (payload: BbsEventPayload) => void,
  onDisconnect?: (reason: string) => void,
  onConnected?: () => void
): { close: () => void } {
  // Same session shape as LiveChat: chat token in handshake auth so the
  // backend builds a chatOnly BBS session (web/backend/src/index.ts).
  // reconnection:false - the resilient loop above owns recovery (fresh
  // token per attempt); the client's own redial would double-socket.
  const socket: Socket = io(apiUrl, { auth: { token }, query: { chatOnly: 'true' }, reconnection: false });
  if (onConnected) {
    socket.on('connect', () => {
      try {
        onConnected();
      } catch {
        // Reporting the state must never kill the feed socket.
      }
    });
  }
  socket.on('bbs:event', (payload: BbsEventPayload) => {
    try {
      onEvent(payload);
    } catch {
      // A bad payload must never kill the feed socket.
    }
  });
  if (onDisconnect) {
    socket.on('disconnect', (reason: string) => {
      try {
        onDisconnect(reason);
      } catch {
        // Disconnect handling must never throw into the socket.
      }
    });
    // A socket that never connects emits connect_error, never
    // disconnect - without this the loop waits forever on a dead
    // board (seen live 2026-09-10: retries silently stopped).
    socket.on('connect_error', (err: Error) => {
      try {
        onDisconnect(`connect_error: ${err?.message ?? err}`);
      } catch {
        // Same as above.
      }
    });
  }
  return { close: () => void socket.close() };
}

export async function startFeed(deps: FeedDeps): Promise<{ stop: () => void }> {
  const log = deps.log ?? (() => {});
  const login = deps.login ?? defaultLogin;
  const connect = deps.connect ?? defaultConnect;
  const token = await login(deps.apiUrl, deps.bbsUser, deps.bbsPassword);
  log('[whip-bot] Feed logged in to chat, connecting socket');
  const handle = connect(deps.apiUrl, token, (payload) => {
    const line = formatWhipEvent(payload);
    if (line) {
      void Promise.resolve(deps.post(line)).catch((err) => log(`[whip-bot] Feed post failed: ${String(err)}`));
    }
  });
  return { stop: () => handle.close() };
}

export type FeedConnState = 'connecting' | 'live' | 'retrying';

export interface ResilientFeedOpts {
  /** First backoff step (default 5000). Tests pass 1. */
  initialDelayMs?: number;
  /** Backoff cap (default 60000). */
  maxDelayMs?: number;
  onState?: (state: FeedConnState, detail?: string) => void;
}

/**
 * Feed with a pulse (2026-09-10): startFeed connects once and a board
 * restart after the bot leaves it feeding nothing ("bot stays up").
 * This loops login -> connect until stopped: a disconnect (or a login
 * against a board that is still booting) waits out a backoff and
 * re-logs-in for a fresh token. Returns the handle synchronously so
 * stop() works even before the first connection; first live connection
 * arrives as onState('live').
 */
export function startFeedResilient(
  deps: FeedDeps,
  opts?: ResilientFeedOpts
): { stop: () => void } {
  const log = deps.log ?? (() => {});
  const login = deps.login ?? defaultLogin;
  const connect = deps.connect ?? defaultConnect;
  const initial = opts?.initialDelayMs ?? 5000;
  const cap = opts?.maxDelayMs ?? 60000;
  const onState = opts?.onState ?? (() => {});
  let stopped = false;
  let handle: { close: () => void } | null = null;
  let failures = 0;
  let wake: (() => void) | null = null;

  const onEvent = (payload: BbsEventPayload) => {
    const line = formatWhipEvent(payload);
    if (line) {
      void Promise.resolve(deps.post(line)).catch((err) => log(`[whip-bot] Feed post failed: ${String(err)}`));
    }
  };

  const sleep = (ms: number) =>
    new Promise<void>((r) => {
      const t = setTimeout(() => { wake = null; r(); }, ms);
      wake = () => { clearTimeout(t); wake = null; r(); };
    });

  const stop = () => {
    stopped = true;
    wake?.();
    handle?.close();
    handle = null;
  };

  void (async () => {
    while (!stopped) {
      onState(failures === 0 ? 'connecting' : 'retrying');
      try {
        const token = await login(deps.apiUrl, deps.bbsUser, deps.bbsPassword);
        if (stopped) return;
        const dropped = await new Promise<string | null>((resolve) => {
          // THE FEED IS LIVE EVERY TIME IT IS LIVE. `onState('live')` used to
          // be latched behind a `liveDone` flag and `failures` was never put
          // back to zero, so the FIRST drop pinned the admin's bot page at
          // "retrying" for the life of the process and the backoff climbed to
          // its cap and stayed there - while the feed was connected and
          // delivering. A real connection says so, and clears the debt of
          // the attempts it took to get here.
          const h = connect(deps.apiUrl, token, onEvent, (reason) => resolve(reason), () => {
            failures = 0;
            onState('live');
          });
          handle = h;
          wake = () => resolve(null);
        });
        wake = null;
        handle = null;
        if (stopped) return;
        failures++;
        const wait = Math.min(cap, initial * 2 ** (failures - 1));
        log(`[whip-bot] Feed socket dropped (${dropped ?? 'closed'}), retrying in ${Math.round(wait / 1000)}s`);
        onState('retrying', dropped ?? undefined);
        await sleep(wait);
      } catch (err) {
        if (stopped) return;
        failures++;
        const wait = Math.min(cap, initial * 2 ** (failures - 1));
        log(`[whip-bot] Feed attempt failed (${(err as Error)?.message ?? err}), retrying in ${Math.round(wait / 1000)}s`);
        onState('retrying', (err as Error)?.message);
        await sleep(wait);
      }
    }
  })();

  return { stop };
}
