/**
 * WHO IS CALLING - the one question a socket event asks before it acts.
 *
 * A web caller's socket is registered for every event the moment it
 * connects, long before anyone has logged in: the board makes a session at
 * connect (index.ts) so the login prompt has somewhere to live. "There is a
 * session" therefore says nothing about who is on the other end. An event
 * that acts for a caller - writes a chat line under a name, joins a room,
 * finishes an upload - must ask whether this socket's session has LOGGED ON,
 * and must take the caller from the server's own session, never from an id
 * the client sends (open-surface audit, 2026-10-04).
 *
 * Registered through these helpers, an event a visitor sends before logon is
 * dropped before its handler runs, and the handler is handed the session it
 * may act for.
 */
import type { Socket } from 'socket.io';
import type { BBSSession } from '../index';
import { getSession } from './session-manager';

/** The full sysop's level: the HTTP routes' requireSysop asks the same. */
export const SYSOP_LEVEL = 255;

/** This socket's session, when its caller has logged on; undefined otherwise. */
export function loggedOnCaller(socket: Pick<Socket, 'id'>): BBSSession | undefined {
  const session = getSession(socket.id);
  const id = (session?.user as { id?: unknown } | undefined)?.id;
  return id === undefined || id === null || id === '' ? undefined : session;
}

type CallerHandler = (session: BBSSession, ...args: any[]) => unknown;

/**
 * `socket.on(event, ...)` for an event only a logged-on caller may send. The
 * handler gets that caller's session first, then the event's own arguments.
 */
export function onCaller(socket: Socket, event: string, handler: CallerHandler): void {
  socket.on(event, (...args: any[]) => {
    const session = loggedOnCaller(socket);
    if (!session) return undefined;
    // Federated livechat (services/chat-federation): when the board has the
    // toggle on, the bridge consumes the room:* / chat:* events it owns.
    if (legacyChatGate?.(socket, session, event, args[0])) return undefined;
    return handler(session, ...args);
  });
}

type LegacyChatGate = (socket: Socket, session: BBSSession, event: string, data: unknown) => boolean;
let legacyChatGate: LegacyChatGate | null = null;

/** Install the federated-chat gate (index.ts, once). Returns true to consume an event. */
export function setLegacyChatGate(gate: LegacyChatGate | null): void {
  legacyChatGate = gate;
}

/**
 * `socket.on(event, ...)` for an event only a caller of at least `minLevel`
 * may send - the sysop's tools. Refused quietly, as a visitor's is.
 */
export function onLevel(socket: Socket, event: string, minLevel: number, handler: CallerHandler): void {
  socket.on(event, (...args: any[]) => {
    const session = loggedOnCaller(socket);
    const level = Number((session?.user as { secLevel?: unknown } | undefined)?.secLevel ?? 0);
    if (!session || level < minLevel) return undefined;
    return handler(session, ...args);
  });
}
