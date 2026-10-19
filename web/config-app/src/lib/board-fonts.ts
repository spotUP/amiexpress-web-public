/**
 * Ask the browser for the board's faces, because a canvas never will.
 *
 * `ctx.font = '16px "TopazPlus_a1200"'` does NOT fetch a webfont. Canvas
 * takes whatever is already loaded and silently falls back when the face is
 * not - there is no error and no event, so the art just renders in Courier.
 * Only the DOM triggers a `@font-face` fetch, and the admin's screen previews
 * are canvases: open a file and nothing on the page has ever asked for Topaz.
 *
 * `document.fonts.ready` cannot rescue it either. It resolves when PENDING
 * loads finish, and a face nobody requested is never pending - so it resolves
 * at once, the repaint runs, and paints the fallback a second time. That is
 * exactly what `AnsiCanvas` was doing.
 *
 * `document.fonts.load()` is the one call that starts the fetch. Made once at
 * start-up, it puts a real load in flight, which is also what makes the
 * canvas's existing `fonts.ready` repaint do its job.
 */

/**
 * Every face this app ships a `@font-face` for, and every one of them is
 * drawn by a canvas: TopazPlus and Topaz by the ANSI screens
 * (`ansi-canvas-paint.ts`), PetMe64 by the PETSCII glyph atlas
 * (`packages/terminal/src/petscii/glyph-atlas.ts`), TeletextUPR by the native
 * teletext editor (`TeletextScreenEditor.tsx`). Pinned against
 * `index.css` by test, so a new face cannot be added and forgotten.
 */
export const BOARD_FONT_FAMILIES = [
  'TopazPlus_a1200',
  'Topaz_a1200',
  'PetMe64',
  'TeletextUPR',
] as const;

/**
 * Any size loads the face; the size in the spec only has to parse. 16 matches
 * `CELL_HEIGHT`, so the string is the one the canvas actually draws with.
 */
const PROBE_SIZE = 16;

interface FontLoader {
  load(font: string): Promise<unknown>;
}

/**
 * Start the fetches. Resolves when they have all settled, never rejects: a
 * missing face is a worse-looking preview, not a broken admin, and start-up
 * must not hang on a font.
 */
export function loadBoardFonts(
  fonts: FontLoader | undefined =
    (document as Document & { fonts?: FontLoader }).fonts,
): Promise<void> {
  // Absent in jsdom and in older browsers. Nothing to do and nothing to warn
  // about - the fallback face is what those render anyway.
  if (!fonts || typeof fonts.load !== 'function') return Promise.resolve();

  return Promise.all(
    BOARD_FONT_FAMILIES.map(family =>
      Promise.resolve(fonts.load(`${PROBE_SIZE}px "${family}"`)).catch(() => undefined)),
  ).then(() => undefined);
}
