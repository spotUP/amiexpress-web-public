/**
 * Shared 'c64-detected' handler for TTYPE-negotiated telnet C64s and the
 * dedicated PETSCII port (task 10). Extracted from index.ts's inline
 * `handleC64Detected` (final review wave, Finding 1).
 *
 * The original inline version carried a hand-rolled mini-emitter that
 * understood only 'petscii-output'/'ansi-output' and had no case-swap or
 * $0E charset-prelude handling for 'ansi-output' — screen.handler.ts's
 * raw-byte transport for .seq screens (`petscii-bytes`, Task 9) silently
 * vanished into that emitter's missing `else` branch, so a TTYPE-detected
 * or dedicated-port C64 never received BBSTITLE.SEQ at all.
 *
 * Fix: reuse `buildConnectionEmitter` (connection-emitter.ts) — the SAME
 * emitter every other telnet/SSH session uses — instead of a second,
 * divergent implementation of the same contract.
 *
 * Extracted to its own module (like connection-emitter.ts) so it can be
 * required directly from a test process without pulling in index.ts's
 * top-level server-starting IIFE.
 */
import type { TelnetConnection } from "./telnet-server";
import { emitterFor } from "./connection-emitter";

/**
 * A detected C64 takes the SAME pre-login pipeline as every other caller -
 * connect banner, operator-chat listeners, SamiLog, FRONTEND, the AREXX login
 * trigger - with the graphics prompt answered: `c64: true` puts the PETSCII
 * title and `Username:` where the prompt would be (login-connect.service.ts
 * showC64Title). This handler used to be the whole of a C64's connect and ran
 * none of the rest (web-vs-telnet audit item 10, 2026-09-28).
 */
export async function handleC64Detected(connection: TelnetConnection): Promise<void> {
  if (!connection.session) {
    return;
  }
console.log("[C64] Auto-detected C64 terminal - pre-login pipeline, PETSCII title");
  const { runPreLoginConnect } = await import("../services/login-connect.service");
  await runPreLoginConnect(emitterFor(connection), connection.session, {
    socketId: connection.sessionId,
    c64: true,
  });
}
