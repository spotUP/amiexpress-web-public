/**
 * `border: 'none'` render regression tests.
 *
 * Symptom (GRANDMASTER lobby, 2026-08-25, reported live): the lobby's whole
 * bottom button row - Start, Leave, Bots - rendered as a completely blank
 * line. Earlier, at 3 rows tall, the same buttons instead painted their text
 * one row BELOW their declared top, colliding with the footer hint.
 *
 * Root cause: `border` accepts a string (`'line'` / `'none'`) OR an object
 * (`{type:'line'}`). Element.hasBorder() understood both. screen.ts's own
 * render path tested only the object form:
 *
 *     element.options.border && element.options.border?.type !== 'none'
 *
 * A string has no `.type`, so for `border: 'none'` that whole expression is
 * truthy -> Screen inset the content box by 1 row for a border Element never
 * drew. startY = yi + 1, maxY = yl - 1; on a 1-row element that makes
 * startY (22) exceed maxY (21) and NOTHING paints. On a 3-row element it
 * shifts the text down a row into whatever sits below.
 *
 * Fix: Screen defers to Element.hasBorder() via _elementHasBorder(), so the
 * two can never disagree about what a border is.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Screen, Box, Button } from '../engines/ui/blessed';

/** Text painted on one screen row, trailing blanks trimmed. */
function paintedRow(screen: any, y: number): string {
  const row = screen.buffer[y];
  if (!row) return '<no row>';
  return row.map((c: [number, string]) => c[1]).join('').replace(/\s+$/, '');
}

describe("border: 'none' rendering", () => {
  let screen: Screen;

  beforeEach(() => {
    screen = new Screen({ title: 'Border None Test' });
  });

  afterEach(() => {
    if (screen && !screen.destroyed) screen.destroy();
  });

  describe('Element.hasBorder', () => {
    it('treats both the string and object spellings of "none" as no border', () => {
      const asString: any = new Box({ parent: screen, border: 'none' as any, content: 'x' });
      const asObject: any = new Box({ parent: screen, border: { type: 'none' } as any, content: 'x' });
      const noneAtAll: any = new Box({ parent: screen, content: 'x' });

      expect(asString.hasBorder()).toBe(false);
      expect(asObject.hasBorder()).toBe(false);
      expect(noneAtAll.hasBorder()).toBe(false);
    });

    it('still reports a real border', () => {
      const line: any = new Box({ parent: screen, border: 'line' as any, content: 'x' });
      expect(line.hasBorder()).toBe(true);
    });
  });

  describe('painting', () => {
    it('paints a 1-row borderless element instead of swallowing it', () => {
      // The exact shape of the lobby's Start button that vanished.
      new Button({
        parent: screen,
        top: 21, left: 2, width: 10, height: 1,
        inline: true,
        border: 'none' as any,
        content: ' Start ',
        style: { bg: 'yellow', fg: 'black' },
      } as any);

      screen.render();

      expect(paintedRow(screen, 21)).toContain('Start');
    });

    it('paints at the declared top row, not one row below it', () => {
      // The 3-row variant, which used to push its text down into the
      // neighbouring row (that was the footer-overlap report).
      new Button({
        parent: screen,
        top: 10, left: 2, width: 10, height: 3,
        border: 'none' as any,
        content: ' Start ',
        style: { bg: 'yellow', fg: 'black' },
      } as any);

      screen.render();

      expect(paintedRow(screen, 10)).toContain('Start');
      expect(paintedRow(screen, 11)).not.toContain('Start');
    });

    it('still insets content by one row for an element that really has a border', () => {
      new Box({
        parent: screen,
        top: 4, left: 2, width: 12, height: 3,
        border: 'line' as any,
        content: 'Hi',
      } as any);

      screen.render();

      // Row 4 is the border itself; the text belongs on row 5.
      expect(paintedRow(screen, 4)).not.toContain('Hi');
      expect(paintedRow(screen, 5)).toContain('Hi');
    });
  });
});
