/**
 * The sprite document: the studio's every edit as a pure operation.
 *
 * Same discipline as the 2a browser model - the UI binds keys to these
 * functions and paints the result, so the whole editing feature is
 * assertable without a terminal. Operations return new docs (dirty), a
 * clamped selection returns the SAME doc (the identity rule the repaint
 * skip relies on), and the refusals protect the loader's invariants: a
 * sprite always keeps at least one animation with at least one frame.
 */

import {
  Cell, CellBuffer, Sprite,
  compilePixels, decompilePixels,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

export interface EditDoc {
  sprite: Sprite;
  animation: string;
  frame: number;
  dirty: boolean;
}

const cloneSprite = (sprite: Sprite): Sprite =>
  JSON.parse(JSON.stringify(sprite)) as Sprite;

const blankFrame = (sprite: Sprite): CellBuffer =>
  Array.from({ length: sprite.cellH }, () =>
    Array.from({ length: sprite.cellW }, () => null));

function withFrames(doc: EditDoc, frames: CellBuffer[], frame: number): EditDoc {
  const sprite = cloneSprite(doc.sprite);
  sprite.animations[doc.animation].frames = frames;
  return { ...doc, sprite, frame, dirty: true };
}

export function openDoc(sprite: Sprite): EditDoc {
  const clone = cloneSprite(sprite);
  return {
    sprite: clone,
    animation: Object.keys(clone.animations).sort()[0],
    frame: 0,
    dirty: false,
  };
}

export function currentFrame(doc: EditDoc): CellBuffer {
  return doc.sprite.animations[doc.animation].frames[doc.frame];
}

export function selectAnimation(doc: EditDoc, name: string): EditDoc {
  if (!doc.sprite.animations[name]) {
    throw new Error(`no animation '${name}'`);
  }
  if (name === doc.animation) return doc;
  return { ...doc, animation: name, frame: 0 };
}

export function selectFrame(doc: EditDoc, index: number): EditDoc {
  const count = doc.sprite.animations[doc.animation].frames.length;
  const frame = Math.max(0, Math.min(count - 1, index));
  if (frame === doc.frame) return doc;
  return { ...doc, frame };
}

export function addFrame(doc: EditDoc, mode: 'blank' | 'duplicate'): EditDoc {
  const frames = [...doc.sprite.animations[doc.animation].frames];
  const source = mode === 'duplicate'
    ? JSON.parse(JSON.stringify(frames[doc.frame]))
    : blankFrame(doc.sprite);
  frames.splice(doc.frame + 1, 0, source);
  return withFrames(doc, frames, doc.frame + 1);
}

export function deleteFrame(doc: EditDoc): EditDoc {
  const frames = [...doc.sprite.animations[doc.animation].frames];
  if (frames.length <= 1) {
    throw new Error('cannot delete the last frame - the loader rejects an empty animation');
  }
  frames.splice(doc.frame, 1);
  return withFrames(doc, frames, Math.min(doc.frame, frames.length - 1));
}

export function moveFrame(doc: EditDoc, delta: -1 | 1): EditDoc {
  const frames = [...doc.sprite.animations[doc.animation].frames];
  const to = doc.frame + delta;
  if (to < 0 || to >= frames.length) return doc;
  [frames[doc.frame], frames[to]] = [frames[to], frames[doc.frame]];
  return withFrames(doc, frames, to);
}

export function setCell(doc: EditDoc, row: number, col: number, cell: Cell | null): EditDoc {
  const frames = doc.sprite.animations[doc.animation].frames
    .map(f => f.map(r => [...r]));
  frames[doc.frame][row][col] = cell ? { ...cell } : null;
  return withFrames(doc, frames, doc.frame);
}

export function frameIsPixelEditable(doc: EditDoc): boolean {
  return decompilePixels(currentFrame(doc)) !== null;
}

export function setPixel(doc: EditDoc, py: number, px: number, colour: number | null): EditDoc {
  const pixels = decompilePixels(currentFrame(doc));
  if (!pixels) {
    throw new Error('frame is not pixel-editable - it holds non-half-block art');
  }
  pixels[py][px] = colour;
  const compiled = compilePixels(pixels);
  const frames = doc.sprite.animations[doc.animation].frames
    .map((f, i) => (i === doc.frame ? compiled : f));
  return withFrames(doc, frames, doc.frame);
}

export function setTicksPerFrame(doc: EditDoc, delta: number): EditDoc {
  const sprite = cloneSprite(doc.sprite);
  const anim = sprite.animations[doc.animation];
  anim.ticksPerFrame = Math.max(1, anim.ticksPerFrame + delta);
  return { ...doc, sprite, dirty: true };
}

export function toggleLoop(doc: EditDoc): EditDoc {
  const sprite = cloneSprite(doc.sprite);
  const anim = sprite.animations[doc.animation];
  anim.loop = !anim.loop;
  return { ...doc, sprite, dirty: true };
}

export function addAnimation(doc: EditDoc, name: string): EditDoc {
  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    throw new Error('animation name must be lowercase letters, digits and dashes');
  }
  if (doc.sprite.animations[name]) {
    throw new Error(`animation '${name}' already exists`);
  }
  const sprite = cloneSprite(doc.sprite);
  sprite.animations[name] = { ticksPerFrame: 4, loop: true, frames: [blankFrame(sprite)] };
  return { ...doc, sprite, animation: name, frame: 0, dirty: true };
}

export function deleteAnimation(doc: EditDoc): EditDoc {
  const names = Object.keys(doc.sprite.animations);
  if (names.length <= 1) {
    throw new Error('cannot delete the last animation - a sprite needs one');
  }
  const sprite = cloneSprite(doc.sprite);
  delete sprite.animations[doc.animation];
  const next = Object.keys(sprite.animations).sort()[0];
  return { ...doc, sprite, animation: next, frame: 0, dirty: true };
}

export function toSprite(doc: EditDoc): Sprite {
  return cloneSprite(doc.sprite);
}
