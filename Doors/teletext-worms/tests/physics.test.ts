/**
 * Where the shell lands.
 *
 * Every assertion here is about the 80x60 playfield teletext actually
 * gives us - there is no point in a physics model finer than the screen,
 * and no point in testing one.
 */
import * as assert from 'assert';
import {
  makeRng,
  generateTerrain,
  emptyTerrain,
  isSolid,
  surfaceAt,
  carve,
  fire,
  explode,
  settle,
  place,
  FIELD_WIDTH,
  FIELD_HEIGHT,
  type Terrain,
  type Worm,
} from '../physics';

function flatGround(top = 40): Terrain {
  const terrain = emptyTerrain();
  for (let x = 0; x < terrain.width; x++) {
    for (let y = top; y < terrain.height; y++) terrain.solid[y * terrain.width + x] = 1;
  }
  return terrain;
}

function worm(id: string, team: number, x: number, y: number, hp = 100): Worm {
  return { id, team, x, y, hp };
}

export async function theFieldIsWhatTeletextGives(): Promise<void> {
  // 40 cells of block graphics, two pixels each, twenty rows of three.
  assert.strictEqual(FIELD_WIDTH, 80);
  assert.strictEqual(FIELD_HEIGHT, 60);
}

export async function terrainIsGroundBelowAndSkyAbove(): Promise<void> {
  const terrain = generateTerrain(makeRng(1234));
  for (let x = 0; x < terrain.width; x++) {
    assert.ok(isSolid(terrain, x, terrain.height - 1), `column ${x} has a floor`);
    assert.ok(!isSolid(terrain, x, 0), `column ${x} has sky`);
  }
}

export async function theSameSeedMakesTheSameLandscape(): Promise<void> {
  const a = generateTerrain(makeRng(99));
  const b = generateTerrain(makeRng(99));
  assert.deepStrictEqual(Array.from(a.solid), Array.from(b.solid));
  const c = generateTerrain(makeRng(100));
  assert.notDeepStrictEqual(Array.from(a.solid), Array.from(c.solid));
}

export async function surfaceFindsTheTopOfAColumn(): Promise<void> {
  const terrain = flatGround(30);
  assert.strictEqual(surfaceAt(terrain, 10), 30);
  assert.strictEqual(place(terrain, 10).y, 29, 'a worm stands on top of it');

  carve(terrain, { x: 10, y: 31 }, 4);
  assert.ok(surfaceAt(terrain, 10) > 30, 'a crater lowers the surface');
}

export async function aShotStraightUpComesBackDown(): Promise<void> {
  const terrain = flatGround(40);
  const shot = fire(terrain, { x: 40, y: 39 }, [], { angle: 90, power: 8, facing: 1, wind: 0 });
  assert.strictEqual(shot.ending, 'terrain', 'it lands');
  assert.ok(Math.abs(shot.impact!.x - 40) < 6, `it lands near where it left: ${shot.impact!.x}`);
}

export async function morePowerGoesFurther(): Promise<void> {
  const terrain = flatGround(40);
  let last = 0;
  for (const power of [3, 5, 7, 9]) {
    const shot = fire(terrain, { x: 10, y: 39 }, [], { angle: 45, power, facing: 1, wind: 0 });
    const distance = (shot.impact?.x ?? terrain.width) - 10;
    assert.ok(distance > last, `power ${power} should beat power before it (${distance} vs ${last})`);
    last = distance;
  }
}

export async function facingDecidesWhichWayItFlies(): Promise<void> {
  const terrain = flatGround(40);
  const right = fire(terrain, { x: 40, y: 39 }, [], { angle: 45, power: 6, facing: 1, wind: 0 });
  const left = fire(terrain, { x: 40, y: 39 }, [], { angle: 45, power: 6, facing: -1, wind: 0 });
  assert.ok(right.impact!.x > 40);
  assert.ok(left.impact!.x < 40);
}

export async function windPushesTheShell(): Promise<void> {
  const terrain = flatGround(40);
  const still = fire(terrain, { x: 20, y: 39 }, [], { angle: 60, power: 6, facing: 1, wind: 0 });
  const tail = fire(terrain, { x: 20, y: 39 }, [], { angle: 60, power: 6, facing: 1, wind: 5 });
  const head = fire(terrain, { x: 20, y: 39 }, [], { angle: 60, power: 6, facing: 1, wind: -5 });
  assert.ok(tail.impact!.x > still.impact!.x, 'a tailwind carries it');
  assert.ok(head.impact!.x < still.impact!.x, 'a headwind holds it back');
  // ...but never more than power does. Wind is a correction, not the game.
  const harder = fire(terrain, { x: 20, y: 39 }, [], { angle: 60, power: 8, facing: 1, wind: 0 });
  assert.ok(
    harder.impact!.x - still.impact!.x > tail.impact!.x - still.impact!.x,
    'two more power should beat a full tailwind',
  );
}

export async function aShotOffTheSideIsGone(): Promise<void> {
  const terrain = flatGround(58);
  const shot = fire(terrain, { x: 75, y: 57 }, [], { angle: 10, power: 10, facing: 1, wind: 5 });
  assert.strictEqual(shot.ending, 'offfield');
  assert.strictEqual(shot.impact, null);
}

export async function aDirectHitIsReported(): Promise<void> {
  const terrain = flatGround(40);
  const target = worm('1-0', 1, 50, 39);
  const shot = fire(terrain, { x: 20, y: 39 }, [target], { angle: 20, power: 10, facing: 1, wind: 0 });
  // Not every angle connects; what matters is that when the path crosses a
  // worm the shot stops there and says whose it was.
  if (shot.ending === 'worm') {
    assert.strictEqual(shot.hit, '1-0');
    assert.ok(Math.abs(shot.impact!.x - 50) <= 2);
  } else {
    const crossed = shot.path.some(p => Math.abs(p.x - 50) <= 1 && Math.abs(p.y - 39) <= 2);
    assert.ok(!crossed, 'a path that crossed the worm must have stopped there');
  }
}

export async function theShellDoesNotTunnelThroughThinGround(): Promise<void> {
  // A one-pixel ridge is the whole reason flight is stepped by half a pixel
  // instead of by a time slice.
  const terrain = emptyTerrain();
  for (let y = 0; y < terrain.height; y++) terrain.solid[y * terrain.width + 45] = 1;
  const shot = fire(terrain, { x: 20, y: 30 }, [], { angle: 5, power: 10, facing: 1, wind: 0 });
  assert.strictEqual(shot.ending, 'terrain');
  assert.ok(Math.abs(shot.impact!.x - 45) <= 1, `stopped at the wall: ${shot.impact!.x}`);
}

export async function theBlastHurtsMostAtTheCentre(): Promise<void> {
  const terrain = flatGround(40);
  const near = worm('0-0', 0, 30, 39);
  const far = worm('0-1', 0, 36, 39);
  const away = worm('0-2', 0, 70, 39);
  const damage = explode(terrain, [near, far, away], { x: 30, y: 39 }, 7, 45);

  assert.strictEqual(damage.find(d => d.id === '0-2'), undefined, 'out of range is untouched');
  const nearHit = damage.find(d => d.id === '0-0')!.amount;
  const farHit = damage.find(d => d.id === '0-1')!.amount;
  assert.ok(nearHit > farHit, `${nearHit} should beat ${farHit}`);
  assert.strictEqual(near.hp, 100 - nearHit);
  assert.ok(!isSolid(terrain, 30, 41), 'and it leaves a crater');
}

export async function aWormFallsIntoACraterAndALongFallHurts(): Promise<void> {
  const terrain = flatGround(20);
  const standing = worm('0-0', 0, 40, 19);
  settle(terrain, [standing]);
  assert.strictEqual(standing.y, 19, 'solid ground holds it up');
  assert.strictEqual(standing.hp, 100);

  carve(terrain, { x: 40, y: 30 }, 12);
  settle(terrain, [standing]);
  assert.ok(standing.y > 19, 'the ground went, so it fell');
  assert.ok(standing.hp < 100, 'and a long fall costs it');
}

export async function fallingOutOfTheWorldIsFatal(): Promise<void> {
  const terrain = emptyTerrain();
  const doomed = worm('0-0', 0, 40, 5);
  settle(terrain, [doomed]);
  assert.strictEqual(doomed.hp, 0, 'there was no floor');
}
