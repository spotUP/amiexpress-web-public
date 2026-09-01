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
import { SpriteStudioDoor, ZOOM_STEPS } from '../studio';
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
