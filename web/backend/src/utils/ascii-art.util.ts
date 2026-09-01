/**
 * ASCII art detection heuristic
 * Reused by DIR file writer and listing output to ignore purely decorative lines
 */
/**
 * Is this output PAINTING a screen rather than printing a line?
 *
 * A door that moves the cursor to a row and column is composing a display
 * at absolute coordinates. It has no lines to wrap: breaking its output
 * moves everything after the break to a place the door never asked for, and
 * the rest of the screen it was drawing lands one row down and shifted.
 *
 * That is exactly what happened to DOORREPO's /help screen (screenshot,
 * 2026-09-01) - "browse a doo" on one row and "r doc ..." starting the
 * next. The door's own bytes were captured and replayed and were perfect;
 * the break came from the line-wrap treating each 198-byte XIM message as
 * a line.
 *
 * looksLikeAsciiArt() was the only exemption and asks a different question
 * - whether the text LOOKS like art, by punctuation ratio. A help row of
 * ordinary words does not, so it was wrapped. Looking like art was never
 * the point.
 *
 * Deliberately NOT matched: SGR (colour). Colour moves nothing, so a
 * coloured line is still a line and still needs wrapping.
 */
export function positionsCursorAbsolutely(line: string): boolean {
  // CUP/HVP (ESC[row;colH, ESC[row;colf), cursor up/down/forward/back
  // (ABCD), column and line positioning (GdE F), and the parameterless
  // home (ESC[H).
  return /\x1b\[[0-9;]*[HfABCDGdEF]/.test(line);
}

export function looksLikeAsciiArt(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return true; // Pure whitespace continuation lines (no content) are treated as art so they don't add blank rows.
  }

  const letters = (trimmed.match(/[A-Za-z]/g) || []).length;
  const digits = (trimmed.match(/[0-9]/g) || []).length;
  const nonAlphanumeric = trimmed.length - letters - digits;
  const punctuationRatio = nonAlphanumeric / trimmed.length;
  const symbolMatch = trimmed.match(/[:\-_/\\|=+*~`@#%^&\[\]\(\)<>]/g);
  const symbolCount = symbolMatch ? symbolMatch.length : 0;
  const leadingIndent = line.match(/^\s+/)?.[0].length || 0;

  if (leadingIndent >= 33) {
    return true;
  }

  if (letters + digits === 0 && nonAlphanumeric > 0) {
    return true;
  }

  if (punctuationRatio >= 0.6 && trimmed.length >= 4) {
    return true;
  }

  if (symbolCount >= 3 && (letters + digits) / trimmed.length < 0.4) {
    return true;
  }

  if (leadingIndent >= 4 && symbolCount >= 2) {
    return true;
  }

  const longSpaceRuns = (line.match(/\s{4,}/g) || []).length;
  if (longSpaceRuns >= 2 && symbolCount >= 3) {
    return true;
  }

  const artChars = (line.match(/[|_\/\\\-()]/g) || []).length;
  if (artChars >= 8 && letters + digits < trimmed.length * 0.8) {
    return true;
  }

  const borderArt = /^[|:][\s\S]*[:|]$/.test(trimmed);
  if (borderArt && symbolCount >= 2) {
    return true;
  }

  const borderedLine =
    trimmed.length >= 20 &&
    trimmed.startsWith('|') &&
    trimmed.endsWith('|') &&
    trimmed.split('|').length >= 3 &&
    symbolCount >= 4;
  if (borderedLine) {
    return true;
  }

  return false;
}
