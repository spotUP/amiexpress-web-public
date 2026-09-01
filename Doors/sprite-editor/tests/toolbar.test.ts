/**
 * The strip under the canvas.
 *
 * Playback, frame stepping, onion skin and zoom were menu items, which is a
 * dropdown for something you do on every frame of an animation. The door
 * contributes them to the editor as a toolbar the same way it contributes
 * Frame and Animation as menus; the editor decides whether there is a row
 * for it (see sdk/tests/unit/ansi-editor-host-toolbar.test.ts).
 *
 * These drive the segments' own actions rather than reading the source, so
 * a strip that is wired to nothing fails here.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { SpriteStudioDoor, ZOOM_STEPS, canvasRoom, zoomThatFits } from '../studio';
import { openDoc } from '../edit-doc';

const source = readFileSync(join(__dirname, '..', 'studio.ts'), 'utf8');

function makeSprite(): Sprite {
  const blank = () => [[null, null, null], [null, null, null]];
  return {
    name: 'fixture', cellW: 3, cellH: 2,
    animations: {
      idle: { ticksPerFrame: 4, loop: true, frames: [blank(), blank(), blank()] },
    },
  } as Sprite;
}

/**
 * A door with a three-frame sprite open. No editor and no real screen: the
 * strip's actions work on the DOCUMENT, and a repaint is all the screen is
 * asked for here.
 */
function studioWithSprite(): any {
  const studio: any = new SpriteStudioDoor();
  studio.doc = openDoc(makeSprite());
  studio.screen = { render() {} };
  return studio;
}

function labels(studio: any): string[][] {
  return studio.buildToolbar().map((group: any[]) =>
    group.map(item => (typeof item.label === 'function' ? item.label() : item.label)));
}

/** The action of the segment reading `text`, wherever it is on the strip. */
function press(studio: any, text: string): void {
  for (const group of studio.buildToolbar()) {
    for (const item of group) {
      const label = typeof item.label === 'function' ? item.label() : item.label;
      if (label === text) {
        assert.ok(item.action, `"${text}" must be a button, not a readout`);
        item.action();
        return;
      }
    }
  }
  assert.fail(`no segment reads "${text}"`);
}

export async function theStripIsPlaybackFramesOnionAndZoom(): Promise<void> {
  const studio = studioWithSprite();
  assert.deepStrictEqual(labels(studio), [
    ['|<', '<<', '|>', '>>', '>|'],
    ['1/3', '[+]', '[-]'],
    ['ONION off'],
    ['1x'],
  ]);
}

export async function theFrameReadoutFollowsTheFrame(): Promise<void> {
  const studio = studioWithSprite();
  press(studio, '>>');
  assert.deepStrictEqual(labels(studio)[1][0], '2/3');
  press(studio, '>>');
  assert.deepStrictEqual(labels(studio)[1][0], '3/3');
  press(studio, '<<');
  assert.deepStrictEqual(labels(studio)[1][0], '2/3');
}

export async function theEndButtonsGoToTheEnds(): Promise<void> {
  const studio = studioWithSprite();
  press(studio, '>|');
  assert.strictEqual(studio.doc.frame, 2, 'the last frame');
  press(studio, '|<');
  assert.strictEqual(studio.doc.frame, 0, 'and back to the first');
}

export async function aNewFrameArrivesNextToThisOne(): Promise<void> {
  const studio = studioWithSprite();
  press(studio, '[+]');
  assert.deepStrictEqual(labels(studio)[1][0], '2/4',
    'duplicating puts the copy after the current frame and moves there');
}

export async function deletingAFrameAsksFirst(): Promise<void> {
  const studio = studioWithSprite();
  let asked = 0;
  studio.deleteFrameAsked = async () => { asked++; };
  press(studio, '[-]');
  assert.strictEqual(asked, 1, 'the strip must go through the same confirmation the menu does');
  assert.strictEqual(studio.doc.sprite.animations.idle.frames.length, 3, 'nothing deleted yet');
}

export async function thePlayButtonBecomesAStopButton(): Promise<void> {
  const studio = studioWithSprite();
  assert.strictEqual(labels(studio)[0][2], '|>');

  let stopped = 0;
  studio.playing = true;
  studio.stopPlay = () => { stopped++; };
  assert.strictEqual(labels(studio)[0][2], '[]', 'a running animation offers to stop');
  press(studio, '[]');
  assert.strictEqual(stopped, 1, 'and stopping it does not need a keypress');
}

export async function onionSkinSaysWhichWayItIs(): Promise<void> {
  const studio = studioWithSprite();
  press(studio, 'ONION off');
  assert.strictEqual(studio.onionSkin, true);
  assert.deepStrictEqual(labels(studio)[2], ['ONION on']);
  press(studio, 'ONION on');
  assert.strictEqual(studio.onionSkin, false);
}

export async function zoomStepsUpAndWrapsRoundAtTheTop(): Promise<void> {
  const studio = studioWithSprite();
  const asked: number[] = [];
  studio.setZoom = async (z: number) => { asked.push(z); studio.zoom = z; };

  press(studio, '1x');
  assert.deepStrictEqual(asked, [ZOOM_STEPS[1]]);

  studio.zoom = ZOOM_STEPS[ZOOM_STEPS.length - 1];
  press(studio, `${studio.zoom}x`);
  assert.strictEqual(asked[1], ZOOM_STEPS[0],
    'the top of the ladder wraps to 1:1 - a click that does nothing reads as a broken button');
}

export async function artFilesGetNoStrip(): Promise<void> {
  // A .ans has no frames, no animation and no cells to magnify. Source, not
  // behaviour: the wiring is one expression in the editor's options.
  assert.ok(source.includes('extraToolbar: this.doc ? this.buildToolbar() : undefined'),
    'the strip is handed over only when a sprite is open');
}

/**
 * The wheel, at half speed.
 *
 * "the scrollwheel zooms to fast halve the speed" - one ladder step per
 * wheel EVENT is not one per gesture; a trackpad reports several events
 * for a single flick and the zoom ran away.
 */
export async function theWheelTakesTwoNotchesPerZoomStep(): Promise<void> {
  const studio = studioWithSprite();
  const asked: number[] = [];
  studio.setZoom = async (z: number) => { asked.push(z); studio.zoom = z; };

  studio.wheelZoom(1);
  assert.deepStrictEqual(asked, [], 'one notch is not a step');
  studio.wheelZoom(1);
  assert.deepStrictEqual(asked, [ZOOM_STEPS[1]], 'the second notch is');
  studio.wheelZoom(1);
  assert.deepStrictEqual(asked, [ZOOM_STEPS[1]], 'and the count starts again');
  studio.wheelZoom(1);
  assert.deepStrictEqual(asked, [ZOOM_STEPS[1], ZOOM_STEPS[2]]);
}

export async function turningTheWheelBackStartsCountingAgain(): Promise<void> {
  // A notch up then a notch down is not "two notches" of anything - it is
  // half a gesture each way, and neither should move the ladder.
  const studio = studioWithSprite();
  const asked: number[] = [];
  studio.setZoom = async (z: number) => { asked.push(z); studio.zoom = z; };

  studio.wheelZoom(1);
  studio.wheelZoom(-1);
  assert.deepStrictEqual(asked, [], 'the direction change resets the count');
  studio.wheelZoom(-1);
  assert.deepStrictEqual(asked, [ZOOM_STEPS[0]], 'two down from 1:1 stays at 1:1 (clamped)');
}

/**
 * A new document opens at a size that fits it.
 *
 * "it doesnt resize the canvas to the new anim loaded" - the canvas widget
 * did take the new sprite's cell size (proven headless through the real
 * open path), but the MAGNIFICATION came from the sprite before it. A
 * 20-cell log drawn at the 8x chosen for a 5-cell egg is 160 characters
 * wide in a 74-character room, so it ran off the side and read as a canvas
 * that had not resized.
 */
export async function theRoomIsTheEditorMinusItsChrome(): Promise<void> {
  // Sidebar 6 columns; menu bar, F-key toolbar and status bar a row each.
  assert.deepStrictEqual(canvasRoom(80, 25), { w: 74, h: 22 });
  assert.deepStrictEqual(canvasRoom(120, 40), { w: 114, h: 37 });
}

export async function theLadderStopsWhereTheArtStopsFitting(): Promise<void> {
  const room = canvasRoom(80, 25);
  assert.strictEqual(zoomThatFits(5, 2, room), 8, 'a small sprite reaches the top of the ladder');
  assert.strictEqual(zoomThatFits(20, 2, room), 2, '20 cells fit twice over, not four times');
  assert.strictEqual(zoomThatFits(40, 20, room), 1, 'and a big one only at actual size');
  assert.strictEqual(zoomThatFits(200, 100, room), 1,
    'art bigger than the room still opens - clipped beats refused');
}

export async function openingAnotherSpriteGoesBackToActualSize(): Promise<void> {
  const studio = studioWithSprite();
  studio.zoom = 8;
  studio.doc = openDoc({
    name: 'log', cellW: 20, cellH: 2,
    animations: { idle: { ticksPerFrame: 4, loop: true, frames: [[[null], [null]]] } },
  } as Sprite);
  studio.resetZoomForDocument();
  assert.strictEqual(studio.zoom, 1, 'the new sprite opens at 1:1, not at the last one’s zoom');
}

export async function zoomingIsCappedAtWhatFits(): Promise<void> {
  const studio = studioWithSprite();
  studio.doc = openDoc({
    name: 'log', cellW: 20, cellH: 2,
    animations: { idle: { ticksPerFrame: 4, loop: true, frames: [[[null], [null]]] } },
  } as Sprite);
  studio.terminalMode = { mode: () => 'fixed' };

  const asked: number[] = [];
  const openEditor = studio.openEditor;
  studio.openEditor = async () => { asked.push(studio.zoom); };

  await studio.setZoom(8);
  assert.deepStrictEqual(asked, [2], '8:1 on a 20-cell sprite is capped to the 2:1 that fits');
  await studio.setZoom(4);
  assert.deepStrictEqual(asked, [2], 'and asking again for something too big changes nothing');
  assert.strictEqual(typeof openEditor, 'function');
}

export async function theDoorOpensAtTheSizeTheBoardServes(): Promise<void> {
  // "sprited alt+enter does nothing it opens in fullscreen in bbs mode"
  // (2026-09-02). Opening wide hid the toggle: the first press took the
  // room away, which reads as nothing happening.
  assert.ok(source.includes("start: 'fixed'"),
    'the size switch must start fixed, and the caller asks for the rest');
}

/**
 * The File menu offers only what this door actually wired.
 *
 * "most entries seem dead in the file menu and many other menus"
 * (2026-09-02). Save As and New called host callbacks the studio never
 * supplied, so choosing them did nothing at all - and the widget's own
 * "new document" would have blanked the canvas while leaving the door's
 * sprite open behind it.
 */
export async function theEditorIsGivenTheDoorsOwnFileOperations(): Promise<void> {
  for (const wired of ['onNew:', 'onSaveAs:', 'onResize:', 'onOpen:', 'onSave:']) {
    assert.ok(source.includes(wired),
      `the editor must be handed ${wired.replace(':', '')} - an unwired menu item is a dead one`);
  }
}

export async function playbackTakesTheCaretOffTheArt(): Promise<void> {
  // "when anims play the cursor/caret must be hidden" (2026-09-02).
  assert.ok(source.includes('this.editor.setCursorVisible?.(false)'),
    'playback hides the drawing cursor');
  assert.ok(source.includes('this.editor?.setCursorVisible?.(true)'),
    'and stopping puts it back');
}

export async function theSpriteCanBeResizedAfterItIsOpen(): Promise<void> {
  const studio = studioWithSprite();
  const cmd = studio.commands();
  assert.ok(cmd.resize, 'Sprite Size... must be in the door’s own menu');
  assert.ok(source.includes('resizeSprite(this.doc'),
    'and it goes through the document op, not the editor canvas alone');
}
