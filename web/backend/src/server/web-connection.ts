/**
 * The web (socket.io) BBS caller's connection handler.
 *
 * Moved out of src/index.ts for the reason `server/transport-session.ts` was
 * (TP-2): index.ts starts the real servers on import, so no test could reach
 * the browser caller's entry point. The body below `acceptWebConnection` is the
 * BBS-node half of `io.on("connection")`, from the node assignment to the end,
 * moved verbatim. The chatOnly and admin branches stay in index.ts on the raw
 * socket: they hold no node and never park (session persistence plan,
 * Decision 11).
 *
 * The three changes from the original, and only these:
 *   - `socket` is a SessionLink over the raw socket, so every holder of the
 *     session (BBSApi, door sessions, modem emulator, idle timer, the socket
 *     handlers) holds the link and a later transport change needs no holder
 *     re-pointed (Decision 4);
 *   - `session.webLink` records the link, which `session-emitter-registry`
 *     answers for this session;
 *   - the idle timer is armed once (the original armed it twice).
 *
 * The caller's address is captured ONCE, here, and kept in the session
 * (`remoteAddress`): a later resume from another network must not silently
 * change the session's address, so nothing re-reads `handshake` from the link.
 */
import type { Server as IOServer, Socket } from "socket.io";
import { config } from "../config";
import type { ChatState } from "../types";
import { nodeManager as productionNodeManager } from "../services/node-manager.service";
import { armIdleTimeout } from "../services/idle-timeout.service";
import { rememberedTheme } from "../screens/remembered-theme";
import { DEFAULT_CONNECTION_BAUD } from "../constants/modem";
import { getSystemTime } from "../utils/date-time.util";
import { setSession, allNodesBusyNotice, createSession } from "./session-manager";
import { registerSocketHandlers, applyPendingGeometry } from "./socket-handlers";
import { createSessionLink } from "./session-link";
import { installParking, resumeParked } from "./session-parking";

/** What the handler closed over in index.ts, passed in so a test can drive it. */
export interface WebConnectionDeps {
  readonly nodeManager: Pick<typeof productionNodeManager, "assignSessionToNode">;
  readonly chatState: ChatState;
}

export async function acceptWebConnection(
  io: IOServer,
  raw: Socket,
  deps: WebConnectionDeps,
): Promise<void> {
  const { nodeManager, chatState } = deps;
  // A caller coming back with a resume token rejoins his parked session:
  // no node, no welcome. The fresh link is made only after this, because a
  // resume attaches the PARKED link to `raw`, and a second link over the same
  // raw would dispatch every event twice. A refusal is said first, then the
  // fresh path runs, so the browser never hangs (Decision 21).
  const offered = (raw.handshake as { auth?: { resume?: unknown } }).auth?.resume;
  if (offered !== undefined) {
    const r = await resumeParked(raw, offered);
    if (r.ok) return;
    raw.emit("session-restore-failed", { reason: r.reason });
  }

  const clientIp = raw.handshake.address;
  const socket = createSessionLink(raw);

  // Initialize session with multi-node support
  let nodeSession;
  try {
    nodeSession = await nodeManager.assignSessionToNode(socket.id, socket.id);
  } catch (error) {
console.error("Failed to assign node to session:", error);
    socket.emit("ansi-output", allNodesBusyNotice());
    socket.disconnect();
    return;
  }

  const bbsConfig = config.getConfig();
  const sessionStart = Date.now();

  // Load disk-based config for the sysop name and version
  const { loadBBSConfig } = await import("../services/bbs-config-file.service");
  const diskConfig = loadBBSConfig(bbsConfig.dataDir);

  // Emulated AmiExpress version we report (matches xim/bbs-info.ts fallback
  // used for EXPRESS_VERSION responses to doors). Keep in sync if you change
  // the mimic'd version.
  const amiExpressVersion = "v5.6";
  // Web-port version, shown on the "Web port" credit line below.
  const packageJson = require("../../package.json");
  const webPortVersion = packageJson.version || "1.0.0";

  const connectionTime = getSystemTime();
  const dateStr = connectionTime.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  // The connect banner now lives in login-connect.service's
  // `emitConnectBanner`, called by `runPreLoginConnect` below - which
  // telnet, SSH and /ws/terminal already call, and which printed nothing
  // like it before. Web keeps the three-second pause after it (see
  // `postBannerDelayMs`): a browser has no dial-up negotiation to fill and
  // the pause is what makes the banner readable before the screen clears.
  //
  // Small delay to ensure the socket is ready to receive data (fixes a race
  // after rebuilds).
  await new Promise((resolve) => setTimeout(resolve, 100));

console.log(
    `[Connection] Starting welcome sequence for node ${nodeSession.nodeId}`
  );

  // Create session using unified createSession function (same as telnet/SSH)
  // Use nodeSession.nodeId from node manager (NOT getNextAvailableNodeId which could differ)
  const session = createSession(nodeSession.nodeId, {
    connectionType: "web",
    remoteAddress: clientIp,
    connectionHostname: bbsConfig.hostname,
    connectionPort: bbsConfig.port,
    connectionBaud: DEFAULT_CONNECTION_BAUD
  });
  session.webLink = socket;
  installParking(socket, session);
  /*
   * THE THEME THIS BROWSER LAST WORE, for the screens drawn before login.
   *
   * BBSTITLE goes out in the pre-login sequence, when the session has no user
   * and `resolveCallerTheme` therefore answers the board default - so a caller
   * wearing h7 was shown tango's title and only saw their own theme from the
   * first screen after logging in. The terminal keeps the slug in a cookie
   * (as it already does for font and modem speed) and the handshake carries
   * it here.
   *
   * Stored as a WANT, not a verdict: `loadScreenFile` passes it to the same
   * judge, with no username beside it, so a draft theme in a cookie is
   * refused exactly as a draft is refused to anyone who does not own it.
   */
  session.preLoginTheme = rememberedTheme(socket.handshake.headers.cookie) ?? undefined;

  setSession(socket.id, session); // Use helper to store by nodeId
  // The terminal reports its size when it mounts, which is before this
  // session existed; without this the board never learns the caller's real
  // width and every wire-width decision falls back to assuming 80.
  applyPendingGeometry(socket, session);

  // THE INPUT TIMEOUT STARTS AT CONNECT, not at the first keystroke: express
  // times a caller out at the username prompt as readily as at the menu - the
  // timeout is an argument to every lineInput, the logon ones included
  // (express.e:2170). services/idle-timeout.service.ts.
  armIdleTimeout(socket as never, session as never);

  // CRITICAL: Register all socket event handlers IMMEDIATELY after session setup
  // This MUST happen BEFORE any output is sent (including ANSI prompt)
  // Otherwise there's a race condition where user input arrives before handlers are ready
  registerSocketHandlers(io, socket, chatState);

  // Pre-login connect pipeline — operator chat listeners, SamiLog
  // refresh, FRONTEND syscmd, ANSI prompt + state, AREXX login trigger.
  // Web/telnet/SSH all call the same service; previously each transport
  // open-coded its own subset and they drifted apart silently (e.g.
  // FRONTEND only ran on web, SamiLog and operator chat too).
  const { runPreLoginConnect } = await import(
    "../services/login-connect.service"
  );
  const connectResult = await runPreLoginConnect(socket, session, {
    socketId: socket.id,
    // WEB_: the banner is followed by a readable pause here and nowhere
    // else. Three seconds added to a telnet connect would be a regression.
    postBannerDelayMs: 3000,
  });
  if (connectResult.passwordResetActive) return;

console.log(
    `[Connection] Welcome sequence complete for node ${nodeSession.nodeId}, waiting for ANSI response`
  );

  // NOTE: registerSocketHandlers was moved to run right after session setup (before welcome sequence)
  // to eliminate race condition where user input could arrive before handlers were registered
}
