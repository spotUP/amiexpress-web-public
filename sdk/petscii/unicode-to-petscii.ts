/** Unicode glyph -> PETSCII byte (same glyph in both charset banks), or the inverse of another glyph. Filled in Task 3. */
export const UNICODE_TO_PETSCII: ReadonlyMap<string, number | { rvs: number }> = new Map();
