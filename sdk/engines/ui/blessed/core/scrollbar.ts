/**
 * The one scrollbar: where its thumb sits.
 *
 * Both implementations that draw a scrollbar - Element.renderScrollbar (every
 * blessed widget) and the ANSI editor's viewport (a tagged Box) - ask this
 * function, so the thumb is the same size and in the same place everywhere.
 * The COLOURS are the theme's (scrollbarRoles in theme/styles.ts); there are
 * no glyphs, so the bar is identical in Topaz, latin1 and on the C64.
 */
export interface ThumbGeometry {
  /** First thumb row, counted from the top of the track. */
  start: number;
  /** Thumb height in rows, at least 1. */
  size: number;
}

/**
 * @param contentHeight total lines of content
 * @param viewHeight    visible rows (also the track length)
 * @param offset        first visible content line
 * @returns null when everything fits and no bar is drawn
 */
export function thumbGeometry(contentHeight: number, viewHeight: number, offset: number): ThumbGeometry | null {
  if (contentHeight <= 0 || viewHeight <= 0 || contentHeight <= viewHeight) return null;
  const size = Math.max(1, Math.floor((viewHeight / contentHeight) * viewHeight));
  const maxScroll = contentHeight - viewHeight;
  const ratio = maxScroll > 0 ? offset / maxScroll : 0;
  return { start: Math.floor(ratio * (viewHeight - size)), size };
}
