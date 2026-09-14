/**
 * An SVG, as a RIP scene.
 *
 * The sysop draws RIP art in Illustrator - `!ASCII-Art/rip/uptown.ai` and the
 * `uPtOwN.svg` exported beside it - and had nowhere to put the export. Every
 * case here is driven through THAT file where it can be, because the two
 * defects this converter shipped with were both things only a real export
 * has: the paint lives in a `<style>` block of class rules, and a crimson
 * has to pick a red rather than the brown whose green happens to be nearer.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  flattenPath,
  nearestEga,
  parseColour,
  parseStyleSheet,
  parseTransform,
  svgToRip,
  RIP_WIDTH,
  RIP_HEIGHT,
} from '../../src/screens/svg-to-rip';
import {
  decodeRipArgs,
  parseRipDocument,
  RIP_MAX_POLYGON_POINTS,
} from '../../src/screens/rip-document';

const BOARD = path.resolve(__dirname, '../../../..');
const UPTOWN = path.join(BOARD, '!ASCII-Art/rip/uPtOwN.svg');

/** Every instruction the scene holds, decoded. */
function instructions(text: string): Array<{ opcode: string; args: Array<number | string> }> {
  const out: Array<{ opcode: string; args: Array<number | string> }> = [];
  for (const line of parseRipDocument(text).lines) {
    for (const one of line.instructions) {
      out.push({ opcode: one.opcode, args: decodeRipArgs(one.opcode, one.args) ?? [] });
    }
  }
  return out;
}

describe('the sysop\'s own logo', () => {
  const svg = fs.readFileSync(UPTOWN, 'utf8');

  it('converts to a scene that draws something', () => {
    const result = svgToRip(svg);
    expect(result.commands).toBeGreaterThan(0);
    expect(result.losses).toEqual([]);
  });

  it('reads the paint out of the <style> block, where Illustrator puts it', () => {
    // Every path in this file carries `class="cls-1"` and no fill attribute.
    // Reading only the attribute converted it to a scene of nothing.
    expect(svg).toMatch(/class="cls-1"/);
    expect(svg).not.toMatch(/<path[^>]*\sfill=/);
    const filled = instructions(svgToRip(svg).text).filter((one) => one.opcode === 'p');
    expect(filled.length).toBeGreaterThan(0);
  });

  it('picks a red for the crimson, not the brown next to it', () => {
    // #c9325c. Weighting the channel differences by the luma coefficients
    // chose EGA 6 - brown - because brown's green is nearer than red's.
    const colours = instructions(svgToRip(svg).text)
      .filter((one) => one.opcode === 'c')
      .map((one) => Number(one.args[0]));
    expect(colours).toContain(12);
    expect(colours).not.toContain(6);
  });

  it('sets the colour once, not before every shape', () => {
    const colours = instructions(svgToRip(svg).text).filter((one) => one.opcode === 'c');
    expect(colours).toHaveLength(1);
  });

  it('stays inside the RIP canvas', () => {
    for (const one of instructions(svgToRip(svg).text)) {
      if (one.opcode !== 'p' && one.opcode !== 'l') continue;
      const numbers = one.args.slice(1).map(Number);
      for (let i = 0; i < numbers.length; i += 2) {
        expect(numbers[i]).toBeGreaterThanOrEqual(0);
        expect(numbers[i]).toBeLessThan(RIP_WIDTH);
        expect(numbers[i + 1]).toBeGreaterThanOrEqual(0);
        expect(numbers[i + 1]).toBeLessThan(RIP_HEIGHT);
      }
    }
  });

  it('answers bytes the board\'s own reader parses back', () => {
    const text = svgToRip(svg).text;
    const doc = parseRipDocument(text);
    expect(doc.lines.length).toBeGreaterThan(0);
    for (const line of doc.lines) expect(line.rip).toBe(true);
  });
});

describe('a document that draws nothing says so', () => {
  it('refuses to answer a blank scene in silence', () => {
    const result = svgToRip('<svg viewBox="0 0 10 10"><path d="M0,0 L10,10"/></svg>');
    expect(result.commands).toBe(0);
    expect(result.losses.map((loss) => loss.element)).toContain('svg');
    expect(result.losses[0].reason).toMatch(/fill or a stroke/);
  });

  it('names what it cannot draw, rather than dropping it', () => {
    const result = svgToRip(
      '<svg viewBox="0 0 10 10"><text x="1" y="1" fill="#fff">HI</text>'
      + '<image href="x.png"/><linearGradient id="g"/></svg>',
    );
    const refused = result.losses.map((loss) => loss.element);
    expect(refused).toContain('text');
    expect(refused).toContain('image');
    expect(refused).toContain('linearGradient');
  });
});

describe('the pieces', () => {
  it('reads a class rule table, comments and all', () => {
    const sheet = parseStyleSheet(
      '<style>/* a note */ .a, .b { fill: #fff; } .c { stroke: red }</style>',
    );
    expect(sheet.a).toMatch(/fill:\s*#fff/);
    expect(sheet.b).toMatch(/fill:\s*#fff/);
    expect(sheet.c).toMatch(/stroke:\s*red/);
  });

  it('composes a transform list left to right', () => {
    const m = parseTransform('translate(10 20) scale(2)');
    // A point at (1,1) is scaled then translated.
    expect(m[0]).toBe(2);
    expect(m[4]).toBe(10);
    expect(m[5]).toBe(20);
  });

  it('reads the colour spellings art programs write', () => {
    expect(parseColour('#fff')).toEqual([255, 255, 255]);
    expect(parseColour('#c9325c')).toEqual([201, 50, 92]);
    expect(parseColour('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
    expect(parseColour('none')).toBeNull();
    expect(parseColour(undefined)).toBeNull();
  });

  it('flattens a curve into points, and closes what Z closes', () => {
    const runs = flattenPath('M0,0 C10,0 10,10 0,10 Z');
    expect(runs).toHaveLength(1);
    expect(runs[0].length).toBeGreaterThan(3);
    expect(runs[0][0]).toEqual(runs[0][runs[0].length - 1]);
  });

  it('walks an elliptical arc rather than jumping to its end', () => {
    const straight = flattenPath('M0,0 L10,0');
    const arc = flattenPath('M0,0 A5,5 0 0 1 10,0');
    expect(arc[0].length).toBeGreaterThan(straight[0].length);
    // It ends where the arc ends, whichever way it swept.
    // toBeCloseTo, not toBe: the arc lands on -0 here and `Object.is` calls
    // that a different number from 0.
    const end = arc[0][arc[0].length - 1];
    expect(end[0]).toBeCloseTo(10, 6);
    expect(end[1]).toBeCloseTo(0, 6);
  });

  it('matches the colours an artist would expect', () => {
    expect(nearestEga(255, 255, 255)).toBe(15);
    expect(nearestEga(0, 0, 0)).toBe(0);
    expect(nearestEga(201, 50, 92)).toBe(12);
    expect(nearestEga(128, 128, 128)).toBe(7);
  });
});

/**
 * WHAT THE SYSOP SAW: "progress but it renders broken" - white letters with a
 * pink keyline, and one letter missing (2026-09-14). Two separate defects,
 * both only visible once a real export reached a real renderer.
 */
describe('the scene a RIP reader can actually draw', () => {
  const svg = fs.readFileSync(UPTOWN, 'utf8');

  /*
   * `p` outlines in the DRAWING colour and fills with the FILL colour, and
   * BGI starts at solid WHITE (packages/terminal/src/rip/vendor/BGI.js:169).
   * Setting only `c` drew the logo as white glyphs with a coloured edge.
   */
  it('sets the fill colour, not only the colour it outlines with', () => {
    const scene = instructions(svgToRip(svg).text);

    const fillStyle = scene.find(one => one.opcode === 'S');
    expect(fillStyle).toBeDefined();
    const colour = scene.find(one => one.opcode === 'c')!.args[0];
    // Solid pattern, and the same colour the shape is drawn in - a filled
    // letter is one colour, not an outline round a white middle.
    expect(fillStyle!.args[0]).toBe(1);
    expect(fillStyle!.args[1]).toBe(colour);
  });

  it('fills every polygon it draws with that colour', () => {
    const scene = instructions(svgToRip(svg).text);

    // No polygon may be drawn before a fill colour has been chosen.
    const firstFill = scene.findIndex(one => one.opcode === 'S');
    const firstPoly = scene.findIndex(one => one.opcode === 'p');
    expect(firstFill).toBeGreaterThanOrEqual(0);
    expect(firstFill).toBeLessThan(firstPoly);
  });

  /*
   * RIPscrip allows 512 points in a polygon and a reader that meets a longer
   * one draws NOTHING. The flattener worked in SVG units on a 640x350 canvas
   * and produced 707 for one letter, so that letter silently vanished.
   */
  it('keeps every polygon inside the limit a RIP reader will read', () => {
    const text = svgToRip(svg).text;

    for (const line of parseRipDocument(text).lines) {
      for (const one of line.instructions) {
        if (one.opcode !== 'p' && one.opcode !== 'l') continue;
        const decoded = decodeRipArgs(one.opcode, one.args);
        // null is the reader refusing it - which is the renderer's answer too.
        expect(decoded).not.toBeNull();
        expect(decoded![0] as number).toBeLessThanOrEqual(RIP_MAX_POLYGON_POINTS);
      }
    }
  });

  it('draws the same number of shapes after thinning them', () => {
    // Six paths, one of which has two subpaths: seven filled shapes. Losing
    // points must not lose a LETTER.
    const polygons = instructions(svgToRip(svg).text).filter(one => one.opcode === 'p');

    expect(polygons).toHaveLength(7);
  });

  it('spends points on the corners, not evenly along the outline', () => {
    // A dense curve that is mostly a straight run: the straight part costs
    // almost nothing once collinear points go, so the shape survives whole
    // rather than being decimated.
    const points: string[] = [];
    for (let x = 0; x <= 600; x += 1) points.push(`${x},10`);
    for (let x = 600; x >= 0; x -= 1) points.push(`${x},200`);
    const dense = `<svg viewBox="0 0 640 350"><path fill="#ff0000" d="M${points.join(' L')} Z"/></svg>`;

    const polygon = instructions(svgToRip(dense).text).find(one => one.opcode === 'p')!;

    expect(polygon.args[0] as number).toBeLessThanOrEqual(RIP_MAX_POLYGON_POINTS);
    // Two straight runs and their corners - not 512 points spread along them.
    expect(polygon.args[0] as number).toBeLessThan(12);
  });
});
