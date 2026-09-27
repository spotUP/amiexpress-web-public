/**
 * raw-transfer-teardown.util.ts
 *
 * One place that ends a raw (ZMODEM/lrzsz) transfer's INPUT ROUTING.
 *
 * While a transfer runs, `terminal-input.ts` sends every inbound byte to
 * `session.transferRawSink` and nowhere else (see its `transfer-sink` branch).
 * That routing has to be torn down the moment the transfer ends, whatever the
 * transport.
 *
 * It wasn't. The only places that cleared it were socket.io event handlers -
 * `transfer-raw:complete` and `transfer-raw:cancel` in server/socket-handlers.ts -
 * i.e. the BROWSER telling the server the transfer was over. A telnet or SSH
 * caller has no browser and sends no such event, so after his first transfer
 * `transferRawActive` stayed true and `transferRawSink` still pointed at the
 * finished transfer's dead lrzsz manager. Every byte he sent afterwards was
 * routed into that corpse, so the SECOND transfer of the session could never
 * work (reported live 2026-09-08: "the second file transferred via zmodem
 * fails via telnet/ssh"). Reconnecting appeared to fix it because the
 * disconnect path cleared the same fields.
 *
 * So: call this from every path where a transfer ENDS, not from the place a
 * particular client happens to announce it.
 */

/**
 * Clear the raw-transfer input routing. Idempotent, transport-agnostic, and
 * safe to call when no transfer is running.
 *
 * Deliberately does NOT touch `transferRawSend` (the OUTBOUND sender, owned by
 * the transport for the life of the connection) - only the inbound routing and
 * the manager the sink closed over.
 */
export function endRawTransfer(session: any): void {
  if (!session) return;
  // The other half of the BINARY negotiation (express.e:15956-15959). It
  // belongs here for the reason this module exists: this is the ONE place
  // every path that ends a transfer already goes through, and the entry half
  // is called from three.
  try {
    const { endBinaryAfterTransfer } = require('../handlers/file/file-delivery');
    endBinaryAfterTransfer(session);
  } catch (error) {
    console.error('[transfer] could not leave telnet BINARY mode:', error);
  }
  session.transferRawActive = false;
  session.transferRawSink = undefined;
  session.transferManager = undefined;
  /*
   * WHAT IS STILL ON THE LINE IS THE PROTOCOL'S TAIL, NOT KEYSTROKES.
   *
   * The board's sz/rz exits as soon as ITS half of the goodbye is done; the
   * caller's program is still sending its own - a ZFIN retry, `OO` - and
   * those bytes reached the menu prompt as typed commands: "No such
   * command!!" twice under the prompt after every ZMODEM download (walked
   * over telnet, 2026-09-27). express.e never met this: its ZMODEM ran
   * in-process and read the goodbye itself. dispatchInOrder drops input
   * until this moment passes.
   */
  session.transferDrainUntil = Date.now() + TRANSFER_TAIL_DRAIN_MS;
}

/** How long input after a transfer is taken to be the protocol's goodbye. */
export const TRANSFER_TAIL_DRAIN_MS = 2000;
