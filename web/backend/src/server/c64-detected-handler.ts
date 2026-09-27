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
import { BBSState } from "../constants/bbs-states";
import type { TelnetConnection } from "./telnet-server";
import { emitterFor } from "./connection-emitter";

export async function handleC64Detected(connection: TelnetConnection): Promise<void> {
  if (!connection.session) {
    return;
  }
console.log("[C64] Auto-detected C64 terminal, showing PETSCII BBSTITLE");
  const { displayScreen } = await import("../handlers/screen.handler");
  // Same emitter contract every other telnet/SSH connection uses — handles
  // petscii-bytes (raw .seq transport, fed to the session's transducer via
  // observe()), petscii-output (legacy PUA) and ansi-output (transduced,
  // charset bank ensured against the oracle) identically to the main
  // session pipeline.
  // The connection's OWN emitter (emitterFor), never a second one: the
  // output buffer binds to whichever emitter first prints, and a second
  // emitter left every later prompt outside the modem pacer.
  const emitter = emitterFor(connection);
  await displayScreen(emitter as any, connection.session, "BBSTITLE");
  // Transition to login
  connection.session.state = BBSState.LOGON;
  connection.session.subState = undefined;
  connection.session.tempData = connection.session.tempData || {};
  connection.session.tempData.loginPhase = "username";
  // Through the emitter, not connection.write: the session's transducer
  // must see this text so its cursor/charset oracle matches the screen.
  emitter.emit("ansi-output", "\r\n\r\n");
  emitter.emit("ansi-output", "Username: ");
}
