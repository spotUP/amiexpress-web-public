/**
 * A ListTable says when the highlight MOVED and when a row was CHOSEN.
 *
 * It used to say the same thing for both: selectRow() emitted 'select', and
 * so did Enter. A door could not tell "the cursor passed over this row" from
 * "the player picked this row", so CARD LOBBY bound J to join - which is
 * also this widget's own vi-style "down". Pressing it moved the cursor and
 * joined nothing ("the selected row moves down when i press j to join it
 * doesnt join", 2026-09-02).
 *
 * List has kept blessed's split since neo-blessed: 'select item' is the
 * highlight moving, 'select' is a choice. This is ListTable held to it.
 */

import { ListTable } from '../../engines/ui/blessed/widgets/listtable';

interface Seen {
  moved: number[];
  chosen: number[];
  actions: number[];
}

function build(): { table: any; seen: Seen } {
  const table: any = new ListTable({
    headers: ['ID', 'Game'],
    rows: [['4', 'UNO'], ['3', 'UNO'], ['1', "Texas Hold'em"]],
    interactive: true,
    keys: true,
  } as any);

  const seen: Seen = { moved: [], chosen: [], actions: [] };
  table.on('select item', (_row: string[], index: number) => seen.moved.push(index));
  table.on('select', (_row: string[], index: number) => seen.chosen.push(index));
  table.on('action', (_row: string[], index: number) => seen.actions.push(index));
  return { table, seen };
}

/** The widget only reads keys while it believes it has focus. */
function press(table: any, name: string): void {
  table.focused = true;
  table.emit('keypress', name, { name, full: name });
}

describe('ListTable selection events', () => {
  it('moving the highlight is not a choice', () => {
    const { table, seen } = build();

    press(table, 'j');
    press(table, 'down');

    expect(seen.moved).toEqual([1, 2]);
    expect(seen.chosen).toEqual([]);
    expect(seen.actions).toEqual([]);
  });

  it('k and up move it back, still without choosing', () => {
    const { table, seen } = build();

    press(table, 'down');
    press(table, 'k');

    expect(seen.moved).toEqual([1, 0]);
    expect(seen.chosen).toEqual([]);
  });

  it('enter chooses the row the highlight is on', () => {
    const { table, seen } = build();

    press(table, 'j');
    press(table, 'enter');

    expect(seen.chosen).toEqual([1]);
    expect(seen.actions).toEqual([1]);
    // ...and choosing does not move anything.
    expect(seen.moved).toEqual([1]);
  });

  it('space chooses too', () => {
    const { table, seen } = build();

    press(table, 'space');

    expect(seen.chosen).toEqual([0]);
  });

  it('selectRow from code announces a move, never a choice', () => {
    // Doors call this to restore a highlight after a refresh. It must not
    // look like the player pressed enter, or the lobby would re-join a table
    // every five seconds.
    const { table, seen } = build();

    table.selectRow(2);

    expect(seen.moved).toEqual([2]);
    expect(seen.chosen).toEqual([]);
  });

  it('ignores keys while another widget has focus', () => {
    const { table, seen } = build();

    table.focused = false;
    table.emit('keypress', 'j', { name: 'j', full: 'j' });

    expect(seen.moved).toEqual([]);
  });
});
