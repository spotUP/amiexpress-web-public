/**
 * Centring text inside a bordered box.
 *
 * Reported live 2026-08-25: "the texts are still not centered in both axis
 * inside the modals in gmaster". Those modals DO ask for it - GMASTER's high
 * score notification sets align:'center' and valign:'middle' - so the
 * question is what the renderer does with the request.
 *
 * These tests read the painted buffer rather than the content string,
 * because centring is only observable after tags have been parsed and the
 * box has been drawn.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { Box } from '../../engines/ui/blessed/widgets/box';

function makeScreen(): any {
  return new Screen({ title: 'centring', width: 80, height: 24 } as any);
}

/** Every painted row of the screen, as plain strings. */
function rows(screen: any): string[] {
  const out: string[] = [];
  for (let y = 0; y < screen.height; y++) {
    const row = screen.buffer[y];
    out.push(row ? row.map((c: [number, string]) => c[1]).join('') : '');
  }
  return out;
}

/** Rows that carry visible text inside the box, with their index. */
function textRows(screen: any, box: any): { y: number; text: string }[] {
  const pos = box._getCoords();
  return rows(screen)
    .map((text, y) => ({ y, text }))
    .filter(r => r.y > pos.yi && r.y < pos.yl - 1)
    .map(r => ({ y: r.y, text: r.text.slice(pos.xi + 1, pos.xl - 1) }))
    .filter(r => r.text.trim().length > 0);
}

describe('a modal that asks for centred text', () => {
  let screen: any;

  afterEach(() => screen?.destroy());

  function modal(content: string): any {
    screen = makeScreen();
    const box = new Box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 50,
      height: 10,
      border: { type: 'line' },
      align: 'center',
      valign: 'middle',
      tags: true,
      content,
    } as any);
    screen.render();
    return box;
  }

  it('centres a plain line horizontally', () => {
    const box = modal('HELLO');
    const [line] = textRows(screen, box);

    const left = line.text.length - line.text.trimStart().length;
    const right = line.text.length - line.text.trimEnd().length;

    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });

  it('centres a TAGGED line horizontally, measuring the visible text only', () => {
    // The real modals are full of {bold}{yellow-fg} markup. If the width is
    // measured before tags are stripped the line is pushed left by however
    // many markup characters it happens to contain.
    const box = modal('{bold}{yellow-fg}HELLO{/yellow-fg}{/bold}');
    const [line] = textRows(screen, box);

    const left = line.text.length - line.text.trimStart().length;
    const right = line.text.length - line.text.trimEnd().length;

    expect(line.text.trim()).toBe('HELLO');
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });

  it('centres the block vertically', () => {
    const box = modal('ONE\nTWO\nTHREE');
    const pos = box._getCoords();
    const lines = textRows(screen, box);

    const above = lines[0].y - (pos.yi + 1);
    const below = (pos.yl - 2) - lines[lines.length - 1].y;

    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
  });

  it('centres tagged multi-line content on both axes at once', () => {
    // Exactly the shape of GMASTER's high-score notification.
    const box = modal(
      '{bold}{yellow-fg}NEW HIGH SCORE!{/yellow-fg}{/bold}\n\n' +
      '{white-fg}Rank: {bold}1st{/bold}{/white-fg}\n' +
      '{white-fg}Score: {bold}12,345{/bold}{/white-fg}'
    );
    const pos = box._getCoords();
    const lines = textRows(screen, box);

    for (const line of lines) {
      const left = line.text.length - line.text.trimStart().length;
      const right = line.text.length - line.text.trimEnd().length;
      expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    }

    const above = lines[0].y - (pos.yi + 1);
    const below = (pos.yl - 2) - lines[lines.length - 1].y;
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
  });
});
