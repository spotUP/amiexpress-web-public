/**
 * An SVG, as a RIP scene.
 *
 * The sysop draws RIP art in Illustrator - `!ASCII-Art/rip/uptown.ai` and the
 * `uPtOwN.svg` beside it - and had nowhere to put the export. This is the
 * missing half of that workflow, and it is the half `RipScreenEditor` already
 * assumes: that editor says of itself "editable without being a drawing
 * program... Drawing tools would be a second art package", so the picture
 * arrives from a real vector tool and the editor binds the clickable regions
 * over it.
 *
 * THIS IS A PROJECTION, NOT A TRANSLATION. A `.rip` is a vector PROGRAM for a
 * 640x350 canvas with sixteen fixed EGA colours and no transform stack, no
 * alpha, no gradients and no clipping. An SVG has all of those. Every place
 * the projection loses something is a DECISION here, named and reported - a
 * silent drop is how art arrives wrong and nobody can say when.
 *
 * What it emits, and why those opcodes: `l` polyline for a stroked path, `p`
 * filled polygon for a filled one, `L` for a straight line, `C`/`o` for a
 * circle, `B` for a filled rectangle, `R` for a stroked one - the same
 * commands `rip-document.ts` already encodes and `@amiexpress/terminal/rip`
 * already draws. Nothing here invents a byte format: it builds instructions
 * and hands them to `serializeRipDocument`.
 */
import {
  encodeRipArgs,
  RIP_MAX_POLYGON_POINTS,
  serializeRipDocument,
  type RipDocument,
  type RipInstruction,
  type RipLine,
} from './rip-document';

/** The RIP canvas. Every coordinate this module emits is inside it. */
export const RIP_WIDTH = 640;
export const RIP_HEIGHT = 350;

/**
 * The EGA sixteen, as sRGB. A RIP colour is an INDEX into this, so a
 * conversion has to choose a neighbour for every colour the artist used.
 */
const EGA: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0], [0, 0, 170], [0, 170, 0], [0, 170, 170],
  [170, 0, 0], [170, 0, 170], [170, 85, 0], [170, 170, 170],
  [85, 85, 85], [85, 85, 255], [85, 255, 85], [85, 255, 255],
  [255, 85, 85], [255, 85, 255], [255, 255, 85], [255, 255, 255],
];

/** What a conversion could not carry, named so the artist can fix the SVG. */
export interface SvgToRipLoss {
  /** The element that caused it - `linearGradient`, `text`, `image`. */
  element: string;
  /** Why it could not be drawn. */
  reason: string;
}

export interface SvgToRipResult {
  /** The `.rip` file's text, ready to write. */
  text: string;
  /** How many drawing commands it holds - a scene of 0 is a blank screen. */
  commands: number;
  /** Everything the projection refused, in document order. */
  losses: SvgToRipLoss[];
}

/** A 2D affine transform, the only kind SVG's `transform` can express. */
type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * `transform="translate(2) rotate(30) scale(2 3)"` as one matrix.
 *
 * RIP has no transform stack, so every point is resolved here and the scene
 * carries absolute coordinates.
 */
export function parseTransform(value: string | undefined): Matrix {
  if (!value) return IDENTITY;
  let out: Matrix = IDENTITY;
  const call = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  for (const found of value.matchAll(call)) {
    const name = found[1];
    const n = found[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (n.some((v) => !Number.isFinite(v))) continue;
    if (name === 'translate') out = multiply(out, [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0]);
    else if (name === 'scale') out = multiply(out, [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0]);
    else if (name === 'matrix' && n.length === 6) out = multiply(out, n as unknown as Matrix);
    else if (name === 'rotate') {
      const rad = ((n[0] ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const spin: Matrix = [cos, sin, -sin, cos, 0, 0];
      if (n.length >= 3) {
        out = multiply(out, [1, 0, 0, 1, n[1], n[2]]);
        out = multiply(out, spin);
        out = multiply(out, [1, 0, 0, 1, -n[1], -n[2]]);
      } else out = multiply(out, spin);
    }
  }
  return out;
}

/**
 * The nearest EGA index, measured the way an eye measures.
 *
 * By "redmean" - the low-cost approximation of a perceptual distance, which
 * weights the channels by where in the red range the two colours sit. The
 * obvious alternatives both get this picture wrong:
 *
 *  - plain RGB distance has no idea that green carries most of the
 *    brightness, and picks a neighbour that is the right numbers and the
 *    wrong colour.
 *  - weighting the DIFFERENCES by the luma coefficients (0.299/0.587/0.114)
 *    is worse, and was the first thing written here: those weights are for
 *    perceived BRIGHTNESS, so green dominates the comparison and any colour
 *    whose green happens to match wins. The sysop's own logo - `#c9325c`, a
 *    crimson - came out as EGA 6, brown, because brown's green is nearer
 *    than red's. Redmean puts it on 12, light red.
 *
 * Getting this wrong is not subtle: it is a logo in the wrong colour.
 */
export function nearestEga(r: number, g: number, b: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < EGA.length; i++) {
    const [er, eg, eb] = EGA[i];
    const rmean = (r + er) / 2;
    const dr = r - er, dg = g - eg, db = b - eb;
    const distance = (2 + rmean / 256) * dr * dr
      + 4 * dg * dg
      + (2 + (255 - rmean) / 256) * db * db;
    if (distance < bestDistance) { bestDistance = distance; best = i; }
  }
  return best;
}

/** `#rgb`, `#rrggbb`, `rgb(r,g,b)` and the handful of names art uses. */
const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0],
  green: [0, 128, 0], blue: [0, 0, 255], yellow: [255, 255, 0],
  cyan: [0, 255, 255], magenta: [255, 0, 255], gray: [128, 128, 128],
  grey: [128, 128, 128], silver: [192, 192, 192], lime: [0, 255, 0],
};

export function parseColour(value: string | undefined): [number, number, number] | null {
  if (!value) return null;
  const text = value.trim().toLowerCase();
  if (text === 'none' || text === 'transparent') return null;
  if (NAMED[text]) return NAMED[text];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const h = hex[1];
    return h.length === 3
      ? [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(text);
  if (rgb) {
    const n = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (n.length >= 3 && n.slice(0, 3).every(Number.isFinite)) {
      return [n[0], n[1], n[2]];
    }
  }
  return null;
}

/**
 * An SVG path's `d`, as polylines in user space.
 *
 * Beziers are FLATTENED, because RIP's own bezier (`Z`) takes four control
 * points and a segment count and the renderer walks it anyway - and because a
 * path that has been transformed is no longer describable by its original
 * control points. Flattening once, here, means one kind of geometry reaches
 * the emitter.
 *
 * The tolerance is in RIP units on a 640x350 canvas: a curve subdivided finer
 * than a pixel is commands nobody can see, and a `.rip` is read by a modem.
 */
export function flattenPath(d: string, steps = 12): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  let x = 0, y = 0, startX = 0, startY = 0;
  let previousControl: [number, number] | null = null;

  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0;
  let command = '';

  const number = (): number => Number(tokens[i++]);
  const finish = (): void => { if (current.length > 1) out.push(current); current = []; };

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) command = tokens[i++];
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();

    if (upper === 'M') {
      finish();
      const nx = number(), ny = number();
      x = relative ? x + nx : nx; y = relative ? y + ny : ny;
      startX = x; startY = y;
      current = [[x, y]];
      // A second coordinate pair after M is an implicit L, per the grammar.
      command = relative ? 'l' : 'L';
      previousControl = null;
    } else if (upper === 'L') {
      const nx = number(), ny = number();
      x = relative ? x + nx : nx; y = relative ? y + ny : ny;
      current.push([x, y]);
      previousControl = null;
    } else if (upper === 'H') {
      const nx = number();
      x = relative ? x + nx : nx;
      current.push([x, y]);
      previousControl = null;
    } else if (upper === 'V') {
      const ny = number();
      y = relative ? y + ny : ny;
      current.push([x, y]);
      previousControl = null;
    } else if (upper === 'C' || upper === 'S') {
      let c1x: number, c1y: number;
      if (upper === 'C') {
        c1x = relative ? x + number() : number();
        c1y = relative ? y + number() : number();
      } else {
        // Smooth: the first control is the last one reflected through here.
        c1x = previousControl ? 2 * x - previousControl[0] : x;
        c1y = previousControl ? 2 * y - previousControl[1] : y;
      }
      const c2x = relative ? x + number() : number();
      const c2y = relative ? y + number() : number();
      const ex = relative ? x + number() : number();
      const ey = relative ? y + number() : number();
      for (let s = 1; s <= steps; s++) {
        const t = s / steps, u = 1 - t;
        current.push([
          u * u * u * x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex,
          u * u * u * y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey,
        ]);
      }
      previousControl = [c2x, c2y];
      x = ex; y = ey;
    } else if (upper === 'Q' || upper === 'T') {
      let cx: number, cy: number;
      if (upper === 'Q') {
        cx = relative ? x + number() : number();
        cy = relative ? y + number() : number();
      } else {
        cx = previousControl ? 2 * x - previousControl[0] : x;
        cy = previousControl ? 2 * y - previousControl[1] : y;
      }
      const ex = relative ? x + number() : number();
      const ey = relative ? y + number() : number();
      for (let s = 1; s <= steps; s++) {
        const t = s / steps, u = 1 - t;
        current.push([
          u * u * x + 2 * u * t * cx + t * t * ex,
          u * u * y + 2 * u * t * cy + t * t * ey,
        ]);
      }
      previousControl = [cx, cy];
      x = ex; y = ey;
    } else if (upper === 'A') {
      // An elliptical arc, walked as a polyline. The flags are read and the
      // sweep resolved properly: an arc drawn the wrong way round is a
      // logo turned inside out.
      const rx = Math.abs(number()), ry = Math.abs(number());
      const rotation = (number() * Math.PI) / 180;
      const largeArc = number() !== 0, sweep = number() !== 0;
      const ex = relative ? x + number() : number();
      const ey = relative ? y + number() : number();
      pushArc(current, x, y, rx, ry, rotation, largeArc, sweep, ex, ey, steps);
      x = ex; y = ey;
      previousControl = null;
    } else if (upper === 'Z') {
      if (current.length > 0) current.push([startX, startY]);
      x = startX; y = startY;
      finish();
      previousControl = null;
    } else {
      i++;  // an opcode this does not know: step over its token
    }
  }
  finish();
  return out;
}

/** The SVG arc parameterisation, as points. */
function pushArc(
  into: Array<[number, number]>,
  x1: number, y1: number, rx: number, ry: number, rotation: number,
  largeArc: boolean, sweep: boolean, x2: number, y2: number, steps: number,
): void {
  if (rx === 0 || ry === 0) { into.push([x2, y2]); return; }
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;

  // Radii too small for the endpoints are scaled up, per the spec.
  let scale = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (scale > 1) { const root = Math.sqrt(scale); rx *= root; ry *= root; }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const factor = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (factor * rx * y1p) / ry, cyp = (-factor * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    const a = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))));
    return ux * vy - uy * vx < 0 ? -a : a;
  };
  const start = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let extent = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && extent > 0) extent -= 2 * Math.PI;
  if (sweep && extent < 0) extent += 2 * Math.PI;

  for (let s = 1; s <= steps; s++) {
    const t = start + (extent * s) / steps;
    const px = Math.cos(t) * rx, py = Math.sin(t) * ry;
    into.push([cos * px - sin * py + cx, sin * px + cos * py + cy]);
  }
}

/** One element's drawing state, inherited down the tree as SVG does it. */
interface Style {
  fill: string | undefined;
  stroke: string | undefined;
  transform: Matrix;
}

/** An instruction, built from an opcode and its numbers. */
/**
 * BGI's solid fill pattern (vendor/BGI.js:87, index 01 of fill_patterns).
 *
 * Every fill this converter emits is solid: an SVG fill is a flat colour, so
 * a pattern would be a different picture rather than a closer one.
 */
const SOLID_FILL = 1;

/**
 * Points that carry the same shape, within RIP's polygon limit.
 *
 * The flattener works in SVG user units and the canvas is 640x350 integers,
 * so a curve arrives with far more points than the screen can show: one
 * letter of the sysop's logo came to 707, and RIPscrip allows 512. A reader
 * meeting a longer polygon draws NOTHING, which is how a letter went missing
 * from an otherwise correct conversion (2026-09-14).
 *
 * Two passes, cheapest first. Collinear points are free to drop - after
 * rounding to device pixels they are literally on the line their neighbours
 * describe. Only if that is not enough does it start choosing, by
 * Ramer-Douglas-Peucker at a widening tolerance: that keeps the corners a
 * letterform is recognised by and spends the points along its flat runs,
 * which is the opposite of dropping every Nth point.
 */
function withinPolygonLimit(points: Array<[number, number]>): Array<[number, number]> {
  const open = dropCollinear(points);
  if (open.length <= RIP_MAX_POLYGON_POINTS) return open;

  for (let tolerance = 1; tolerance <= 16; tolerance *= 2) {
    const thinned = douglasPeucker(open, tolerance);
    if (thinned.length <= RIP_MAX_POLYGON_POINTS) return thinned;
  }

  // A shape that is still too detailed at 16 pixels of tolerance is not a
  // shape this canvas can show; keep its start and spend the budget evenly.
  const step = open.length / RIP_MAX_POLYGON_POINTS;
  const spread: Array<[number, number]> = [];
  for (let i = 0; i < RIP_MAX_POLYGON_POINTS; i++) spread.push(open[Math.floor(i * step)]);
  return spread;
}

/** Drop any point that sits exactly on the line between its neighbours. */
function dropCollinear(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length < 3) return points;
  const out: Array<[number, number]> = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, ay] = out[out.length - 1];
    const [bx, by] = points[i];
    const [cx, cy] = points[i + 1];
    if ((bx - ax) * (cy - ay) !== (by - ay) * (cx - ax)) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Perpendicular distance from `p` to the segment `a`-`b`. */
function distanceToSegment(
  p: [number, number], a: [number, number], b: [number, number],
): number {
  const [px, py] = p; const [ax, ay] = a; const [bx, by] = b;
  const dx = bx - ax; const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const along = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + along * dx), py - (ay + along * dy));
}

/** Ramer-Douglas-Peucker: keep the points that carry the silhouette. */
function douglasPeucker(
  points: Array<[number, number]>, tolerance: number,
): Array<[number, number]> {
  if (points.length < 3) return points;

  let worst = 0;
  let at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = distanceToSegment(points[i], points[0], points[points.length - 1]);
    if (distance > worst) { worst = distance; at = i; }
  }

  if (worst <= tolerance) return [points[0], points[points.length - 1]];

  const left = douglasPeucker(points.slice(0, at + 1), tolerance);
  const right = douglasPeucker(points.slice(at), tolerance);
  return [...left.slice(0, -1), ...right];
}

function instruction(opcode: string, values: number[]): RipInstruction {
  const args = encodeRipArgs(opcode, values);
  return { opcode, args, terminator: '', start: 0, end: 0 };
}

/**
 * The scene, as RIP lines.
 *
 * Every RIP line opens with `!|` and holds instructions separated by `|`.
 * `rip-document.ts` serialises that shape; this only has to produce it.
 */
function ripLines(instructions: RipInstruction[]): RipDocument {
  const lines: RipLine[] = [];
  // One instruction per line keeps a line inside the 80-odd characters a
  // modem-era file used, and makes a diff readable when art is re-exported.
  for (const one of instructions) {
    lines.push({ raw: `!|${one.opcode}${one.args}`, eol: '\r\n', rip: true, instructions: [one] });
  }
  return { lines };
}

/** Every element in document order, with its inherited style resolved. */
function* walk(
  xml: string,
  inherited: Style,
  classes: Record<string, string> = {},
): Generator<{ tag: string; attrs: Record<string, string>; style: Style }> {
  // A deliberate small parser rather than a DOM: the backend has no DOM, and
  // an SVG that reaches this is an EXPORT from a drawing program - regular,
  // attribute-driven, no entities to speak of. Anything it cannot read is
  // reported as a loss rather than guessed at.
  const element = /<([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|<\/([a-zA-Z][\w:-]*)\s*>/g;
  const stack: Style[] = [inherited];

  for (const found of xml.matchAll(element)) {
    if (found[4]) { if (stack.length > 1) stack.pop(); continue; }
    const tag = found[1];
    const attrs: Record<string, string> = {};
    for (const pair of found[2].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[pair[1]] = pair[2] ?? pair[3] ?? '';
    }
    const parent = stack[stack.length - 1];
    // Precedence, as CSS has it: the inline `style` wins, then the element's
    // own attribute, then whatever its class declares, then the parent's.
    const fromClass = (attrs.class ?? '')
      .split(/\s+/).filter(Boolean).map((name) => classes[name]).filter(Boolean).join(';');
    const style: Style = {
      fill: styleOf(attrs.style, 'fill') ?? attrs.fill ?? styleOf(fromClass, 'fill') ?? parent.fill,
      stroke: styleOf(attrs.style, 'stroke') ?? attrs.stroke ?? styleOf(fromClass, 'stroke') ?? parent.stroke,
      transform: multiply(parent.transform, parseTransform(attrs.transform)),
    };
    yield { tag, attrs, style };
    if (!found[3]) stack.push(style);
  }
}

/**
 * The `<style>` block, as a class -> declarations table.
 *
 * This is where Illustrator puts the paint: every path carries
 * `class="cls-1"` and the fill lives in `.cls-1 { fill: #c9325c }` in a
 * `<defs><style>` at the top. Reading only the `fill` ATTRIBUTE meant the
 * sysop's own `uPtOwN.svg` converted to a scene of zero commands - every
 * path had no paint, so every path was skipped.
 */
export function parseStyleSheet(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const block of xml.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    // Comments first, or a commented-out rule still declares a fill.
    const css = block[1].replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = rule[2].trim();
      for (const selector of rule[1].split(',')) {
        const name = selector.trim();
        if (!name.startsWith('.')) continue;       // only class selectors
        const key = name.slice(1);
        out[key] = out[key] ? `${out[key]};${body}` : body;
      }
    }
  }
  return out;
}

/** `style="fill:#fff;stroke:none"` - the other place a paint hides. */
function styleOf(style: string | undefined, property: string): string | undefined {
  if (!style) return undefined;
  const found = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i').exec(style);
  return found ? found[1].trim() : undefined;
}

/** The viewBox, and how it maps onto the RIP canvas. */
function fitToCanvas(xml: string): { m: Matrix; source: string } {
  const svg = /<svg\b([^>]*)>/i.exec(xml);
  const attrs = svg?.[1] ?? '';
  const box = /viewBox\s*=\s*["']([^"']+)["']/i.exec(attrs);
  const numbers = (text: string): number =>
    Number((/-?\d*\.?\d+/.exec(text) ?? ['0'])[0]);

  let minX = 0, minY = 0, width = 0, height = 0;
  if (box) {
    const n = box[1].trim().split(/[\s,]+/).map(Number);
    [minX, minY, width, height] = [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 0];
  }
  if (!(width > 0 && height > 0)) {
    const w = /\bwidth\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const h = /\bheight\s*=\s*["']([^"']+)["']/i.exec(attrs);
    width = w ? numbers(w[1]) : 0;
    height = h ? numbers(h[1]) : 0;
  }
  if (!(width > 0 && height > 0)) {
    // Nothing said how big it is: treat the drawing as already in RIP units.
    return { m: IDENTITY, source: 'none' };
  }

  // Fit inside, preserving aspect, centred - the same thing an art program
  // means by "fit to artboard". Stretching to fill would be the one choice
  // an artist cannot undo.
  const scale = Math.min(RIP_WIDTH / width, RIP_HEIGHT / height);
  const offsetX = (RIP_WIDTH - width * scale) / 2;
  const offsetY = (RIP_HEIGHT - height * scale) / 2;
  return {
    m: [scale, 0, 0, scale, offsetX - minX * scale, offsetY - minY * scale],
    source: box ? 'viewBox' : 'width/height',
  };
}

/** Elements that carry paint but that RIP has no command for. */
const REFUSED: Record<string, string> = {
  text: 'RIP text is a different command set with its own fonts - draw it as outlines in the art program first',
  tspan: 'part of a <text>',
  image: 'RIP has no bitmap command this board can carry',
  linearGradient: 'RIP fills are sixteen flat colours and a fill pattern - flatten the gradient before exporting',
  radialGradient: 'RIP fills are sixteen flat colours and a fill pattern - flatten the gradient before exporting',
  filter: 'RIP has no filters',
  clipPath: 'RIP has no clipping - apply it in the art program',
  mask: 'RIP has no masking - apply it in the art program',
  use: 'a <use> reference is not expanded; flatten symbols before exporting',
};

/**
 * Convert an SVG document into a `.rip` scene.
 *
 * The projection, in one place so it can be argued with:
 *  - stroked geometry becomes a polyline (`l`) or a line (`L`); filled
 *    geometry becomes a filled polygon (`p`).
 *  - colour becomes the nearest EGA index, weighted by how visible each
 *    channel is, and a `c` (colour) command is emitted only when it CHANGES -
 *    a scene that resets the colour before every line is three times the
 *    bytes for the same picture.
 *  - a shape with neither fill nor stroke is skipped in silence: that is what
 *    the artist meant.
 *  - everything else is refused BY NAME in `losses`.
 */
export function svgToRip(svg: string): SvgToRipResult {
  const losses: SvgToRipLoss[] = [];
  const seen = new Set<string>();
  const out: RipInstruction[] = [];
  let colour = -1;
  let fillColour = -1;

  const setColour = (rgb: [number, number, number]): void => {
    const index = nearestEga(rgb[0], rgb[1], rgb[2]);
    if (index !== colour) { out.push(instruction('c', [index])); colour = index; }
  };

  /**
   * The colour a FILLED shape is filled with, which is not the drawing colour.
   *
   * `p` fills with the fill style and outlines in the drawing colour, and BGI
   * starts at `{ style: SOLID_FILL, color: WHITE }` (vendor/BGI.js:169). So
   * setting only `c` drew every letter of a logo as a WHITE shape with a
   * coloured outline round it - "progress but it renders broken" with a pink
   * keyline round white glyphs (sysop, 2026-09-14).
   *
   * SOLID_FILL is pattern 1 (vendor/BGI.js:87). Nothing here emits a pattern
   * other than solid: an SVG fill is a flat colour, and a dither would be a
   * different picture rather than a closer one.
   */
  const setFillColour = (rgb: [number, number, number]): void => {
    const index = nearestEga(rgb[0], rgb[1], rgb[2]);
    if (index === fillColour) return;
    out.push(instruction('S', [SOLID_FILL, index]));
    fillColour = index;
  };

  const clampX = (v: number): number => Math.max(0, Math.min(RIP_WIDTH - 1, Math.round(v)));
  const clampY = (v: number): number => Math.max(0, Math.min(RIP_HEIGHT - 1, Math.round(v)));

  const { m: canvas } = fitToCanvas(svg);
  const root: Style = { fill: undefined, stroke: undefined, transform: canvas };

  /** A polyline, drawn as a fill or as a stroke, in device coordinates. */
  const emitPolyline = (points: Array<[number, number]>, style: Style, closed: boolean): void => {
    const device = points.map(([x, y]) => {
      const [dx, dy] = apply(style.transform, x, y);
      return [clampX(dx), clampY(dy)] as [number, number];
    });
    // Neighbouring duplicates after rounding are bytes that draw nothing.
    const kept: Array<[number, number]> = [];
    for (const point of device) {
      const last = kept[kept.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) kept.push(point);
    }
    if (kept.length < 2) return;
    // RIP will not draw a polygon over its limit at all, so the shape is
    // brought within it here rather than written and silently skipped.
    const shape = withinPolygonLimit(kept);
    if (shape.length < 2) return;

    const fill = parseColour(style.fill);
    if (fill && closed && shape.length >= 3) {
      // BOTH: `p` outlines in the drawing colour and fills with the fill
      // colour, so a shape whose outline alone was set came out white.
      setColour(fill);
      setFillColour(fill);
      out.push(instruction('p', [shape.length, ...shape.flat()]));
    }
    const stroke = parseColour(style.stroke);
    if (stroke) {
      setColour(stroke);
      if (shape.length === 2) {
        out.push(instruction('L', [shape[0][0], shape[0][1], shape[1][0], shape[1][1]]));
      } else {
        out.push(instruction('l', [shape.length, ...shape.flat()]));
      }
    }
  };

  const num = (attrs: Record<string, string>, name: string, fallback = 0): number => {
    const value = Number(attrs[name]);
    return Number.isFinite(value) ? value : fallback;
  };

  const classes = parseStyleSheet(svg);
  for (const { tag, attrs, style } of walk(svg, root, classes)) {
    if (REFUSED[tag]) {
      if (!seen.has(tag)) { seen.add(tag); losses.push({ element: tag, reason: REFUSED[tag] }); }
      continue;
    }
    if (attrs.style && /url\(/.test(attrs.style)) {
      if (!seen.has('paint-server')) {
        seen.add('paint-server');
        losses.push({ element: tag, reason: 'a gradient or pattern fill; RIP has flat colours only' });
      }
    }

    switch (tag) {
      case 'path':
        for (const run of flattenPath(attrs.d ?? '')) {
          const closed = /[zZ]\s*$/.test(attrs.d ?? '');
          emitPolyline(run, style, closed);
        }
        break;
      case 'polygon':
      case 'polyline': {
        const n = (attrs.points ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
        const run: Array<[number, number]> = [];
        for (let i = 0; i + 1 < n.length; i += 2) run.push([n[i], n[i + 1]]);
        if (tag === 'polygon' && run.length > 2) run.push(run[0]);
        emitPolyline(run, style, tag === 'polygon');
        break;
      }
      case 'line':
        emitPolyline([[num(attrs, 'x1'), num(attrs, 'y1')], [num(attrs, 'x2'), num(attrs, 'y2')]], style, false);
        break;
      case 'rect': {
        const x = num(attrs, 'x'), y = num(attrs, 'y');
        const w = num(attrs, 'width'), h = num(attrs, 'height');
        if (w <= 0 || h <= 0) break;
        emitPolyline([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], style, true);
        break;
      }
      case 'circle':
      case 'ellipse': {
        const cx = num(attrs, 'cx'), cy = num(attrs, 'cy');
        const rx = tag === 'circle' ? num(attrs, 'r') : num(attrs, 'rx');
        const ry = tag === 'circle' ? num(attrs, 'r') : num(attrs, 'ry');
        if (rx <= 0 || ry <= 0) break;
        // As a polyline, not as `C`: the transform may have made it an
        // ellipse at an angle, and RIP's circle is neither.
        const run: Array<[number, number]> = [];
        const steps = 36;
        for (let s = 0; s <= steps; s++) {
          const t = (s / steps) * 2 * Math.PI;
          run.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
        }
        emitPolyline(run, style, true);
        break;
      }
      default:
        break;  // svg, g, defs, title, desc: containers, nothing to draw
    }
  }

  /*
   * A scene of nothing is a failure, not a result. Silence here is what let
   * `uPtOwN.svg` convert to an empty file: every path's paint was in a CSS
   * class nothing read, every path was skipped as unpainted, and the answer
   * was a valid `.rip` that draws a blank screen.
   */
  if (out.length === 0) {
    losses.push({
      element: 'svg',
      reason: 'nothing was drawn: no element carried a fill or a stroke this '
        + 'could read. Check the paint is on the elements or in a <style> block '
        + 'of class rules, not in a gradient or a paint server.',
    });
  }

  const document = ripLines(out);
  return { text: serializeRipDocument(document), commands: out.length, losses };
}
