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
  connect?: (apiUrl: string, token: string, onEvent: (payload: BbsEventPayload) => void) => { close: () => void };
  log?: (message: string) => void;
}

async function defaultLogin(apiUrl: string, username: string, password: string): Promise<string> {
  // POST /api/chat/login -> envelope { success, data: { token, user } }
  const res = await axios.post(`${apiUrl.replace(/\/$/, '')}/api/chat/login`, { username, password });
  const token = (res.data as { data?: { token?: string }; token?: string })?.data?.token ??
    (res.data as { token?: string })?.token;
  if (!token) throw new Error('chat login did not return a token');
  return token;
}

function defaultConnect(
  apiUrl: string,
  token: string,
  onEvent: (payload: BbsEventPayload) => void
): { close: () => void } {
  // Same session shape as LiveChat: chat token in handshake auth so the
  // backend builds a chatOnly BBS session (web/backend/src/index.ts).
  const socket: Socket = io(apiUrl, { auth: { token }, query: { chatOnly: 'true' } });
  socket.on('bbs:event', (payload: BbsEventPayload) => {
    try {
      onEvent(payload);
    } catch {
      // A bad payload must never kill the feed socket.
    }
  });
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
