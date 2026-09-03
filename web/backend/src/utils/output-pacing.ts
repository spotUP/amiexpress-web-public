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

/**
 * THE THIRD ARGUMENT, and everything that rides on it.
 *
 * TP-5 (thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md) adds the
 * SECOND attribute, for the same reason and through the same door: the board
 * serves TWO source charsets off disk - `readAmigaTextFile`
 * (`utils/amiga-text-decode.util.ts`) answers `cp437` for a `.ans` file or
 * anything SAUCE-stamped and `iso-8859-1` for everything else - and that
 * answer used to die at the loader. A SESSION-level charset cannot be right
 * for both: Latin-1 round-trips this board's own art byte-for-byte and turns
 * an imported `.ANS` into line noise, CP437 does the reverse. So the source
 * charset travels WITH the payload, on the argument the wipe frames already
 * use, and `utils/wire-encoding.util.ts` reads it at the one place a string
 * becomes bytes.
 */
export interface OutputAttributes {
  /**
   * `true` = the server already paced this payload. The client writes it
   * through in order without metering it. (Unchanged; see this file's header.)
   */
  prePaced?: true;
  /**
   * The charset this payload's CHARACTERS were decoded from, when the payload
   * is screen-file content. `readAmigaTextFile` knows it
   * (`utils/amiga-text-decode.util.ts`) and it used to die there.
   *
   * ABSENT means "no source charset": door output, prompts, MCI-substituted
   * text and anything a handler composed. Those are UTF-8-in by construction
   * and are encoded to the caller's negotiated wire charset with the
   * box-glyph fallback (`substituteUnmappable`).
   *
   * `emitText` / `emitPrompt` never carry it, by rule: they wrap the
   * AnsiBuffer, which CONCATENATES payloads before flushing
   * (`utils/ansi-buffer.util.ts`), and a per-payload attribute cannot survive
   * that. Screen-file content does not go through them today and must not
   * start - pinned by `tests/transport/wire-encoding.test.ts`.
   */
  sourceCharset?: "cp437" | "iso-8859-1";
}

/**
 * The name this interface had when `prePaced` was its only field. Kept
 * because importers name it; there is one declaration, not two.
 */
export type OutputPacing = OutputAttributes;

/** The single value every pre-paced emit carries. */
export const PRE_PACED: Readonly<OutputAttributes> = Object.freeze({ prePaced: true });

/**
 * The four attribute objects that exist, frozen and memoised, so a per-frame
 * emit allocates nothing - the property `PRE_PACED` has always had.
 */
const FROM_CP437: Readonly<OutputAttributes> = Object.freeze({ sourceCharset: "cp437" as const });
const FROM_LATIN1: Readonly<OutputAttributes> = Object.freeze({ sourceCharset: "iso-8859-1" as const });
const PACED_FROM_CP437: Readonly<OutputAttributes> = Object.freeze({
  prePaced: true as const,
  sourceCharset: "cp437" as const,
});
const PACED_FROM_LATIN1: Readonly<OutputAttributes> = Object.freeze({
  prePaced: true as const,
  sourceCharset: "iso-8859-1" as const,
});

/** The attribute for a payload decoded from `enc`, with no pacing claim. */
export function fromCharset(enc: "cp437" | "iso-8859-1"): Readonly<OutputAttributes> {
  return enc === "cp437" ? FROM_CP437 : FROM_LATIN1;
}

/** The same, for a payload the server has ALSO already paced (wipe frames). */
export function pacedFromCharset(enc: "cp437" | "iso-8859-1"): Readonly<OutputAttributes> {
  return enc === "cp437" ? PACED_FROM_CP437 : PACED_FROM_LATIN1;
}
