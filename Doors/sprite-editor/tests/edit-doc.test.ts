/**
 * The sprite document: every edit the studio can make, as a pure op.
 *
 * The UI binds keys to these and paints the result; anything the artist
 * can do is assertable here, including the refusals - deleting the last
 * frame or last animation is refused rather than leaving a sprite the
 * loader would reject on the next door start.
 */

import assert from 'assert';
import { readSprite } from '../assets';
import {
  openDoc, currentFrame, selectAnimation, selectFrame, addFrame,
  deleteFrame, moveFrame, setCell, setPixel, frameIsPixelEditable,
  setTicksPerFrame, toggleLoop, addAnimation, deleteAnimation, toSprite,
} from '../edit-doc';
import { parseSprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

const pengo = () => openDoc(readSprite('pengo', 'pengo.sprite.json'));

export async function openingClonesAndSelectsTheFirstAnimation(): Promise<void> {
  const source = readSprite('pengo', 'pengo.sprite.json');
  const doc = openDoc(source);
  assert.strictEqual(doc.dirty, false);
  assert.ok(doc.sprite.animations[doc.animation], 'a real animation is selected');
  setCell(doc, 0, 0, { char: '#', fg: 7, bg: 0 });
  assert.strictEqual(
    source.animations[doc.animation].frames[0][0][0] === doc.sprite.animations[doc.animation].frames[0][0][0],
    false,
    'editing the doc must never reach the browser cache - open clones'
  );
}

export async function frameOperationsBehave(): Promise<void> {
  let doc = pengo();
  doc = selectAnimation(doc, 'death');
  doc = selectFrame(doc, 1); // mid-animation, so insert-after is observable
  const frames = () => doc.sprite.animations['death'].frames.length;
  const before = frames();

  doc = addFrame(doc, 'duplicate');
  assert.strictEqual(frames(), before + 1);
  assert.strictEqual(doc.frame, 2, 'the duplicate sits right AFTER the source');
  assert.deepStrictEqual(
    currentFrame(doc), doc.sprite.animations['death'].frames[1],
    'and it duplicates the frame the artist was looking at, not the last one'
  );

  doc = moveFrame(doc, -1);
  assert.strictEqual(doc.frame, 1, 'moved back one slot');

  doc = deleteFrame(doc);
  assert.strictEqual(frames(), before);
  assert.ok(doc.dirty);
}

export async function theLastFrameAndLastAnimationAreProtected(): Promise<void> {
  let doc = openDoc(readSprite('pengo', 'diamond.sprite.json'));
  // diamond has one animation (sparkle) with three frames
  doc = deleteFrame(doc); doc = deleteFrame(doc);
  assert.throws(() => deleteFrame(doc), /last frame/);
  assert.throws(() => deleteAnimation(doc), /last animation/);
}

export async function cellAndPixelEditsLand(): Promise<void> {
  let doc = pengo();
  doc = setCell(doc, 0, 0, { char: '*', fg: 11, bg: 0 });
  assert.deepStrictEqual(currentFrame(doc)[0][0], { char: '*', fg: 11, bg: 0 });
  doc = setCell(doc, 0, 0, null);
  assert.strictEqual(currentFrame(doc)[0][0], null);

  assert.ok(frameIsPixelEditable(doc), 'pengo art is half-block');
  doc = setPixel(doc, 0, 0, 9);
  assert.deepStrictEqual(currentFrame(doc)[0][0], { char: '▀', fg: 9, bg: 0 });
  doc = setPixel(doc, 1, 0, 11);
  assert.deepStrictEqual(currentFrame(doc)[0][0], { char: '▀', fg: 9, bg: 11 });
}

export async function pixelEditingRefusesNonHalfblockFrames(): Promise<void> {
  let doc = pengo();
  doc = setCell(doc, 0, 2, { char: 'A', fg: 7, bg: 0 });
  assert.strictEqual(frameIsPixelEditable(doc), false);
  assert.throws(() => setPixel(doc, 0, 0, 9), /pixel/);
}

export async function timingAndAnimationOpsBehave(): Promise<void> {
  let doc = pengo();
  const tpf = () => doc.sprite.animations[doc.animation].ticksPerFrame;
  const t0 = tpf();
  doc = setTicksPerFrame(doc, +2);
  assert.strictEqual(tpf(), t0 + 2);
  doc = setTicksPerFrame(doc, -99);
  assert.strictEqual(tpf(), 1, 'clamped at one tick per frame');

  const loop0 = doc.sprite.animations[doc.animation].loop;
  doc = toggleLoop(doc);
  assert.strictEqual(doc.sprite.animations[doc.animation].loop, !loop0);

  doc = addAnimation(doc, 'spin');
  assert.strictEqual(doc.animation, 'spin');
  assert.strictEqual(doc.sprite.animations['spin'].frames.length, 1);
  assert.throws(() => addAnimation(doc, 'spin'), /exists/);
  assert.throws(() => addAnimation(doc, ''), /name/);

  doc = deleteAnimation(doc);
  assert.ok(!doc.sprite.animations['spin']);
}

export async function whatSaveWritesIsLoadable(): Promise<void> {
  let doc = pengo();
  doc = setPixel(doc, 0, 0, 9);
  doc = addFrame(doc, 'duplicate');
  const sprite = toSprite(doc);
  // The strongest possible check: the loader's own validator accepts it.
  const reparsed = parseSprite(JSON.parse(JSON.stringify({
    name: sprite.name, cellW: sprite.cellW, cellH: sprite.cellH,
    animations: Object.fromEntries(Object.entries(sprite.animations).map(
      ([n, a]) => [n, { ticksPerFrame: a.ticksPerFrame, loop: a.loop,
        frames: a.frames.map(f => f.map(r => r.map(c => c ? [c.char, c.fg, c.bg] : null))) }]
    )),
  })), 'roundtrip');
  assert.strictEqual(reparsed.name, sprite.name);
}

export async function selectionMovesKeepIdentityWhenClamped(): Promise<void> {
  const doc = pengo();
  assert.strictEqual(selectFrame(doc, -5), doc, 'clamped select is identity');
  assert.strictEqual(doc.dirty, false, 'and selection never dirties');
}
