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
  deleteFrame, moveFrame, setFrame,
  setTicksPerFrame, toggleLoop, addAnimation, deleteAnimation, toSprite,
  floodFill, resizeSprite,
} from '../edit-doc';
import {
  parseSprite, Sprite, compilePixels, decompilePixels, PixelGrid,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';

const pengo = () => openDoc(readSprite('pengo', 'pengo.sprite.json'));

/** A one-animation, one-frame sprite whose frame is exactly this PixelGrid. */
function pixelSprite(pixels: PixelGrid): Sprite {
  return {
    name: 'fixture',
    cellW: pixels[0].length,
    cellH: pixels.length / 2,
    animations: { only: { ticksPerFrame: 1, loop: true, frames: [compilePixels(pixels)] } },
  };
}

export async function openingClonesAndSelectsTheFirstAnimation(): Promise<void> {
  const source = readSprite('pengo', 'pengo.sprite.json');
  const doc = openDoc(source);
  assert.strictEqual(doc.dirty, false);
  assert.ok(doc.sprite.animations[doc.animation], 'a real animation is selected');
  setFrame(doc, currentFrame(doc).map(row => row.map(() => ({ char: '#', fg: 7, bg: 0 }))));
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
  // An edited frame, written the way the editor writes one: whole, through
  // setFrame - the same path the hosted canvas takes on every commit.
  const edited = currentFrame(doc).map(row => row.map(c => (c ? { ...c } : null)));
  edited[0][0] = { char: '#', fg: 9, bg: 0 };
  doc = setFrame(doc, edited);
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


/**
 * A sprite can change size after it is made.
 *
 * "there seem be no way to change canvas size for loaded projects"
 * (2026-09-02) - a sprite was whatever it was created as, for ever.
 */
export async function resizingKeepsTheArtworkThatStillFits(): Promise<void> {
  // pengo is 5x2; paint its own shape, then crop to the top-left 2x1.
  const doc = pengo();
  const painted = { char: '█', fg: 2, bg: 0 };
  const row = (cells: Array<typeof painted | null>) => cells;
  let next = setFrame(doc, [
    row([painted, painted, null, null, null]),
    row([null, painted, null, null, null]),
  ]);

  next = resizeSprite(next, 2, 1);
  assert.strictEqual(next.sprite.cellW, 2);
  assert.strictEqual(next.sprite.cellH, 1);
  const frame = next.sprite.animations[next.animation].frames[next.frame];
  assert.strictEqual(frame.length, 1, 'one row now');
  assert.strictEqual(frame[0].length, 2, 'two columns now');
  assert.deepStrictEqual(frame[0][0], painted, 'and the art inside them survives');
}

export async function growingASpriteAddsHolesNotBlackness(): Promise<void> {
  const doc = pengo();
  const bigger = resizeSprite(doc, 5, 4);
  const frame = bigger.sprite.animations[bigger.animation].frames[0];
  assert.strictEqual(frame.length, 4);
  assert.strictEqual(frame[3].length, 5);
  assert.strictEqual(frame[3][4], null,
    'a new cell is a HOLE - growing a sprite must not box the art in opaque black');
}

export async function everyAnimationIsResizedTogether(): Promise<void> {
  // cellW/cellH describe every frame of every animation; setFrame refuses
  // anything else, so a half-resized sprite would be unusable.
  const doc = pengo();
  const bigger = resizeSprite(doc, 4, 3);
  for (const name of Object.keys(bigger.sprite.animations)) {
    for (const frame of bigger.sprite.animations[name].frames) {
      assert.strictEqual(frame.length, 3, `${name} frames are 3 rows`);
      assert.strictEqual(frame[0].length, 4, `${name} frames are 4 columns`);
    }
  }
  assert.strictEqual(bigger.dirty, true, 'and the document is dirty afterwards');
}

export async function aRefusedSizeIsRefusedLoudly(): Promise<void> {
  const doc = pengo();
  assert.throws(() => resizeSprite(doc, 0, 4), /at least 1x1/);
  assert.throws(() => resizeSprite(doc, 200, 4), /at most 80x25/);
  assert.strictEqual(resizeSprite(doc, doc.sprite.cellW, doc.sprite.cellH), doc,
    'and asking for the size it already is changes nothing');
}
