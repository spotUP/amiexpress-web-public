/**
 * Drawing the battlefield.
 *
 * The assertions are about what a caller can actually see: the ground is
 * where the ground is, the two teams are different colours, and the arc
 * shows up when a shot has been taken.
 */
import * as assert from 'assert';
import { matchPage, FIELD_TOP_ROW, FIELD_CELL_ROWS } from '../render';
import { emptyTerrain, type Terrain, type Worm } from '../physics';
import { renderSubpageLines } from '@amiexpress/bbs-door-sdk/teletext/render-session';

function flat(top = 40): Terrain {
  const terrain = emptyTerrain();
  for (let x = 0; x < terrain.width; x++) {
    for (let y = top; y < terrain.height; y++) terrain.solid[y * terrain.width + x] = 1;
  }
  return terrain;
}

const HUD = {
  teams: [
    { name: 'RED', hp: 200, worms: 2 },
    { name: 'BLUE', hp: 150, worms: 2 },
  ],
  turn: 0,
  wind: 3,
  angle: 45,
  power: 6,
  facing: 1 as const,
};

function lines(page: ReturnType<typeof matchPage>): string[] {
  return renderSubpageLines(page, { mode: 'teletext' }).map(line =>
    line.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b#[0-9]/g, ''),
  );
}

function sgrFor(page: ReturnType<typeof matchPage>, row: number): string {
  return renderSubpageLines(page, { mode: 'teletext' })[row];
}

export async function theReadOutSaysWhoIsUp(): Promise<void> {
  const out = lines(matchPage({ terrain: flat(), worms: [] }, HUD));
  assert.ok(out[0].includes('WORMS'));
  assert.ok(out[0].includes('WIND'), out[0]);
  assert.ok(out[1].includes('RED') && out[1].includes('BLUE'));
  assert.ok(out[1].includes('>'), 'the team whose turn it is is marked');
  assert.ok(out[2].includes('ANGLE 45') && out[2].includes('POWER  6'), out[2]);
}

export async function windIsShownAsArrows(): Promise<void> {
  const right = lines(matchPage({ terrain: flat(), worms: [] }, { ...HUD, wind: 2 }));
  const left = lines(matchPage({ terrain: flat(), worms: [] }, { ...HUD, wind: -3 }));
  const still = lines(matchPage({ terrain: flat(), worms: [] }, { ...HUD, wind: 0 }));
  assert.ok(right[0].includes('>>'), right[0]);
  assert.ok(left[0].includes('<<<'), left[0]);
  assert.ok(still[0].includes('WIND  0'), still[0]);
}

export async function groundIsDrawnWhereTheGroundIs(): Promise<void> {
  // Ground from pixel row 40 down: cell row 13 of the field, so page row
  // FIELD_TOP_ROW + 13.
  const out = lines(matchPage({ terrain: flat(40), worms: [] }, HUD));
  const firstGroundRow = FIELD_TOP_ROW + Math.floor(40 / 3);
  assert.strictEqual(out[firstGroundRow - 2].trim(), '', 'sky above');
  assert.ok(out[firstGroundRow + 1].trim().length > 20, 'ground below');
  assert.ok(out[FIELD_TOP_ROW + FIELD_CELL_ROWS - 1].trim().length > 20, 'down to the last row');
}

export async function theTwoTeamsAreDifferentColours(): Promise<void> {
  const worms: Worm[] = [
    { id: '0-0', team: 0, x: 10, y: 39, hp: 100 },
    { id: '1-0', team: 1, x: 60, y: 39, hp: 100 },
  ];
  const row = FIELD_TOP_ROW + Math.floor(39 / 3);
  const painted = sgrFor(matchPage({ terrain: flat(40), worms }, HUD), row);
  // Red is SGR 31, cyan 36, and the ground between them is green 32.
  assert.ok(painted.includes('\x1b[31;'), 'red team present');
  assert.ok(painted.includes('\x1b[36;'), 'cyan team present');
  assert.ok(painted.includes('\x1b[32;'), 'and ground between them');
}

export async function aDeadWormIsNotDrawn(): Promise<void> {
  const row = FIELD_TOP_ROW + Math.floor(39 / 3);
  const alive = sgrFor(
    matchPage({ terrain: flat(40), worms: [{ id: '0-0', team: 0, x: 10, y: 39, hp: 100 }] }, HUD),
    row,
  );
  const dead = sgrFor(
    matchPage({ terrain: flat(40), worms: [{ id: '0-0', team: 0, x: 10, y: 39, hp: 0 }] }, HUD),
    row,
  );
  assert.ok(alive.includes('\x1b[31;'));
  assert.ok(!dead.includes('\x1b[31;'), 'a dead worm leaves the field');
}

export async function theArcIsDrawnWhenThereIsOne(): Promise<void> {
  const arc = [];
  for (let x = 10; x < 70; x++) arc.push({ x, y: 20 });
  const row = FIELD_TOP_ROW + Math.floor(20 / 3);

  const without = sgrFor(matchPage({ terrain: flat(40), worms: [] }, HUD), row);
  const with_ = sgrFor(matchPage({ terrain: flat(40), worms: [], arc }, HUD), row);
  assert.strictEqual(without.replace(/\x1b\[[0-9;]*m/g, '').trim(), '', 'nothing up there normally');
  assert.ok(with_.includes('\x1b[33;'), 'the arc is yellow');
}

export async function anEmptySkyCostsNothing(): Promise<void> {
  // A row with nothing in it must not carry colour attributes: on a 40
  // column page every wasted cell shows.
  const out = sgrFor(matchPage({ terrain: flat(40), worms: [] }, HUD), FIELD_TOP_ROW);
  const attributes = out.match(/\x1b\[[0-9;]*m/g) ?? [];
  assert.ok(attributes.length <= 2, `expected a bare row, got ${attributes.length} attributes`);
}

export async function everyPageIsStillTwentyFourRows(): Promise<void> {
  const out = lines(matchPage({ terrain: flat(), worms: [] }, HUD));
  assert.strictEqual(out.length, 24);
  // Counted in code points, not UTF-16 units: a sextant lives above the
  // basic plane and is two units long, so `.length` says 80 for a full row
  // of ground.
  for (const line of out) assert.strictEqual([...line].length, 40, line);
}
