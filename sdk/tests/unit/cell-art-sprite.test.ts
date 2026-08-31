/**
 * The sprite format and its clock.
 *
 * parseSprite is the loud gate: a malformed sprite must fail the DOOR LOAD
 * with the sprite, animation and frame named - not the first draw,
 * quietly. frameAt is pure in the game tick, which is what makes every
 * animation assertable without a terminal.
 */

import { createBuffer, Cell } from '../../engines/graphics/cell-art/cells';
import {
  parseSprite,
  frameAt,
  blitSprite,
  SpriteAnimation,
} from '../../engines/graphics/cell-art/sprite';

/** A minimal valid sprite JSON: 2x1 cells, one two-frame animation. */
function rawSprite(): any {
  return {
    name: 'dot',
    cellW: 2,
    cellH: 1,
    animations: {
      blink: {
        ticksPerFrame: 3,
        loop: true,
        frames: [
          [[['*', 11, 0], null]],
          [[[' ', 11, 0], ['*', 11, 0]]],
        ],
      },
    },
  };
}

describe('parseSprite', () => {
  it('round-trips a valid sprite', () => {
    const s = parseSprite(rawSprite());
    expect(s.name).toBe('dot');
    expect(s.animations.blink.frames).toHaveLength(2);
    expect((s.animations.blink.frames[0][0][0] as Cell).char).toBe('*');
    expect(s.animations.blink.frames[0][0][1]).toBeNull();
  });

  it('names the offending frame when dimensions are wrong', () => {
    const raw = rawSprite();
    raw.animations.blink.frames[1] = [[['*', 11, 0]]]; // 1 wide, not 2
    expect(() => parseSprite(raw, 'dot.sprite.json'))
      .toThrow(/dot\.sprite\.json.*blink.*frame 1/);
  });

  it('rejects colours outside 0-15', () => {
    const raw = rawSprite();
    raw.animations.blink.frames[0][0][0] = ['*', 16, 0];
    expect(() => parseSprite(raw)).toThrow(/fg/);
  });

  it('rejects tag-delimiter characters, which would corrupt the markup', () => {
    // The joust buzzards were drawn as { and } and emitted straight into
    // tagged markup. The format refuses the two characters outright.
    const raw = rawSprite();
    raw.animations.blink.frames[0][0][0] = ['{', 11, 0];
    expect(() => parseSprite(raw)).toThrow(/character/);
  });

  it('rejects a sprite with no animations', () => {
    const raw = rawSprite();
    raw.animations = {};
    expect(() => parseSprite(raw)).toThrow(/animation/);
  });
});

describe('frameAt', () => {
  const anim = (over: Partial<SpriteAnimation> = {}): SpriteAnimation => ({
    ticksPerFrame: 3,
    loop: true,
    frames: [createBuffer(1, 1), createBuffer(1, 1), createBuffer(1, 1)],
    ...over,
  });

  it('holds each frame for ticksPerFrame ticks', () => {
    const a = anim();
    expect(frameAt(a, 0)).toBe(a.frames[0]);
    expect(frameAt(a, 2)).toBe(a.frames[0]);
    expect(frameAt(a, 3)).toBe(a.frames[1]);
  });

  it('loops when asked to', () => {
    const a = anim();
    expect(frameAt(a, 9)).toBe(a.frames[0]);
  });

  it('holds the last frame when not looping - a death stays dead', () => {
    const a = anim({ loop: false });
    expect(frameAt(a, 900)).toBe(a.frames[2]);
  });

  it('survives ticksPerFrame 0 by treating it as 1', () => {
    const a = anim({ ticksPerFrame: 0 });
    expect(frameAt(a, 1)).toBe(a.frames[1]);
  });
});

describe('blitSprite', () => {
  it('places the current frame at the grid cell', () => {
    const s = parseSprite(rawSprite());
    const board = createBuffer(6, 2);
    blitSprite(board, s, 'blink', 0, 2, 1);
    expect((board[1][4] as Cell).char).toBe('*');
    expect(board[1][5]).toBeNull(); // transparent cell left the board alone
  });

  it('throws on an unknown animation name - a typo is a bug, not silence', () => {
    const s = parseSprite(rawSprite());
    expect(() => blitSprite(createBuffer(2, 1), s, 'blnk', 0, 0, 0))
      .toThrow(/blnk/);
  });
});
