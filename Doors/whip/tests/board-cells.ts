/**
 * Reading a Kanban column off the rendered screen buffer - what the caller
 * sees, not what the door meant to draw. Not a test module: a helper for
 * the board tests (kanban-cards, kanban-selection).
 */

/** A column's list widget, found by the index the board tags it with. */
export function columnList(screen: any, index: number): any {
  let found: any;
  const walk = (el: any): void => {
    if (el._columnIndex === index) found = el;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

export interface ListRow {
  /** Screen row. */
  y: number;
  /** The two marker cells (`>>`, `> ` or blank). */
  marker: string;
  /** The text after the marker, trimmed. */
  text: string;
  /** The attribute of the first text cell. */
  attr: number;
}

/** Every visible row of a list as rendered: marker, text and attribute. */
export function listRows(screen: any, list: any): ListRow[] {
  screen.render();
  const x0 = list.aleft ?? list._getCoords?.()?.xi;
  const y0 = list.atop ?? list._getCoords?.()?.yi;
  const w = list.width;
  const rows: ListRow[] = [];
  for (let y = y0; y < y0 + list.height; y++) {
    const cells = screen.buffer[y].slice(x0, x0 + w);
    rows.push({
      y,
      marker: cells.slice(0, 2).map((c: any) => c[1]).join(''),
      text: cells.slice(2).map((c: any) => c[1]).join('').trim(),
      attr: cells[2][0],
    });
  }
  return rows;
}

/**
 * The rows drawn highlighted: text rows whose attribute is not the list's
 * resting one. The resting attribute is read off an empty row (a spacer or
 * the space below the last card), which no selection ever lights.
 */
export function litRows(screen: any, list: any): ListRow[] {
  const all = listRows(screen, list);
  const empty = all.find((r) => r.text.length === 0);
  if (!empty) throw new Error('litRows needs an empty row in the list to read the resting colour from');
  return all.filter((r) => r.text.length > 0 && r.attr !== empty.attr);
}
