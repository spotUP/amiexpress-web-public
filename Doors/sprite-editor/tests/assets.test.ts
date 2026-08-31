/**
 * The studio's filesystem access, guarded.
 *
 * The door-delete incident rule applies verbatim: a recursive path needs a
 * RESOLVED-path guard, not a trusted string. Every read the UI can trigger
 * funnels through resolveAssetPath, and these tests are the proof that a
 * hostile or buggy selection cannot leave Doors/<door>/<kind>/.
 */

import assert from 'assert';
import { join } from 'path';
import {
  DOORS_ROOT,
  listDoorsWithSprites,
  listSprites,
  readSprite,
  resolveAssetPath,
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
