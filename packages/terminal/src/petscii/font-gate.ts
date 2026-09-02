/**
 * Bug F fix (2026-09-01, true-petscii login/font pass): post-login font
 * clobber.
 *
 * `ensurePetsciiTerminal` (BBSTerminal.tsx) switches xterm to PetMe64 the
 * moment a PETSCII session starts (the `terminal-resize` to 40x25 that
 * follows a 'P' answer to the ANSI/PETSCII prompt, or the first
 * `petscii-output`/`petscii-bytes` event). `login-success` unconditionally
 * emits `get-font-preference` right after, and the resulting
 * `font-preference` event - along with the sibling user-initiated `set-font`
 * event - used to overwrite `term.options.fontFamily` with the saved/chosen
 * Amiga bitmap font no matter what, clobbering PetMe64 straight after it was
 * applied. The session stayed 40 columns (nothing reverts that), but
 * rendered in the wrong font.
 *
 * `resolveTerminalFontFamily` is the pure gate: while a PETSCII session is
 * active, the C64 font always wins - even against a user's own explicit
 * font choice, because a simulated C64 has no business switching to an
 * Amiga bitmap font mid-session.
 */

/** The exact font-family stack `ensurePetsciiTerminal` applies for PETSCII. */
export const PETSCII_FONT_FAMILY = 'PetMe64, "Courier New", monospace';

/**
 * Resolves the font-family that should actually be written to
 * `term.options.fontFamily` in response to a `font-preference` or `set-font`
 * event.
 *
 * @param requestedFontFamily - the font-family string the event asked for
 *   (the saved preference, or the user's just-picked font).
 * @param petsciiSessionActive - whether the terminal is currently showing a
 *   PETSCII (C64) session - see `petsciiSessionActiveRef` in BBSTerminal.tsx.
 */
export function resolveTerminalFontFamily(
  requestedFontFamily: string,
  petsciiSessionActive: boolean
): string {
  return petsciiSessionActive ? PETSCII_FONT_FAMILY : requestedFontFamily;
}
