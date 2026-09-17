/**
 * Composing a page in code.
 *
 * Asserted through the real renderer rather than over the token array: the
 * question is never "did it write byte 0x81", it is "does the caller see red
 * text in that column".
 */
import { PageBuilder, MosaicCanvas, mosaicByte, attributeCost, COLORS } from '../../teletext/compose';
import { renderSubpageLines, subpageToGrid } from '../../teletext/render-session';
import { resolveFastext, subpageAt } from '../../teletext/store';
import { Color } from '../../teletext/marco/state-machine/types';

function plain(line: string): string {
  return line.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b#[0-9]/g, '');
}

function render(builder: PageBuilder, reveal = false): string[] {
  return renderSubpageLines(builder.subpage(), { mode: 'ansi', reveal }).map(plain);
}

describe('writing text', () => {
  it('puts unstyled text exactly where it was asked for', () => {
    const page = new PageBuilder().write(3, 5, 'HELLO');
    expect(render(page)[3].slice(5, 10)).toBe('HELLO');
  });

  it('costs one cell for a colour, because an attribute IS a cell', () => {
    // This is the whole trap of composing teletext, so it is pinned.
    const builder = new PageBuilder().write(1, 0, 'HELLO', { fg: 'red' });
    expect(attributeCost({ fg: 'red' })).toBe(1);
    expect(render(builder)[1].slice(0, 7)).toBe(' HELLO ');

    const grid = subpageToGrid(builder.subpage());
    expect(grid[1][1].fgColor).toBe(Color.RED);
    expect(grid[1][0].fgColor).toBe(Color.WHITE);
  });

  it('costs three cells for a background, and the paper really changes', () => {
    const builder = new PageBuilder().write(1, 0, 'HI', { fg: 'yellow', bg: 'blue' });
    expect(attributeCost({ fg: 'yellow', bg: 'blue' })).toBe(3);

    const grid = subpageToGrid(builder.subpage());
    expect(grid[1][3].bgColor).toBe(Color.BLUE);
    expect(grid[1][3].fgColor).toBe(Color.YELLOW);
  });

  it('centres text allowing for what the style will take', () => {
    const builder = new PageBuilder().writeCentred(2, 'MIDDLE', { fg: 'cyan' });
    const line = render(builder)[2];
    const before = line.length - line.trimStart().length;
    const after = line.length - line.trimEnd().length;
    expect(Math.abs(before - after)).toBeLessThanOrEqual(1);
  });

  it('clips at the page edge instead of wrapping', () => {
    const builder = new PageBuilder().write(4, 36, 'OVERLONG');
    const line = render(builder)[4];
    expect(line).toHaveLength(40);
    expect(line.slice(36)).toBe('OVER');
  });

  it('never lets a character become a control code', () => {
    // A generated page that smuggled a 0x0D into a row would turn the rest
    // of it double height.
    const builder = new PageBuilder().write(5, 0, 'A\rB\x07C');
    expect(render(builder)[5].slice(0, 5)).toBe('A B C');
  });

  it('carries a concealed answer', () => {
    const builder = new PageBuilder().write(6, 0, 'PARIS', { conceal: true });
    expect(render(builder)[6]).not.toContain('PARIS');
    expect(render(builder, true)[6]).toContain('PARIS');
  });

  it('writes double height', () => {
    const builder = new PageBuilder().write(7, 0, 'BIG', { doubleHeight: true });
    const lines = renderSubpageLines(builder.subpage(), { mode: 'teletext' });
    expect(lines[7].startsWith('\x1b#3')).toBe(true);
    expect(lines[8].startsWith('\x1b#4')).toBe(true);
  });

  it('clears a row without touching the others', () => {
    const builder = new PageBuilder().write(1, 0, 'KEEP').write(2, 0, 'GONE').clearRow(2);
    expect(render(builder)[1]).toContain('KEEP');
    expect(render(builder)[2].trim()).toBe('');
  });
});

describe('mosaics', () => {
  it('maps a six-bit pattern to the byte that draws it', () => {
    expect(mosaicByte(0)).toBe(0x20);
    expect(mosaicByte(0x1f)).toBe(0x3f);
    expect(mosaicByte(0x20)).toBe(0x60);
    expect(mosaicByte(0x3f)).toBe(0x7f);
  });

  it('draws solid blocks the renderer recognises', () => {
    const builder = new PageBuilder().writeMosaic(2, 0, [0x3f, 0x3f, 0x3f], { fg: 'green' });
    const lines = renderSubpageLines(builder.subpage(), { mode: 'teletext' }).map(plain);
    expect(lines[2]).toContain('███');
  });
});

describe('the pixel canvas', () => {
  it('is 2x3 pixels per cell, so a page is 80x72', () => {
    const canvas = new MosaicCanvas();
    expect(canvas.width).toBe(80);
    expect(canvas.height).toBe(72);
  });

  it('sets the right bit for each of the six positions', () => {
    // bit 0 top-left, 1 top-right, 2 mid-left, 3 mid-right, 4 bottom-left,
    // 5 bottom-right - the order the sextant table uses.
    for (let sub = 0; sub < 6; sub++) {
      const canvas = new MosaicCanvas(1, 1);
      canvas.set(sub % 2, Math.floor(sub / 2));
      expect(canvas.toPatterns()[0][0]).toBe(1 << sub);
    }
  });

  it('ignores pixels off the edge rather than throwing', () => {
    const canvas = new MosaicCanvas(1, 1);
    canvas.set(-1, 0).set(0, 99).set(500, 500);
    expect(canvas.toPatterns()[0][0]).toBe(0);
  });

  it('draws lines, rectangles and craters', () => {
    const canvas = new MosaicCanvas(4, 2);
    canvas.line(0, 0, 7, 0);
    for (let x = 0; x <= 7; x++) expect(canvas.get(x, 0)).toBe(true);

    canvas.fillRect(0, 3, 8, 3);
    expect(canvas.get(4, 4)).toBe(true);
    canvas.disc(4, 4, 1.5, false);
    expect(canvas.get(4, 4)).toBe(false);
    expect(canvas.get(0, 4)).toBe(true);
  });

  it('lands on the page where the caller put it', () => {
    const builder = new PageBuilder();
    const canvas = new MosaicCanvas(40, 3).fillRect(0, 0, 80, 9);
    builder.drawCanvas(canvas, { row: 10, fg: 'cyan' });
    const lines = renderSubpageLines(builder.subpage(), { mode: 'teletext' }).map(plain);
    expect(lines[9].trim()).toBe('');
    expect(lines[10]).toContain('█');
    expect(lines[12]).toContain('█');
    expect(lines[13].trim()).toBe('');
  });
});

describe('a composed page in the store', () => {
  it('carries its fastext links like any other page', () => {
    // A generated page and a recovered one have to be the same kind of
    // thing, or a door ends up with two ways to draw.
    const page = new PageBuilder()
      .write(1, 0, 'GENERATED')
      .fastext({ red: 0x101, green: 0x102 })
      .page(0x100);

    expect(resolveFastext(page, 'red')).toBe(0x101);
    expect(resolveFastext(page, 'yellow')).toBeNull();
    expect(subpageAt(page, 0)).toBe(page.subpages[0]);
    expect(COLORS.white).toBe(Color.WHITE);
  });
});
