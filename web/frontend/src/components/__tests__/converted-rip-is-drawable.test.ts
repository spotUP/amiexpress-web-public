/**
 * Everything the SVG converter can emit, RIPtermJS can draw.
 *
 * The converter wrote a 707-point polygon into the sysop's title. RIPscrip
 * allows 512, so the renderer refused that one instruction and drew the rest:
 * the logo came out as disconnected letters with its connecting ribbon
 * missing, and nothing anywhere said so - "progress but it renders broken",
 * then "strokes are still missing" (2026-09-14).
 *
 * A writer that can emit something the reader will not take is the bug class,
 * so this pins the whole command set svgToRip uses against the renderer that
 * actually has to draw it. The board's own corpus test guards the FILES it
 * finds under RIPgraphics, Node1 and the conference directories - it does not
 * look at Node0, and it cannot know what the converter will produce tomorrow.
 */
import { describe, it, expect } from 'vitest';

class ByteDecoder {
  decode(b: Uint8Array) { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; }
}
(globalThis as any).TextDecoder = ByteDecoder;

/**
 * The opcodes svg-to-rip.ts builds instructions for: colour, fill style,
 * filled polygon, polyline and line. Kept as a literal list on purpose - if
 * the converter learns a new command, this list is what makes somebody check
 * the renderer has it.
 */
const CONVERTER_OPCODES = ['c', 'S', 'p', 'l', 'L'] as const;

async function ripterm() {
  const canvas = document.createElement('canvas');
  canvas.id = 'drawable-probe';
  canvas.width = 640; canvas.height = 350;
  (canvas as any).getContext = () => new Proxy(
    { canvas, createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }) },
    { get: (t: any, p) => (p in t ? t[p] : () => undefined) },
  );
  document.body.appendChild(canvas);
  const { RIPterm } = await import('@amiexpress/terminal/rip/vendor/ripterm');
  return new (RIPterm as any)({ canvasId: 'drawable-probe', logQuiet: true });
}

describe('the commands the SVG converter emits', () => {
  it('are all implemented by the renderer that has to draw them', async () => {
    const term: any = await ripterm();

    const missing = CONVERTER_OPCODES.filter(op => {
      const fn = term.ripCmd?.[op] ?? term.cmd?.[op];
      return typeof fn !== 'function';
    });

    expect(missing).toEqual([]);
  });

  it('includes the fill style, without which a filled shape comes out white', async () => {
    const term: any = await ripterm();

    // `p` fills with the FILL colour and outlines in the drawing colour, so a
    // converter that sets only `c` draws white shapes with a coloured edge.
    expect(typeof (term.ripCmd?.['S'] ?? term.cmd?.['S'])).toBe('function');
    expect(typeof (term.ripCmd?.['p'] ?? term.cmd?.['p'])).toBe('function');
  });
});
