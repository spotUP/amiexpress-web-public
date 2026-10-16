/**
 * Character markers for state a widget shows by colour alone.
 *
 * With ANSI colour off the board strips every SGR, so a selected row, a
 * disabled entry or a filled bar would vanish. Widgets ask here for the
 * character that carries the state instead (plan: colour-aware SDK, "Marker
 * rules"). Every function is only meant for `screen.colour === false`.
 */

/** Caret column (2 cols) of a menu row: `>>`/`> ` selected, ` -` disabled. */
export function menuRowMarker(selected: boolean, disabled: boolean, focused = false): string {
  if (selected) return disabled ? '>-' : focused ? '>>' : '> ';
  return disabled ? ' -' : '  ';
}

/**
 * Put a marker at the front of a padded cell, taking the two columns from the
 * cell's own padding so the width stays and no content is lost. A cell with
 * no padding left (truncated to fit) gives up its first two columns.
 */
export function withLeadingMarker(cell: string, marker: string): string {
  if (cell.endsWith('  ')) return marker + cell.slice(0, -2);
  return marker + cell.slice(2);
}
