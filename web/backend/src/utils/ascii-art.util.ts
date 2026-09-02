/**
 * The board's "is this line art?" / "is this payload painting a screen?"
 * detectors. The implementation lives in the SDK (sdk/petscii/frame/classify.ts)
 * because the C64 door adapter's ladder classifies the SAME rows on the SAME
 * heuristic and cannot import web/backend. This was a verbatim second copy kept
 * equal by a parity test until the frame module gained a package export; as a
 * re-export the two can no longer drift.
 *
 * FROZEN: these two run on the 80-COLUMN path (xim/io.ts's line-wrap safety
 * net, wrapForSession, DIR listings). The C64 ladder's own routing lives in
 * classifyRow/chooseRule, which no ANSI session ever reaches - that split is
 * what lets the ladder change without moving one 80-column byte.
 *
 * Why positionsCursorAbsolutely exists at all: a door that moves the cursor to
 * a row and column is composing a display at absolute coordinates. It has no
 * lines to wrap, and breaking its output moves everything after the break to a
 * place the door never asked for. That is what happened to DOORREPO's /help
 * screen (2026-09-01): "browse a doo" on one row, "r doc ..." on the next,
 * because the line-wrap treated each 198-byte XIM message as a line.
 * looksLikeAsciiArt was the only exemption and asks a different question -
 * whether the text LOOKS like art - which a help row of ordinary words does
 * not. SGR (colour) is deliberately NOT matched: colour moves nothing, so a
 * coloured line is still a line and still needs wrapping. J/K (erase) and s/u
 * (save/restore cursor) joined the set for the petscii-full-canvas plan's
 * Task 10 word-wrap choke, and wrap-for-session.util.ts imports this rather
 * than keeping its own cursor-control regex.
 */
export { looksLikeAsciiArt, positionsCursorAbsolutely } from '@amiexpress/bbs-door-sdk/petscii/frame';
