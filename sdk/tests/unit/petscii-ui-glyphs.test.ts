/**
 * A C64 gets PETSCII's own graphics; an Amiga gets the ASCII it always had.
 *
 * The board drew `.` corners and `-` rules for every caller, so the C64 was
 * shown an imitation of ASCII in a font that has had real box drawing since
 * 1982: "petscii has a lot of nice characters to build ui's from, use the
 * petscii characters to it's full potential" (2026-09-06).
 *
 * Two things are pinned here. The glyphs a PETSCII screen paints, driven
 * through the real Screen buffer rather than read off the table - the table
 * was already right in a dead copy of the code nothing called. And the
 * wrapping, which broke mid-word on every narrow row.
 */

import { describe, it, expect } from '@jest/globals';
import { Screen } from '../../engines/ui/blessed/core/screen';
import { Box } from '../../engines/ui/blessed/widgets/box';
import { borderCharsFor } from '../../engines/ui/blessed/core/border-chars';
import { wrapAnsiText } from '../../engines/ui/blessed/core/wrap-text';

const plain = (t: string) => t.length;

function paint(petscii: boolean): string[] {
  const screen: any = new Screen({
    title: 'glyphs', width: 40, height: 25, responsive: true, petscii,
  } as any);
  new Box({
    parent: screen, top: 0, left: 0, width: 20, height: 5,
    border: { type: 'line' }, label: 'Players',
  } as any);
  screen.render();
  const rows = screen.buffer.slice(0, 5).map((row: any[]) =>
    row.map((cell: any) => cell[1]).join('').replace(/\s+$/, ''));
  screen.destroy();
  return rows;
}

describe('a PETSCII screen draws PETSCII', () => {
  it('paints real box drawing, not an ASCII imitation', () => {
    const rows = paint(true);
    const top = rows[0];

    expect(top).toContain('┌');
    expect(top).toContain('─');
    expect(rows[0]).not.toContain('.');
    expect(rows[1]).toContain('│');
    expect(rows[4]).toContain('└');
    expect(rows[4]).toContain('┘');
  });

  it('leaves an Amiga screen on the ASCII it has always drawn', () => {
    const rows = paint(false);

    expect(rows[0]).toContain('.');
    expect(rows[0]).toContain('-');
    expect(rows[0]).not.toContain('┌');
    expect(rows[1]).toContain('|');
    expect(rows[4]).toContain('`');
  });

  it('re-fills the labelled edge with the border it is drawing, not a hyphen', () => {
    // The label painter spelled '-' out itself, so a PETSCII box got an ASCII
    // hyphen either side of its label and the rule broke mid-edge.
    const top = paint(true)[0];
    expect(top).not.toContain('-');
  });

  it('has no double or heavy line to draw, and does not invent one', () => {
    for (const type of ['heavy', 'double']) {
      expect(borderCharsFor(type, true).h).toBe('─');
      expect(borderCharsFor(type, false).h).toBe('=');
    }
  });
});

describe('text wraps at words', () => {
  it('keeps a word whole', () => {
    expect(wrapAnsiText('Slot 2: (empty)', 13, plain)).toEqual(['Slot 2:', '(empty)']);
  });

  it('is what broke the lobby: no more "(e" / "mpty)"', () => {
    const rows = wrapAnsiText('Standard (9 specials)', 13, plain);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(13);
    expect(rows.join(' ')).toContain('specials)');
  });

  it('carries the colour onto the next row', () => {
    const rows = wrapAnsiText('\x1b[31mred words here now\x1b[0m', 10, (t) => t.replace(/\x1b\[[0-9;]*m/g, '').length);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[1]).toContain('\x1b[31m');
  });

  it('still breaks a word longer than the whole box, because nothing else can', () => {
    const rows = wrapAnsiText('supercalifragilistic', 8, plain);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(8);
  });
});
