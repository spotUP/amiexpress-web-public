/**
 * Pre-paced output: the wire attribute for a payload whose timing the
 * SERVER has already decided.
 *
 * The board has two pacers and they must never both act on the same bytes:
 *
 * - the client's `ModemEmulator` (packages/terminal/src/utils/modem-emulator.ts)
 *   meters PRINTABLE characters into xterm at the caller's baud rate. It is
 *   the pacer that produces the modem feel, and it exists client-side
 *   because Socket.IO batches at the transport layer, so server-side byte
 *   pacing alone does not survive the wire.
 * - a server sequence that IS an animation - the screen wipes
 *   (`utils/screen-wipe.util.ts`, played at `handlers/screen.handler.ts`) -
 *   paces itself by sleeping between whole FRAMES, and emits each frame as
 *   one write through `socket._directEmit` so nothing re-cuts it.
 *
 * Measured before this attribute existed (ledger:
 * `.superpowers/sdd/2026-09-03-wipe-client-pacing/progress.md`): a `~WR`
 * radial wipe of `Conf1/Menu.txt` is 26 frames the builder wants 625 ms
 * apart in total, but its 4,176 printable characters were re-metered by the
 * client at the caller's baud - 2,910 ms at 14400 and 17,400 ms at 2400.
 * The animation did not slow down, it drip-fed: every frame arrived a
 * fraction at a time, so the wipe crawled and each frame's delta landed
 * long after the frame after it had been sent.
 *
 * The fix is one explicit attribute on the wire rather than a rule the
 * client has to infer: `socket.emit('ansi-output', payload, PRE_PACED)`.
 * The client writes such a payload straight through, in QUEUE ORDER (a
 * pre-paced frame must never overtake text queued before it - the emulator
 * is FIFO for a reason) and without charging its bytes to the baud budget,
 * because those bytes were already paid for in frame delays.
 *
 * A second socket event (`ansi-frame`) was rejected: every emit wrapper on
 * this board forwards `(event, ...args)` untouched - the PETSCII model
 * choke (`utils/petscii-session-model.ts`), the C64 door adapter
 * (`server/c64-door-adapter.ts`), the AnsiBuffer - but the telnet/SSH
 * emitter (`server/connection-emitter.ts`) switches on a FIXED set of
 * event names and drops anything else, so a new event name would have
 * silently deleted every wipe frame on telnet. An extra argument on
 * `ansi-output` passes through all of them, telnet included, and needs no
 * client-side second pipeline: the overlay/sfx/RIP/mouse handling in
 * BBSTerminal's `ansi-output` handler stays the ONE path screen bytes take.
 *
 * NOT for the byte-paced server sequences. `screen.handler.emitWithModem`
 * and `utils/modem-emulator.util.ts` meter the same printable characters
 * the client does, at the same rate; marking their chunks pre-paced would
 * hand the whole modem feel back to Socket.IO's batching - the reason the
 * client pacer was written. The forced-14400 ANSI-animation path is fixed
 * by telling the client its speed (`modem-speed`), not by bypassing it.
 */

export interface OutputPacing {
  /**
   * `true` = the server already paced this payload. The client writes it
   * through in order without metering it.
   */
  prePaced: true;
}

/** The single value every pre-paced emit carries. */
export const PRE_PACED: Readonly<OutputPacing> = Object.freeze({ prePaced: true });
