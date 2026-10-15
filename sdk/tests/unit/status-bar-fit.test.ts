/**
 * A status bar fits the row it has.
 *
 * Reported live from CARD LOBBY, 2026-09-02: the bar ended mid-word - "spot |
 * Chips: 996 | Table #2 | Table is full of players. Please wait for curren".
 * A notice was appended as its own section and nothing measured the result,
 * so everything past the right edge was simply gone.
 *
 * The last section gives way first: bars here put the identity fields in
 * front and the running commentary at the end, and losing the end of a notice
 * beats losing who you are and how many chips you have.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { StatusBar } from '../../engines/ui/blessed/widgets/status-bar';

function bar(screen: any, sections: Array<{ id: string; content: string; fg?: string }>): any {
  return new StatusBar({ parent: screen, sections } as any);
}

/** What the widget actually put in its content, tags stripped. */
function text(widget: any): string {
  return String(widget.getContent()).replace(/\{[^}]*\}/g, '');
}

describe('a status bar', () => {
  let screen: any;

  beforeEach(() => {
    screen = new Screen({ title: 'bar', width: 80, height: 24 } as any);
  });

  afterEach(() => screen?.destroy());

  it('leaves a line that fits alone', () => {
    const b = bar(screen, [
      { id: 'user', content: 'spot' },
      { id: 'chips', content: 'Chips: 996' },
    ]);
    expect(text(b)).toBe(' spot | Chips: 996 ');
  });

  it('clips the last section rather than running off the row', () => {
    const b = bar(screen, [
      { id: 'user', content: 'spot' },
      { id: 'chips', content: 'Chips: 996' },
      { id: 'where', content: 'Table #2' },
      { id: 'notice', content: 'Table is full of players. Please wait for current hand to finish.' },
    ]);

    const line = text(b);
    expect(line.length).toBeLessThanOrEqual(80);
    expect(line).toContain('spot');
    expect(line).toContain('Chips: 996');
    expect(line).toContain('Table #2');
    expect(line.trimEnd().endsWith('.')).toBe(true);
  });

  it('drops the last section when not even a character of it fits', () => {
    const b = bar(screen, [
      { id: 'user', content: 'x'.repeat(76) },
      { id: 'notice', content: 'never going to fit' },
    ]);

    const line = text(b);
    expect(line.length).toBeLessThanOrEqual(80);
    expect(line).toContain('x'.repeat(76));
  });

  it('measures cells, not colour tags', () => {
    const b = bar(screen, [
      { id: 'user', content: 'spot', fg: 'red' },
      { id: 'notice', content: 'a'.repeat(200) },
    ]);
    expect(text(b).length).toBeLessThanOrEqual(80);
  });
});
