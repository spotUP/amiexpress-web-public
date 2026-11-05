/**
 * A swatch draws the SAME cell the screen canvas would.
 *
 * The charset browser puts 256 of these beside a canvas showing the art, and
 * the two must agree about what a screen code looks like. The atlas holds
 * dedicated REVERSE glyphs - the PetMe64 font maps each to its own PUA
 * codepoint, so `PetsciiCanvas` passes the screen byte with bit 7 still in it
 * and tints the result. A swatch that instead swapped ink and ground would
 * disagree with the art on every reversed cell, which is the drift this
 * component exists to prevent. So these tests assert the SOURCE OFFSET the
 * component reads from the atlas.
 *
 * jsdom has no 2D context (node-canvas is not installed), so the context is
 * stubbed. What is asserted is the mapping, which is the part that can be
 * wrong.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { PetsciiGlyph } from '@amiexpress/terminal';

const CELL_PX = 8;
const GLYPHS_PER_BANK = 256;

interface DrawImageCall { sx: number }

let drawImageCalls: DrawImageCall[];
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  drawImageCalls = [];
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    imageSmoothingEnabled: false,
    font: '', textBaseline: '', fillStyle: '', globalCompositeOperation: '',
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    measureText: vi.fn(() => ({ width: 8 })),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn((_img: unknown, sx: number) => { drawImageCalls.push({ sx }); }),
  })) as never;
  // buildGlyphAtlas awaits the font before rasterising.
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { load: vi.fn().mockResolvedValue([]) },
  });
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  vi.restoreAllMocks();
});

/** The offset the LAST drawImage read from - the atlas cell the swatch drew. */
async function drawnCell(element: JSX.Element): Promise<number> {
  render(element);
  await waitFor(() => expect(drawImageCalls.length).toBeGreaterThan(0));
  return drawImageCalls[drawImageCalls.length - 1].sx / CELL_PX;
}

describe('a PETSCII swatch draws the cell the canvas would', () => {
  it('reads the glyph for its screen code, in bank 0', async () => {
    expect(await drawnCell(<PetsciiGlyph screenCode={0x41} bank={0} color="#ffffff" />)).toBe(0x41);
  });

  it('reads bank 1 from the second half of the atlas', async () => {
    expect(await drawnCell(<PetsciiGlyph screenCode={0x41} bank={1} color="#ffffff" />))
      .toBe(GLYPHS_PER_BANK + 0x41);
  });

  it('reads the REVERSE variant as its own glyph, not a colour swap', async () => {
    // The upper 128 codes of each bank ARE the reverse glyphs.
    expect(await drawnCell(<PetsciiGlyph screenCode={0x41} bank={0} color="#ffffff" reverse />))
      .toBe(0x41 | 0x80);
  });

  it('ignores a reverse bit already in the screen code, so it cannot be set twice', async () => {
    expect(await drawnCell(<PetsciiGlyph screenCode={0xc1} bank={0} color="#ffffff" />)).toBe(0x41);
  });

  it('is a square canvas of the size it was asked for', () => {
    const { container } = render(<PetsciiGlyph screenCode={1} bank={0} color="#ffffff" size={24} />);
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.width).toBe(24);
    expect(canvas.height).toBe(24);
  });
});
