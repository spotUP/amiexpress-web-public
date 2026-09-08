/**
 * What a `/ws/terminal` connection gets: a session, the shared handler, and
 * the SAME pre-login every other transport runs.
 *
 * Moved out of index.ts's boot, where it was an inline callback closed over
 * `createSession`, `setSession` and `transportDeps`. Nothing here is new: the
 * diff against index.ts's `attachWSTerminalServer(...)` block is the parameter
 * list and the imports.
 *
 * WHY IT HAD TO MOVE. index.ts starts servers on import, so a test could not
 * reach this callback at all - exactly the problem TP-2 solved for
 * `setupTelnetSSHHandler`, and for the same reason: the pre-login lives HERE,
 * not in `attachWSTerminalServer` and not in `setupTelnetSSHHandler`. A test
 * that mounted the ws server and wired the shared handler itself got silence,
 * because neither of those runs it. Any such test would have been re-stating
 * product code rather than driving it, and would have kept passing if this
 * callback were deleted.
 *
 * The divergence it fixes (research divergence 38): a `/ws/terminal` caller
 * used to get no connect banner, no FRONTEND screen, no graphics prompt and no
 * AREXX `login` trigger - only whatever the first keystroke provoked.
 */
import type { Server as HttpServer } from "http";
import type { WSTerminalConnection } from "./ws-terminal-server";
import type { TelnetConnection } from "./telnet-server";
import type { BBSSession } from "../index";
import type { TransportSessionDeps } from "./transport-session";
import { setupTelnetSSHHandler } from "./transport-session";

export interface WsTerminalSessionDeps {
  readonly createSession: (nodeId: number, init: Record<string, unknown>) => BBSSession;
  readonly setSession: (sessionId: string, session: BBSSession) => void;
  readonly transportDeps: TransportSessionDeps;
  readonly hostname: string;
  readonly port: number;
  /** Seam for the pre-login, so a test can count it without a spy. */
  readonly runPreLogin?: (conn: WSTerminalConnection, session: BBSSession) => Promise<void>;
}

/** The default pre-login: the same one telnet's connect path runs. */
async function defaultRunPreLogin(
  conn: WSTerminalConnection,
  session: BBSSession,
): Promise<void> {
  const { buildConnectionEmitter } = await import("./connection-emitter");
  const { runPreLoginConnect } = await import("../services/login-connect.service");
  const emitter = buildConnectionEmitter(conn as never);
  await runPreLoginConnect(emitter as never, session, { socketId: conn.sessionId });
}

/**
 * Build the handler `attachWSTerminalServer` is given. Verbatim from
 * index.ts, dependencies passed rather than closed over.
 */
export function buildWsTerminalConnectionHandler(
  deps: WsTerminalSessionDeps,
): (conn: WSTerminalConnection) => void {
  return (conn: WSTerminalConnection): void => {
    const session = deps.createSession(conn.nodeId, {
      // Raw bytes both ways - the same surface as telnet.
      connectionType: "telnet",
      remoteAddress: conn.getRemoteAddress(),
      connectionHostname: deps.hostname,
      connectionPort: deps.port,
      connectionBaud: 0,
    });
    /**
     * A WebSocket TEXT frame is UTF-8 by RFC 6455, and
     * `WSTerminalConnection.write` sends one for every string it is handed.
     * The session is created as `connectionType: "telnet"` above and cannot
     * otherwise be told apart from a real telnet caller, so the wire charset
     * is stated here - the same field a telnet CHARSET negotiation sets.
     * `connectionType` is NOT changed: nine `=== 'telnet'` comparisons in
     * web/backend/src depend on it.
     */
    session.wireCharset = "utf-8";
    conn.session = session;
    deps.setSession(conn.sessionId, session);

    // The same connection handler telnet and SSH use.
    setupTelnetSSHHandler(conn as unknown as TelnetConnection, "telnet", deps.transportDeps);

    // ...and the same PRE-LOGIN, which this transport never ran.
    const preLogin = deps.runPreLogin ?? defaultRunPreLogin;
    void (async () => {
      try {
        await preLogin(conn, session);
      } catch (err) {
console.error("[WS-Terminal] pre-login connect failed:", err);
      }
    })();
  };
}

/** Convenience for index.ts: mount the server with the handler above. */
export function attachWsTerminal(
  httpServer: HttpServer,
  attach: (s: HttpServer, h: (c: WSTerminalConnection) => void) => unknown,
  deps: WsTerminalSessionDeps,
): unknown {
  return attach(httpServer, buildWsTerminalConnectionHandler(deps));
}
