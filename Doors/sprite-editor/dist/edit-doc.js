"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.openDoc = openDoc;
exports.currentFrame = currentFrame;
exports.selectAnimation = selectAnimation;
exports.selectFrame = selectFrame;
exports.addFrame = addFrame;
exports.deleteFrame = deleteFrame;
exports.moveFrame = moveFrame;
exports.setCell = setCell;
exports.frameIsPixelEditable = frameIsPixelEditable;
exports.setPixel = setPixel;
exports.floodFill = floodFill;
exports.setTicksPerFrame = setTicksPerFrame;
exports.toggleLoop = toggleLoop;
exports.addAnimation = addAnimation;
exports.deleteAnimation = deleteAnimation;
exports.toSprite = toSprite;
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const cloneSprite = (sprite) => JSON.parse(JSON.stringify(sprite));
const blankFrame = (sprite) => Array.from({ length: sprite.cellH }, () => Array.from({ length: sprite.cellW }, () => null));
function withFrames(doc, frames, frame) {
    const sprite = cloneSprite(doc.sprite);
    sprite.animations[doc.animation].frames = frames;
    return { ...doc, sprite, frame, dirty: true };
}
function openDoc(sprite) {
    const clone = cloneSprite(sprite);
    return {
        sprite: clone,
        animation: Object.keys(clone.animations).sort()[0],
        frame: 0,
        dirty: false,
    };
}
function currentFrame(doc) {
    return doc.sprite.animations[doc.animation].frames[doc.frame];
}
function selectAnimation(doc, name) {
    if (!doc.sprite.animations[name]) {
        throw new Error(`no animation '${name}'`);
    }
    if (name === doc.animation)
        return doc;
    return { ...doc, animation: name, frame: 0 };
}
function selectFrame(doc, index) {
    const count = doc.sprite.animations[doc.animation].frames.length;
    const frame = Math.max(0, Math.min(count - 1, index));
    if (frame === doc.frame)
        return doc;
    return { ...doc, frame };
}
function addFrame(doc, mode) {
    const frames = [...doc.sprite.animations[doc.animation].frames];
    const source = mode === 'duplicate'
        ? JSON.parse(JSON.stringify(frames[doc.frame]))
        : blankFrame(doc.sprite);
    frames.splice(doc.frame + 1, 0, source);
    return withFrames(doc, frames, doc.frame + 1);
}
function deleteFrame(doc) {
    const frames = [...doc.sprite.animations[doc.animation].frames];
    if (frames.length <= 1) {
        throw new Error('cannot delete the last frame - the loader rejects an empty animation');
    }
    frames.splice(doc.frame, 1);
    return withFrames(doc, frames, Math.min(doc.frame, frames.length - 1));
}
function moveFrame(doc, delta) {
    const frames = [...doc.sprite.animations[doc.animation].frames];
    const to = doc.frame + delta;
    if (to < 0 || to >= frames.length)
        return doc;
    [frames[doc.frame], frames[to]] = [frames[to], frames[doc.frame]];
    return withFrames(doc, frames, to);
}
function setCell(doc, row, col, cell) {
    const frames = doc.sprite.animations[doc.animation].frames
        .map(f => f.map(r => [...r]));
    frames[doc.frame][row][col] = cell ? { ...cell } : null;
    return withFrames(doc, frames, doc.frame);
}
function frameIsPixelEditable(doc) {
    return (0, cell_art_1.decompilePixels)(currentFrame(doc)) !== null;
}
function setPixel(doc, py, px, colour) {
    const pixels = (0, cell_art_1.decompilePixels)(currentFrame(doc));
    if (!pixels) {
        throw new Error('frame is not pixel-editable - it holds non-half-block art');
    }
    pixels[py][px] = colour;
    const compiled = (0, cell_art_1.compilePixels)(pixels);
    const frames = doc.sprite.animations[doc.animation].frames
        .map((f, i) => (i === doc.frame ? compiled : f));
    return withFrames(doc, frames, doc.frame);
}
/**
 * 4-connected flood fill, in PIXEL space - same restriction as setPixel
 * (the frame must be pure half-block art; `colour` is a single 0-15 value
 * or null, which only a PixelGrid cell can hold, not a Cell's separate
 * char/fg/bg). Throws the same way setPixel does: not pixel-editable, or
 * (row, col) outside the grid.
 *
 * Identity rule, matching selectFrame/selectAnimation's no-op case: if the
 * starting pixel is already the target colour there is nothing to spread,
 * so this returns the SAME doc reference rather than a new (but
 * content-identical) one.
 */
function floodFill(doc, row, col, colour) {
    const pixels = (0, cell_art_1.decompilePixels)(currentFrame(doc));
    if (!pixels) {
        throw new Error('frame is not pixel-editable - it holds non-half-block art');
    }
    const target = pixels[row][col]; // throws like setPixel when (row, col) is out of the grid
    if (target === colour)
        return doc;
    const height = pixels.length;
    const width = pixels[0].length;
    const filled = pixels.map(r => [...r]);
    const stack = [[row, col]];
    filled[row][col] = colour;
    while (stack.length > 0) {
        const [r, c] = stack.pop();
        for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
            if (nr < 0 || nr >= height || nc < 0 || nc >= width)
                continue;
            if (filled[nr][nc] !== target)
                continue;
            filled[nr][nc] = colour;
            stack.push([nr, nc]);
        }
    }
    const compiled = (0, cell_art_1.compilePixels)(filled);
    const frames = doc.sprite.animations[doc.animation].frames
        .map((f, i) => (i === doc.frame ? compiled : f));
    return withFrames(doc, frames, doc.frame);
}
function setTicksPerFrame(doc, delta) {
    const sprite = cloneSprite(doc.sprite);
    const anim = sprite.animations[doc.animation];
    anim.ticksPerFrame = Math.max(1, anim.ticksPerFrame + delta);
    return { ...doc, sprite, dirty: true };
}
function toggleLoop(doc) {
    const sprite = cloneSprite(doc.sprite);
    const anim = sprite.animations[doc.animation];
    anim.loop = !anim.loop;
    return { ...doc, sprite, dirty: true };
}
function addAnimation(doc, name) {
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
function deleteAnimation(doc) {
    const names = Object.keys(doc.sprite.animations);
    if (names.length <= 1) {
        throw new Error('cannot delete the last animation - a sprite needs one');
    }
    const sprite = cloneSprite(doc.sprite);
    delete sprite.animations[doc.animation];
    const next = Object.keys(sprite.animations).sort()[0];
    return { ...doc, sprite, animation: next, frame: 0, dirty: true };
}
function toSprite(doc) {
    return cloneSprite(doc.sprite);
}
