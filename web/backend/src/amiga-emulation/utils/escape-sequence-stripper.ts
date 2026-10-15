/**
 * Stateful terminal-input escape-sequence stripper.
 *
 * Shared by every door protocol that accumulates raw terminal input into a
 * line/keystroke buffer (FIMProtocol, DreamDoorLibrary): none of them should
 * ever type a CSI report into a door's prompt just because the user's mouse
 * crossed the terminal. Originally implemented inline in
 * FIMProtocol.stripEscapeSequences (see fim-protocol.ts git history,
 * 2026-08-15/16) to fix xterm SGR mouse-tracking reports (ESC[<btn;x;yM)
 * getting echoed and typed into FIM line input as "[<35;68;25M" garbage.
 * DreamDoorLibrary.drainPromptInput had the identical bug (Prompt's line
 * accumulator treats every printable byte as a keystroke, same as
 * FIMProtocol.feedLineChars did) — extracted here instead of copying the
 * parser a second time.
 *
 * Stateful: a sequence may span multiple strip() calls, because web
 * terminals deliver door input per keystroke (an ESC can arrive in one
 * delivery and the rest of the CSI in the next). That statefulness is why
 * this is a class, not a free function with a module-level regex — a
 * shared module-level parser used across concurrent async sessions caused
 * an infinite loop before (2026-05-05 MCI sentinel-walker incident, see
 * project memory). Each consumer must hold its OWN instance, scoped to its
 * own session/door (FIMProtocol and DreamDoorLibrary are both already
 * one-instance-per-door-session — see their constructors), never a shared
 * singleton.
 */
export class EscapeSequenceStripper {
  /** Carry-over parser state: inside an ESC/CSI sequence that spans
   * strip() calls. */
  private inEscapeSeq = false;

  /**
   * Drop terminal escape sequences from door input — most importantly
   * xterm SGR mouse-tracking reports (ESC[<btn;x;yM), which otherwise get
   * echoed and typed into a door's line input as "[<35;68;25M" garbage
   * whenever the user's mouse crosses the terminal (XIM has mouse
   * throttling; the per-keystroke line editors in FIM/DD saw the raw
   * bytes). Only strips well-formed (and split-delivery partial)
   * ESC/CSI sequences — printable text the user actually typed passes
   * through unchanged.
   */
  strip(data: string): string {
    let out = "";
    for (const ch of data) {
      const code = ch.charCodeAt(0);
      if (this.inEscapeSeq) {
        // CSI parameter/intermediate bytes are 0x20-0x3F ('<', digits, ';',
        // etc.); the final byte is 0x40-0x7E ('M', 'm', letters, '~').
        // '[' immediately after ESC opens the CSI and is not a final byte.
        if (ch === "[") continue;
        if (code >= 0x40 && code <= 0x7e) this.inEscapeSeq = false;
        continue;
      }
      if (code === 0x1b) {
        this.inEscapeSeq = true;
        continue;
      }
      out += ch;
    }
    return out;
  }
}
