/**
 * Whose turn it is, and who won.
 */
import * as assert from 'assert';
import {
  newMatch,
  activeWorm,
  teamWorms,
  teamHp,
  adjustAim,
  takeTurn,
  endTurn,
  activePlayerId,
  toView,
  fromView,
  MAX_WIND,
} from '../game';
import { isSolid, FIELD_WIDTH } from '../physics';

export async function aMatchStartsWithTwoTeamsOnOppositeSides(): Promise<void> {
  const match = newMatch({ seed: 7, wormsPerTeam: 2, teams: ['RED', 'BLUE'] });
  assert.strictEqual(match.worms.length, 4);
  assert.strictEqual(teamWorms(match, 0).length, 2);
  assert.strictEqual(teamWorms(match, 1).length, 2);

  const red = teamWorms(match, 0).map(w => w.x);
  const blue = teamWorms(match, 1).map(w => w.x);
  assert.ok(Math.max(...red) < FIELD_WIDTH / 2, 'red is on the left half');
  assert.ok(Math.min(...blue) >= FIELD_WIDTH / 2, 'blue is on the right half');
}

export async function wormsStandOnTheGroundNotInIt(): Promise<void> {
  const match = newMatch({ seed: 11, wormsPerTeam: 3 });
  for (const worm of match.worms) {
    assert.ok(!isSolid(match.terrain, worm.x, worm.y), `${worm.id} is not buried`);
    assert.ok(isSolid(match.terrain, worm.x, worm.y + 1), `${worm.id} has ground under it`);
  }
}

export async function theSameSeedMakesTheSameMatch(): Promise<void> {
  const a = newMatch({ seed: 42, wormsPerTeam: 2 });
  const b = newMatch({ seed: 42, wormsPerTeam: 2 });
  assert.deepStrictEqual(a.worms, b.worms);
  assert.strictEqual(a.wind, b.wind);
}

export async function aimIsClampedNotWrapped(): Promise<void> {
  const match = newMatch({ seed: 1 });
  adjustAim(match, { angle: 500 });
  assert.strictEqual(match.aim.angle, 90, 'straight up is as far as it goes');
  adjustAim(match, { angle: -500 });
  assert.strictEqual(match.aim.angle, 0, 'and flat is the other end');
  adjustAim(match, { power: 99 });
  assert.strictEqual(match.aim.power, 10);
  adjustAim(match, { power: -99 });
  assert.strictEqual(match.aim.power, 1, 'power never reaches zero');
  adjustAim(match, { facing: -1 });
  assert.strictEqual(match.aim.facing, -1);
}

export async function firingHandsTheTurnOver(): Promise<void> {
  const match = newMatch({ seed: 3, wormsPerTeam: 2 });
  assert.strictEqual(match.turn, 0);
  const outcome = takeTurn(match);
  assert.ok(outcome, 'a turn was taken');
  assert.strictEqual(match.turn, 1, 'the other team is up');
  assert.strictEqual(match.turnsTaken, 1);
  assert.ok(Math.abs(match.wind) <= MAX_WIND, 'the wind was rolled for them');
}

export async function aTeamsWormsTakeItInTurns(): Promise<void> {
  const match = newMatch({ seed: 5, wormsPerTeam: 2 });
  const first = activeWorm(match)!.id;
  takeTurn(match); // red fires
  takeTurn(match); // blue fires, red is up again
  assert.strictEqual(match.turn, 0);
  assert.notStrictEqual(activeWorm(match)!.id, first, 'red fields its other worm');
}

export async function killingTheLastEnemyWinsTheMatch(): Promise<void> {
  const match = newMatch({ seed: 9, wormsPerTeam: 1 });
  // Reach in and finish blue off, then end the turn the way a shot does.
  teamWorms(match, 1).forEach(worm => { worm.hp = 0; });
  endTurn(match);
  assert.strictEqual(match.over, true);
  assert.strictEqual(match.winner, 0);
  assert.strictEqual(activeWorm(match), null, 'nobody is up in a finished match');
  assert.strictEqual(takeTurn(match), null, 'and nobody can fire');
}

export async function wipingOutBothTeamsIsADraw(): Promise<void> {
  // One blast can take the last worm on each side, and that is a real
  // result - it must not quietly award the win to whoever fired.
  const match = newMatch({ seed: 13, wormsPerTeam: 1 });
  match.worms.forEach(worm => { worm.hp = 0; });
  endTurn(match);
  assert.strictEqual(match.over, true);
  assert.strictEqual(match.winner, null);
}

export async function teamHealthIsTheSumOfItsWorms(): Promise<void> {
  const match = newMatch({ seed: 17, wormsPerTeam: 2, hp: 80 });
  assert.strictEqual(teamHp(match, 0), 160);
  teamWorms(match, 0)[0].hp = 30;
  assert.strictEqual(teamHp(match, 0), 110);
}

export async function onlyTheTeamWhoseTurnItIsMayFire(): Promise<void> {
  const match = newMatch({ seed: 19, playerIds: ['red@1', 'blue@2'] });
  assert.strictEqual(activePlayerId(match), 'red@1');
  takeTurn(match);
  assert.strictEqual(activePlayerId(match), 'blue@2');
}

export async function aMatchTravelsToTheOtherCallerIntact(): Promise<void> {
  // The host owns the match and sends the other side a picture of it, so
  // neither machine has to agree with the other about floating point.
  const match = newMatch({ seed: 23, wormsPerTeam: 2 });
  takeTurn(match);

  const view = JSON.parse(JSON.stringify(toView(match)));
  const { terrain, worms, view: back } = fromView(view);

  assert.deepStrictEqual(Array.from(terrain.solid), Array.from(match.terrain.solid));
  assert.deepStrictEqual(worms, match.worms);
  assert.strictEqual(back.turn, match.turn);
  assert.strictEqual(back.wind, match.wind);
  assert.ok(Array.isArray(back.lastPath) && back.lastPath.length > 1, 'the arc travels too');
}
