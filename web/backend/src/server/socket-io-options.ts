/**
 * The socket.io server options for the web board, one place.
 *
 * index.ts spreads this into `new Server(...)` (adding only `cors`, which
 * reads the runtime config). Kept out of index.ts so the decided values can
 * be tested as values, not as source text.
 *
 * Session persistence (thoughts/shared/plans/2026-10-15-session-persistence-plan.md):
 * - Decision 9: pingTimeout is socket.io's default, 20 s. The old 120 s only
 *   delayed the teardown of a dropped caller; a drop now PARKS the session
 *   (session-parking.ts), so noticing a frozen phone within
 *   pingInterval + pingTimeout = 45 s parks it sooner and stops socket.io's
 *   per-socket write buffer growing into a dead transport.
 * - Decision 10: no `connectionStateRecovery`. Nothing read
 *   `socket.recovered`, and the disconnect handler ended the session
 *   regardless. A dropped call comes back through ONE mechanism: the resume
 *   token in the handshake (web-connection.ts, session-parking.ts).
 */
import type { ServerOptions } from 'socket.io';

export const SOCKET_IO_OPTIONS: Partial<ServerOptions> = {
  pingTimeout: 20000, // Decision 9: socket.io's default; a frozen socket is noticed in <= 45 s
  pingInterval: 25000, // Send ping every 25s to keep connection alive
  // File uploads go via HTTP multipart POST to /api/upload (multer saves to
  // playpen, the frontend then emits a small `file-upload-ready` event with
  // metadata only). Before that migration, BBSTerminal emitted the file body
  // as a JSON-serialized number array - at ~3x inflation a 10MB file became
  // ~30MB on the wire and tripped the old 1MB cap (#11). With binary moved
  // off the socket the cap can be small. Keep 4MB so ANSI screens, AREXX I/O,
  // and any other large emit can still flow without truncation, but anything
  // pathological is caught early.
  maxHttpBufferSize: 4 * 1024 * 1024, // 4MB
  transports: ['websocket', 'polling'], // Prefer websocket, fallback to polling
  allowEIO3: true, // Support older Socket.io clients
  perMessageDeflate: false, // Disable compression to reduce CPU usage
  httpCompression: false, // Disable HTTP compression to reduce CPU usage
  connectTimeout: 60000, // 60s connection timeout (increased from 45s)
};
