/**
 * THE SESSION EMITTER REGISTRY - one way to find the object that reaches a
 * given session, whatever transport that session arrived on.
 *
 * Task TP-10 of `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`.
 *
 * WHY THIS FILE EXISTS. Every cross-session push on this board - the sysop's
 * kick, an operator page, an internode chat invite, a room kick or mute, an
 * OLM - resolved its target through the io namespace's own socket map. That map
 * holds socket.io sockets and nothing else, so a telnet or SSH caller was never
 * in it: the sysop was told "Could not find socket for node N" and the caller
 * stayed online, the OLM's immediate branch wrote into a room nobody was in,
 * and an operator page reached a browser or nobody at all.
 *
 * A telnet/SSH session's socket-shaped object is the connection emitter built
 * in `server/transport-session.ts` (`server/connection-emitter.ts`), which
 * lives on the connection and, until this module, in no map at all. A WEB
 * session's is the io namespace's socket for `session.socketId` - NOT
 * `session.socket`, which is assigned once (`server/socket-handlers.ts:175`)
 * and is the DEAD socket after a reconnect, because the restore updates
 * `socketId` and calls `setSession` (`server/auth-socket-handlers.ts:160-161`)
 * without reassigning it. This module knows both, and it is the ONLY place in
 * `web/backend/src` that reaches into that map - a grep for it is a
 * single-hit gate (TP-15).
 *
 * A LOOKUP FACADE, NOT A SECOND STORE. The sessions themselves stay where they
 * have always been: `sessions` (nodeId -> session) and `userSessions`
 * (userId -> session) in `server/session-manager.ts`, both populated for telnet
 * today. The only thing this module adds is a reference from the SESSION to its
 * connection emitter, held on the session for the reason
 * `utils/petscii-session-model.ts:44` gives for the PETSCII model: a connection
 * can be handed a new session mid-flight, a web session survives a socket
 * replacement, and the session object is the one thing both ends already hold.
 *
 * Modelled on the one mechanism that already crossed transports: the OLM queue
 * (`handlers/transfer/olm.handler.ts`) mutates the target BBSSession directly
 * and lets the recipient's own emitter drain it. This is that idea with the
 * emitter made findable, so the IMMEDIATE branch - the one taken when the
 * recipient is at the command prompt, the common case - can cross too.
 */
import type { Server as IOServer, Socket } from "socket.io";
import type { BBSSession } from "../index";
import type { LoginEmitter } from "../types/login-emitter";
import type { TransportEmitter } from "./transport-adapter";
import { sessions, userSessions } from "./session-manager";

/**
 * What a resolved session is reached through.
 *
 * `LoginEmitter` (`types/login-emitter.ts`) is the surface socket.io's `Socket`
 * and the telnet/SSH `TransportEmitter` BOTH satisfy - `TransportEmitter`
 * extends it, so a byte caller's emitter is returned unwidened and a web
 * caller's `Socket` needs no cast. It is deliberately the SMALLER of the two:
 * `TransportEmitter` requires `emitInternal` and `listenerCount`, which a
 * socket.io `Socket` does not have, so typing the return as `TransportEmitter`
 * would be a lie about the web half. Room membership - the one thing only a
 * real `Socket` can do - has its own accessor below.
 */
export type SessionEmitter = LoginEmitter;

/** The session field this module owns. Declared on `BBSSession` in index.ts. */
type SessionWithEmitter = BBSSession & { connectionEmitter?: SessionEmitter | null };

/**
 * Bind a telnet/SSH session to the connection emitter that reaches it.
 *
 * Called exactly ONCE per connection, in `server/transport-session.ts` where
 * the emitter is attached to the connection (and again if a session is handed
 * to an already-open connection on `ready`, which re-registers the same pair).
 * Web sessions are NOT registered: their live socket is `io`'s, and pinning a
 * socket here would recreate `session.socket`'s dead-after-reconnect bug.
 */
export function registerConnectionEmitter(
  session: BBSSession | null | undefined,
  emitter: TransportEmitter,
): void {
  if (!session) return;
  (session as SessionWithEmitter).connectionEmitter = emitter;
}

/**
 * Drop the binding. Called from the transport close handler, so a closed
 * connection is no longer reachable through this module (TP-13b moves the call
 * into `endTransportSession` with the rest of the teardown).
 */
export function unregisterConnectionEmitter(session: BBSSession | null | undefined): void {
  if (!session) return;
  delete (session as SessionWithEmitter).connectionEmitter;
}

/**
 * The live sink for a session, or null when it has none.
 *
 * Byte transports answer from the session's registered emitter; web sessions
 * answer from the io namespace by `socketId`, which the reconnect path keeps
 * current. `session.socket` is NEVER read - that is the trap this registry
 * exists to stop repeating.
 */
export function emitterForSession(
  session: BBSSession | null | undefined,
  io?: IOServer | null,
): SessionEmitter | null {
  if (!session) return null;
  // A web caller's session carries the link over his socket (server/web-connection.ts):
  // the link outlives the raw socket under it, so it is THE answer, ahead of
  // the namespace lookups below which can only ever find a raw socket.
  if (session.webLink) return session.webLink;
  const registered = (session as SessionWithEmitter).connectionEmitter;
  if (registered) return registered;

  const byId = liveSocket(session.socketId, io);
  if (byId) return byId;

  /*
   * THE SESSION'S OWN SOCKET, FOUND IN THE NAMESPACE.
   *
   * `session.socketId` is written by `setSession` and by the restore path, and
   * a web caller whose socket changed by any OTHER route leaves it stale - at
   * which point this module says "no live sink" about a caller who is plainly
   * online. The sysop hit it twice trying to kick his own node: "POST
   * /api/nodes/1/kick 404 (Not Found) ... Node 1 has no active connection",
   * while the board's node list showed him on node 1.
   *
   * This is not a second source of truth: it asks the SAME namespace the same
   * question, keyed on the session object itself, and writes the answer back
   * so the next lookup is direct again.
   */
  const found = socketCarrying(session, io);
  if (found) {
    session.socketId = found.id;
    return found;
  }
  return null;
}

/** The socket in the namespace whose session IS this one, or null. */
function socketCarrying(session: BBSSession, io?: IOServer | null): Socket | null {
  const sockets = io?.sockets?.sockets;
  if (!sockets) return null;
  for (const socket of sockets.values()) {
    const carried = (socket as unknown as { session?: BBSSession }).session;
    if (carried === session) return socket;
    // A restored session is a NEW object on the same node for the same user,
    // which is the case `===` misses.
    if (carried && session.nodeId && carried.nodeId === session.nodeId
      && carried.user?.id && carried.user.id === session.user?.id) return socket;
  }
  return null;
}

/**
 * Is there a REACHABLE caller on this node?
 *
 * The duplicate-login guard (express.e:29715-29727, via `userAlreadyOnNode`)
 * used `sessions.has(nodeId)` to decide. That is map membership, not
 * liveness: a session object outlives its transport, so a caller whose
 * connection had gone was still "on" a node and their own next login was
 * refused against their own corpse. Real callers hit it - `infant` was
 * refused on the live board, and `spot` and `sysop` repeatedly; twenty-eight
 * refusals are recorded in the node CallersLogs, the most recent AFTER the
 * three previous attempts to fix this.
 *
 * Reachability is the question, and it is answered per transport:
 *
 *  - telnet and SSH register a connection emitter, and BOTH teardown
 *    (`transport-session.ts`) and the admin's kick (`node-control-routes.ts`)
 *    unregister it. A registered emitter therefore means a live transport.
 *  - web has no registered emitter; its socket must still be in the
 *    namespace. Socket.IO removes it on disconnect, so membership IS the
 *    liveness test.
 *  - a session with neither is not reachable by definition, and refusing a
 *    login on its behalf is the bug.
 *
 * `socketIsAlive` is injected rather than read from a module-level `io` so
 * that the login path can pass the namespace it already holds, and so a test
 * can answer the question without a server.
 */
export function nodeHasReachableCaller(
  nodeId: number | string,
  socketIsAlive: (socketId: string) => boolean,
): boolean {
  const session = sessions.get(String(nodeId));
  if (!session) return false;

  if ((session as SessionWithEmitter).connectionEmitter) return true;

  const socketId = (session as { socketId?: string }).socketId;
  if (socketId) return socketIsAlive(socketId) === true;

  return false;
}

/** `{ emitter, session }` for a node number, or null. */
export function emitterForNodeId(
  nodeId: number | string,
  io?: IOServer | null,
): { emitter: SessionEmitter; session: BBSSession } | null {
  // `sessions` is keyed by nodeId.toString() and by nothing else
  // (`server/session-manager.ts` setSession) - for telnet exactly as for web.
  return resolve(sessions.get(String(nodeId)) ?? null, io);
}

/** `{ emitter, session }` for a user id, or null. */
export function emitterForUserId(
  userId: string | number,
  io?: IOServer | null,
): { emitter: SessionEmitter; session: BBSSession } | null {
  // `userSessions` is populated post-login for every transport, unlike
  // `socketToUser`, which `services/login-post.service.ts` fills only if the
  // caller is web.
  return resolve(userSessions.get(String(userId)) ?? null, io);
}

/**
 * The socket.io socket behind a session or a socket id, or null.
 *
 * Room membership (`join` / `leave`) is a socket.io concept a byte transport is
 * never part of, and so are the few lookups that exist only to read a socket's
 * own `session` back off it. Those call sites still need the real `Socket` -
 * but they get it HERE, so the namespace lookup lives in exactly one
 * module and TP-15's grep can expect a count of one.
 *
 * Accepts a socket id as well as a session because two call sites
 * (`handlers/operator-chat.handler.ts`, joining the SYSOP's admin-app socket to
 * a page room, and the same file's user-room fallback scan) hold an id and no
 * session at all.
 */
export function socketIoSocketFor(
  target: BBSSession | string | null | undefined,
  io?: IOServer | null,
): Socket | null {
  if (!target) return null;
  if (typeof target === "string") return liveSocket(target, io);
  // A registered connection emitter means a byte transport: it is not in the
  // io namespace and must never be handed a room operation.
  if ((target as SessionWithEmitter).connectionEmitter) return null;
  // A web caller with a link: the raw socket under it, or none while the link
  // is parked (a room operation has no socket to land on).
  if (target.webLink) return target.webLink.parked ? null : target.webLink.raw;
  return liveSocket(target.socketId, io);
}

function resolve(
  session: BBSSession | null,
  io?: IOServer | null,
): { emitter: SessionEmitter; session: BBSSession } | null {
  if (!session) return null;
  const emitter = emitterForSession(session, io);
  return emitter ? { emitter, session } : null;
}

/**
 * THE ONE io-namespace SOCKET LOOKUP IN `web/backend/src`.
 *
 * Defensive about the shape because several handlers are wired with an `io`
 * that is `any` at their own call sites and, in the admin/test paths, with a
 * stub that has an empty `sockets.sockets` map.
 */
function liveSocket(socketId: string | undefined | null, io?: IOServer | null): Socket | null {
  if (!socketId || !io) return null;
  return io.sockets?.sockets?.get(socketId) ?? null;
}
