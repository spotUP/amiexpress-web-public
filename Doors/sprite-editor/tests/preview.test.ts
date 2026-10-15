/**
 * The preview renderer, pure in (sprite, animation, tick, scale).
 *
 * The playback timer just advances the tick; whether the picture MOVES is
 * assertable right here, with Pengo's real shipped sprites as the fixture
 * - so a sprite edit that breaks playback fails this suite, not the eye.
 */

import assert from 'assert';
import { readSprite } from '../assets';
import { previewLines } from '../preview';

export async function thePreviewIsTheFrameAtTheTick(): Promise<void> {
  const pengo = readSprite('pengo', 'pengo.sprite.json');
  const lines = previewLines(pengo, 'walk-right', 0, 1);
  assert.strictEqual(lines.length, pengo.cellH);
  assert.ok(lines[0].includes('-fg}'), 'tagged output, ready for a blessed box');
}

export async function playbackMovesBetweenTicks(): Promise<void> {
  const pengo = readSprite('pengo', 'pengo.sprite.json');
  const t0 = previewLines(pengo, 'walk-right', 0, 1).join('\n');
  const t3 = previewLines(pengo, 'walk-right', 3, 1).join('\n');
  assert.notStrictEqual(t0, t3, 'the walk cycle must move in the preview');
}

export async function scaleTwoDoublesEveryCell(): Promise<void> {
  const pengo = readSprite('pengo', 'pengo.sprite.json');
  const thin = previewLines(pengo, 'walk-right', 0, 1);
  const fat = previewLines(pengo, 'walk-right', 0, 2);
  const visible = (line: string) => line.replace(/\{[^}]*\}/g, '').length;
  assert.strictEqual(visible(fat[0]), visible(thin[0]) * 2);
}

export async function anUnknownAnimationThrowsLikeTheEngineDoes(): Promise<void> {
  const pengo = readSprite('pengo', 'pengo.sprite.json');
  assert.throws(() => previewLines(pengo, 'moonwalk', 0, 1), /moonwalk/);
}
