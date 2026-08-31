/**
 * The studio's filesystem access, guarded.
 *
 * The door-delete incident rule applies verbatim: a recursive path needs a
 * RESOLVED-path guard, not a trusted string. Every read the UI can trigger
 * funnels through resolveAssetPath, and these tests are the proof that a
 * hostile or buggy selection cannot leave Doors/<door>/<kind>/.
 */

import assert from 'assert';
import * as fs from 'fs';
import { join } from 'path';
import {
  DOORS_ROOT,
  listDoorsWithSprites,
  listSprites,
  readSprite,
  resolveAssetPath,
  writeSprite,
  writeArt,
  listArt,
} from '../assets';

export async function doorsRootIsTheDoorsDirectory(): Promise<void> {
  assert.ok(DOORS_ROOT.endsWith('/Doors') || DOORS_ROOT.endsWith('\\Doors'),
    `DOORS_ROOT resolves to ${DOORS_ROOT}`);
}

export async function pengoIsListedBecauseItShipsSprites(): Promise<void> {
  const doors = listDoorsWithSprites();
  assert.ok(doors.includes('pengo'), `got: ${doors.join(', ')}`);
  // Sorted, so the browser list is stable between visits.
  assert.deepStrictEqual(doors, [...doors].sort());
}

export async function pengoSpritesAreListed(): Promise<void> {
  const files = listSprites('pengo');
  assert.ok(files.includes('pengo.sprite.json'), `got: ${files.join(', ')}`);
  assert.ok(files.every(f => f.endsWith('.sprite.json')));
}

export async function aRealSpriteLoadsValidated(): Promise<void> {
  const sprite = readSprite('pengo', 'pengo.sprite.json');
  assert.strictEqual(sprite.name, 'pengo');
  assert.ok(sprite.animations['walk-right'], 'validated through parseSprite');
}

export async function traversalIsRefusedAtEveryArgument(): Promise<void> {
  // Each of these resolves outside Doors/<door>/sprites/ and must throw.
  const attacks: Array<[string, string]> = [
    ['../web', 'x.sprite.json'],
    ['pengo', '../../pengo/highscores.json'],
    ['pengo', '../../pengo.sprite.json'],
    ['/etc', 'passwd'],
    ['pengo', '/etc/passwd'],
  ];
  for (const [door, file] of attacks) {
    assert.throws(
      () => resolveAssetPath(door, 'sprites', file),
      /outside/,
      `not refused: door=${door} file=${file}`
    );
  }
  // The '.'-listing shortcut must not bypass containment when the DOOR
  // argument is the traversal - the review's reproduction, pinned.
  assert.throws(() => resolveAssetPath('..', 'sprites', '.'), /outside/);
  assert.throws(() => resolveAssetPath('../web', 'sprites', '.'), /outside/);
}

export async function theGuardIsResolvedPathsNotStrings(): Promise<void> {
  // A name that CONTAINS the right prefix but escapes anyway - the exact
  // shape a startsWith-on-strings guard misses.
  assert.throws(
    () => resolveAssetPath('pengo', 'sprites', '..%2F..%2Fsecrets'.replace(/%2F/g, '/')),
    /outside/
  );
  // And the honest case still passes.
  const ok = resolveAssetPath('pengo', 'sprites', 'pengo.sprite.json');
  assert.strictEqual(ok, join(DOORS_ROOT, 'pengo', 'sprites', 'pengo.sprite.json'));
}

export async function writeSpriteRoundTripsThroughDisk(): Promise<void> {
  const scratchDoor = 'sprite-editor'; // our own door: safe scratch space
  const sprite = readSprite('pengo', 'egg.sprite.json');
  const renamed = { ...sprite, name: 'scratch-egg' };

  writeSprite(scratchDoor, 'scratch-egg.sprite.json', renamed);
  try {
    const back = readSprite(scratchDoor, 'scratch-egg.sprite.json');
    assert.deepStrictEqual(back, renamed, 'what was written is what loads');
  } finally {
    fs.unlinkSync(resolveAssetPath(scratchDoor, 'sprites', 'scratch-egg.sprite.json'));
  }
}

export async function writesAreGuardedLikeReads(): Promise<void> {
  const sprite = readSprite('pengo', 'egg.sprite.json');
  assert.throws(
    () => writeSprite('..', 'x.sprite.json', sprite), /outside/,
    'a write outside the fence is the worst version of the traversal bug'
  );
  assert.throws(
    () => writeSprite('pengo', '../../evil.sprite.json', sprite), /outside/
  );
}

export async function artListingsAndWritesAreGuarded(): Promise<void> {
  assert.throws(() => writeArt('..', 'x.ans', Buffer.from('x')), /outside/);
  const arts = listArt('pengo'); // no art/ directory yet - empty, not a throw
  assert.deepStrictEqual(arts, []);
}
