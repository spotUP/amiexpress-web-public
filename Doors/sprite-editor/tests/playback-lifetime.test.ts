/**
 * Playback owns the canvas, so anything that replaces what the canvas
 * shows has to stop it first.
 *
 * Reported live 2026-09-01: "i cant load a new anim when an anim plays even
 * if i havent edited it". Nothing stopped the play timer except a keypress,
 * and File > Open is a MOUSE path - so opening a sprite built a new editor
 * while the old animation's frames kept being painted into it, a frame
 * every tick, over whatever had just been loaded.
 *
 * The same hole had a worse end: commit() reads the canvas back into the
 * document, so saving mid-playback would have written the frame that
 * happened to be on screen into the frame being edited.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { SpriteStudioDoor } from '../studio';
import { openDoc } from '../edit-doc';

function makeSprite(): Sprite {
  const blank = () => [[null, null], [null, null]];
  return {
    name: 'fixture', cellW: 2, cellH: 2,
    animations: {
      idle: { ticksPerFrame: 4, loop: true, frames: [blank(), blank(), blank()] },
      walk: { ticksPerFrame: 4, loop: true, frames: [blank(), blank()] },
    },
  } as Sprite;
}

/** An editor that records what playback does to it, without a screen. */
function fakeEditor() {
  return {
    painted: 0,
    modified: false,
    setCoreCanvas() { this.painted++; },
    getCoreCanvas: () => null,     // commit() has nothing to read back
    setUnderlay() {},
    setLabel() {},
    setTransparencyGuide() {},
    refreshExtraToolbar() {},
    isModified: () => false,
    focus() {},
    destroy() {},
    on() {},
  };
}

function playing(): any {
  const studio: any = new SpriteStudioDoor();
  studio.screen = { render() {}, on() {}, removeListener() {}, key() {}, unkey() {} };
  studio.editor = fakeEditor();
  studio.doc = openDoc(makeSprite());
  studio.playInPlace();
  assert.strictEqual(studio.playing, true, 'the fixture must actually be playing');
  return studio;
}

export async function committingTheCanvasStopsPlaybackFirst(): Promise<void> {
  // Save is the dangerous one: it commits, and mid-playback the canvas is
  // showing some other frame of the animation.
  const studio = playing();
  studio.commit();
  assert.strictEqual(studio.playing, false, 'playback is stopped before the canvas is read');
  assert.strictEqual(studio.playTimer, null, 'and its timer is cleared');
}

export async function aFrameOperationStopsPlaybackFirst(): Promise<void> {
  const studio = playing();
  studio.step(+1);
  assert.strictEqual(studio.playing, false);
  assert.strictEqual(studio.doc.frame, 1, 'and the operation still happens');
}

export async function switchingAnimationStopsPlayback(): Promise<void> {
  // The timer captured THIS animation's frames, so without stopping it the
  // canvas would keep showing the animation you just left.
  const studio = playing();
  studio.cycleAnimation();
  assert.strictEqual(studio.playing, false);
  assert.strictEqual(studio.doc.animation, 'walk');
}

export async function openingAnotherSpriteStopsPlayback(): Promise<void> {
  // The reported case, at the seam it actually failed: a new editor is
  // built and the old timer must not paint into it.
  const screen: any = new Screen({ title: 'playback', responsive: true, width: 100, height: 30 } as any);
  const studio: any = new SpriteStudioDoor();
  studio.screen = screen;
  studio.editor = fakeEditor();
  studio.doc = openDoc(makeSprite());
  try {
    studio.playInPlace();
    assert.strictEqual(studio.playing, true);

    await studio.openEditor();
    assert.strictEqual(studio.playing, false, 'the new editor is not painted over by the old animation');
    assert.strictEqual(studio.playTimer, null);
  } finally {
    studio.editor?.destroy?.();
    screen.destroy();
  }
}

export async function stoppingTwiceIsHarmless(): Promise<void> {
  const studio = playing();
  studio.commit();
  studio.commit();
  assert.strictEqual(studio.playing, false);
}
