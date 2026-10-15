/**
 * The sprite format: named animations of fixed-size cell frames, clocked
 * by the game's own tick.
 *
 * JSON on disk (`<name>.sprite.json`): each frame is cellH rows of cellW
 * entries, an entry being `[char, fg, bg]` or null for transparency.
 * parseSprite validates everything up front so a malformed sprite fails
 * the door LOAD with a message naming sprite, animation and frame - a
 * sprite that fails at first draw instead fails in front of a player.
 *
 * frameAt is a pure function of the tick (the door's frameCount, never the
 * wall clock), the same rule the game clocks follow: deterministic, and
 * therefore assertable.
 */

import { Cell, CellBuffer, CellRow, blitCells } from './cells';

export interface SpriteAnimation {
  /** Game ticks each frame is held for. */
  ticksPerFrame: number;
  /** Loop, or hold the last frame (death, shatter). */
  loop: boolean;
  frames: CellBuffer[];
}

export interface Sprite {
  name: string;
  /** Frame size, in characters. Every frame of every animation matches. */
  cellW: number;
  cellH: number;
  animations: Record<string, SpriteAnimation>;
}

/** The two blessed tag delimiters; a cell carrying one corrupts the row. */
const FORBIDDEN_CHARS = new Set(['{', '}']);

function fail(source: string, message: string): never {
  throw new Error(`sprite ${source}: ${message}`);
}

function parseCell(
  raw: unknown, source: string, where: string
): Cell | null {
  if (raw === null) return null;
  if (!Array.isArray(raw) || raw.length !== 3) {
    fail(source, `${where}: a cell is [char, fg, bg] or null`);
  }
  const [char, fg, bg] = raw as [unknown, unknown, unknown];
  if (typeof char !== 'string' || char.length !== 1) {
    fail(source, `${where}: char must be a single character`);
  }
  if (FORBIDDEN_CHARS.has(char)) {
    fail(source, `${where}: the character '${char}' would corrupt tag markup`);
  }
  if (typeof fg !== 'number' || fg < 0 || fg > 15 || !Number.isInteger(fg)) {
    fail(source, `${where}: fg must be an integer colour 0-15`);
  }
  if (typeof bg !== 'number' || bg < 0 || bg > 15 || !Number.isInteger(bg)) {
    fail(source, `${where}: bg must be an integer colour 0-15`);
  }
  return { char, fg, bg };
}

/** Parse and validate one sprite. `source` names it in every error. */
export function parseSprite(raw: unknown, source = 'sprite'): Sprite {
  const s = raw as any;
  if (!s || typeof s !== 'object') fail(source, 'not an object');
  if (typeof s.name !== 'string' || !s.name) fail(source, 'missing name');
  if (!Number.isInteger(s.cellW) || s.cellW < 1) fail(source, 'bad cellW');
  if (!Number.isInteger(s.cellH) || s.cellH < 1) fail(source, 'bad cellH');
  if (!s.animations || typeof s.animations !== 'object' ||
      Object.keys(s.animations).length === 0) {
    fail(source, 'a sprite needs at least one animation');
  }

  const animations: Record<string, SpriteAnimation> = {};
  for (const [animName, rawAnim] of Object.entries<any>(s.animations)) {
    if (!rawAnim || !Array.isArray(rawAnim.frames) || rawAnim.frames.length === 0) {
      fail(source, `animation ${animName} has no frames`);
    }
    const frames: CellBuffer[] = rawAnim.frames.map(
      (rawFrame: unknown, frameIndex: number) => {
        const where = `animation ${animName} frame ${frameIndex}`;
        if (!Array.isArray(rawFrame) || rawFrame.length !== s.cellH) {
          fail(source, `${where}: expected ${s.cellH} rows`);
        }
        return (rawFrame as unknown[]).map((rawRow, rowIndex): CellRow => {
          if (!Array.isArray(rawRow) || rawRow.length !== s.cellW) {
            fail(source, `${where}: row ${rowIndex} is not ${s.cellW} cells`);
          }
          return rawRow.map((rawCell, cellIndex) =>
            parseCell(rawCell, source, `${where} row ${rowIndex} cell ${cellIndex}`));
        });
      }
    );
    animations[animName] = {
      ticksPerFrame: Number.isInteger(rawAnim.ticksPerFrame) && rawAnim.ticksPerFrame > 0
        ? rawAnim.ticksPerFrame : 1,
      loop: rawAnim.loop !== false,
      frames,
    };
  }

  return { name: s.name, cellW: s.cellW, cellH: s.cellH, animations };
}

/**
 * A sprite as its on-disk JSON - the exact inverse of parseSprite.
 *
 * Validates by round-tripping through parseSprite BEFORE returning, so a
 * corrupted in-memory document throws here rather than writing a file
 * that fails the next door load.
 */
export function serializeSprite(sprite: Sprite): string {
  const raw = {
    name: sprite.name,
    cellW: sprite.cellW,
    cellH: sprite.cellH,
    animations: Object.fromEntries(
      Object.entries(sprite.animations).map(([name, anim]) => [name, {
        ticksPerFrame: anim.ticksPerFrame,
        loop: anim.loop,
        frames: anim.frames.map(frame =>
          frame.map(row =>
            row.map(cell => (cell ? [cell.char, cell.fg, cell.bg] : null)))),
      }])
    ),
  };
  parseSprite(raw, `${sprite.name} (serializing)`); // throws before disk
  return JSON.stringify(raw, null, 1) + '\n';
}

/** Which frame is showing at game tick N. Pure. */
export function frameAt(anim: SpriteAnimation, tick: number): CellBuffer {
  const step = Math.max(1, anim.ticksPerFrame);
  const index = Math.floor(Math.max(0, tick) / step);
  return anim.loop
    ? anim.frames[index % anim.frames.length]
    : anim.frames[Math.min(index, anim.frames.length - 1)];
}

/**
 * Composite a sprite's current frame at a GRID position (the board is
 * gridW x gridH cells of cellW x cellH characters each).
 *
 * An unknown animation name throws: it is a typo in door code, and the
 * door's own render tests exercise every state, so it surfaces there.
 */
export function blitSprite(
  dest: CellBuffer,
  sprite: Sprite,
  animation: string,
  tick: number,
  gridX: number,
  gridY: number
): void {
  const anim = sprite.animations[animation];
  if (!anim) {
    throw new Error(
      `sprite ${sprite.name} has no animation '${animation}' ` +
      `(has: ${Object.keys(sprite.animations).join(', ')})`
    );
  }
  blitCells(dest, frameAt(anim, tick), gridX * sprite.cellW, gridY * sprite.cellH);
}
