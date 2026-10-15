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
exports.setFrame = setFrame;
exports.setTicksPerFrame = setTicksPerFrame;
exports.toggleLoop = toggleLoop;
exports.addAnimation = addAnimation;
exports.deleteAnimation = deleteAnimation;
exports.toSprite = toSprite;
exports.resizeSprite = resizeSprite;
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
/**
 * Replace the CURRENT frame wholesale.
 *
 * The edit screen hosts the ANSIEditor, whose canvas is the live current
 * frame; this is how that canvas re-enters the document. It replaced a
 * per-cell setCell(), which had no caller left once the widget owned
 * painting - a second mutation path into the same frames is exactly the
 * duplication hosting the widget exists to remove.
 *
 * Refuses a frame of the wrong size: the sprite format requires every
 * frame of every animation to match cellW/cellH, and the loader would
 * reject the file on next open rather than here.
 */
function setFrame(doc, frame) {
    if (frame.length !== doc.sprite.cellH) {
        throw new Error(`frame has ${frame.length} rows, sprite is ${doc.sprite.cellH} tall`);
    }
    for (const row of frame) {
        if (row.length !== doc.sprite.cellW) {
            throw new Error(`frame row has ${row.length} cells, sprite is ${doc.sprite.cellW} wide`);
        }
    }
    const frames = doc.sprite.animations[doc.animation].frames
        .map((f, i) => (i === doc.frame ? frame.map(r => r.map(c => (c ? { ...c } : null))) : f));
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
/**
 * Change a sprite's cell size, keeping the artwork that still fits.
 *
 * "there seem be no way to change canvas size for loaded projects"
 * (2026-09-02) - a sprite was whatever size it was created as, for ever.
 * Every frame of every animation is resized together, because the sprite's
 * cellW/cellH describe all of them and setFrame refuses anything else.
 *
 * Cells outside the new bounds are dropped and new ones are HOLES rather
 * than black, so growing a sprite does not put a box of opaque background
 * around the art.
 */
function resizeSprite(doc, cellW, cellH) {
    const w = Math.floor(cellW);
    const h = Math.floor(cellH);
    if (w < 1 || h < 1)
        throw new Error('A sprite is at least 1x1 cells.');
    if (w > 80 || h > 25)
        throw new Error('A sprite is at most 80x25 cells.');
    if (w === doc.sprite.cellW && h === doc.sprite.cellH)
        return doc;
    const resize = (frame) => Array.from({ length: h }, (_unusedRow, y) => Array.from({ length: w }, (_unusedCol, x) => {
        const cell = frame[y]?.[x];
        return cell ? { ...cell } : null;
    }));
    const sprite = JSON.parse(JSON.stringify(doc.sprite));
    sprite.cellW = w;
    sprite.cellH = h;
    for (const name of Object.keys(sprite.animations)) {
        sprite.animations[name] = {
            ...sprite.animations[name],
            frames: doc.sprite.animations[name].frames.map(resize),
        };
    }
    return { ...doc, sprite, dirty: true };
}
