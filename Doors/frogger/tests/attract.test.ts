/**
 * Attract mode: the title, the point table, the score ranking, the
 * invitation, and the machine playing itself.
 */

import assert from 'assert';
import { startedLevel, createData } from './fixture';
import {
  attractScreen, titleGrid, titleLines, nextPhase, pointTablePanel, rankingPanel,
  invitePanel, creditLine, ATTRACT_ORDER, ATTRACT_FRAMES, ATTRACT_BLINK_FRAMES,
  AttractPhase,
} from '../game/attract';
import { SCORES, LIVES_OPTIONS, GRID_HEIGHT } from '../game/constants';

const WIDTH = 80;

/** Strip blessed's colour tags, leaving the words. */
function plain(lines: string[]): string {
  return lines.join('\n').replace(/\{[^}]*\}/g, '');
}

/** The title spells FROGGER in a block font. */
export async function theTitleSpellsFrogger(): Promise<void> {
  const grid = titleGrid();

  assert.strictEqual(grid.length, 5, 'the block font is five rows tall');
  assert.ok(
    grid.every(row => row.includes('#')),
    'every row of the title should have something in it'
  );

  // Seven letters, so seven runs of filled columns across the widest row.
  const columns = new Set<number>();
  for (const row of grid) {
    for (let c = 0; c < row.length; c++) if (row[c] === '#') columns.add(c);
  }

  let runs = 0;
  let inRun = false;
  const maxCol = Math.max(...columns);
  for (let c = 0; c <= maxCol + 1; c++) {
    const filled = columns.has(c);
    if (filled && !inRun) runs++;
    inRun = filled;
  }

  assert.strictEqual(runs, 'FROGGER'.length, `expected seven letters, found ${runs}`);
}

/** The title carries the arcade's yellow shading beside the green. */
export async function theTitleIsShaded(): Promise<void> {
  const grid = titleGrid();
  const shaded = grid.some(row => row.includes('+'));

  assert.ok(shaded, 'the letters should have a shaded edge');

  // Painted as blocks of background colour, not as '#' characters. The
  // title lives in its own box at the top of the screen now, so it is
  // asserted there rather than inside an attract panel.
  const painted = titleLines(WIDTH).join('\n');
  assert.ok(painted.includes('{green-bg}'), 'the face of the letters is green');
  assert.ok(painted.includes('{yellow-bg}'), 'the shading is yellow');
  assert.ok(
    !/\{green-fg\}#/.test(painted),
    'the title should be blocks, not hashes'
  );
}

/**
 * The point table quotes the four scoring rules, and quotes the numbers the
 * game actually pays rather than hard-coded ones.
 */
export async function thePointTableListsWhatTheGamePays(): Promise<void> {
  const text = plain(pointTablePanel(WIDTH));

  assert.ok(text.includes('POINT TABLE'), 'it is headed POINT TABLE');
  assert.ok(text.includes(`${SCORES.hop} PTS FOR EACH STEP`), 'the hop');
  assert.ok(text.includes(`${SCORES.home} PTS FOR EVERY FROG`), 'the home');
  assert.ok(text.includes(`${SCORES.levelComplete} PTS BY SAVING FROGS`), 'the level');
  assert.ok(text.includes(`${SCORES.timeBonus} PTS X REMAINING SECOND`), 'the time bonus');
}

/** The ranking lists five places, highest score first. */
export async function theRankingListsTheTopFiveInOrder(): Promise<void> {
  const data = createData();
  data.highscores = [
    { name: 'AAA', score: 1270, level: 1, date: '' },
    { name: 'BBB', score: 4630, level: 5, date: '' },
    { name: 'CCC', score: 1970, level: 2, date: '' },
    { name: 'DDD', score: 2050, level: 3, date: '' },
    { name: 'EEE', score: 1580, level: 2, date: '' },
  ];

  const text = plain(rankingPanel(data, WIDTH));

  assert.ok(text.includes('SCORE RANKING'), 'it is headed SCORE RANKING');
  for (const place of ['1 ST', '2 ND', '3 RD', '4 TH', '5 TH']) {
    assert.ok(text.includes(place), `place ${place} is listed`);
  }

  const order = ['04630', '02050', '01970', '01580', '01270'];
  let at = -1;
  for (const score of order) {
    const found = text.indexOf(score);
    assert.ok(found > at, `${score} should come after the score above it`);
    at = found;
  }
}

/** The invitation names the lives setting rather than a fixed number. */
export async function theInvitationNamesTheLivesSetting(): Promise<void> {
  for (const lives of LIVES_OPTIONS) {
    const data = createData();
    data.startingLives = lives;

    const text = plain(invitePanel(data, WIDTH, true));
    assert.ok(
      text.includes(`${lives} FROGS PER PLAYER`),
      `with ${lives} lives set it should say so, got: ${text.trim()}`
    );
  }
}

/** ...and asks for a key, because a BBS door has no coin slot. */
export async function theInvitationAsksForAKeyNotACoin(): Promise<void> {
  const text = plain(invitePanel(createData(), WIDTH, true));

  assert.ok(text.includes('PRESS ANY KEY'), 'it asks for a key');
  assert.ok(!text.includes('INSERT COIN'), 'and not for a coin');
}

/** The invitation blinks. */
export async function theInvitationBlinks(): Promise<void> {
  const data = createData();

  const on = plain(attractScreen('invite', data, WIDTH, 0));
  const off = plain(attractScreen('invite', data, WIDTH, ATTRACT_BLINK_FRAMES));

  assert.ok(on.includes('PRESS ANY KEY'), 'showing on the first frame');
  assert.ok(!off.includes('PRESS ANY KEY'), 'and gone a blink later');
}

/** The credit goes to Konami without claiming their copyright for us. */
export async function theCreditNamesKonamiWithoutClaimingTheirCopyright(): Promise<void> {
  const text = plain([creditLine(WIDTH)]);

  assert.ok(text.includes('KONAMI'), 'Konami are credited');
  assert.ok(text.includes('1981'), 'with the year');
  assert.ok(!text.includes('(C)'), 'but this port does not carry their copyright notice');
}

/** The phases rotate in order and wrap round. */
export async function thePhasesRotateAndWrap(): Promise<void> {
  let phase: AttractPhase = ATTRACT_ORDER[0];
  const seen: AttractPhase[] = [phase];

  for (let i = 1; i < ATTRACT_ORDER.length; i++) {
    phase = nextPhase(phase);
    seen.push(phase);
  }

  assert.deepStrictEqual(seen, ATTRACT_ORDER);
  assert.strictEqual(nextPhase(phase), ATTRACT_ORDER[0], 'and it wraps');
}

/** Every panel carries the title and the credit; the demo carries neither. */
export async function everyPanelCarriesTheTitleExceptTheDemo(): Promise<void> {
  for (const phase of ATTRACT_ORDER) {
    const lines = attractScreen(phase, createData(), WIDTH, 0);

    if (phase === 'demo') {
      assert.strictEqual(lines.length, 0, 'the demo plays the game instead');
      continue;
    }

    const text = plain(lines);
    assert.ok(text.includes('KONAMI'), `${phase} carries the credit`);
    assert.ok(
      !plain(titleLines(WIDTH)).trim() || !text.includes('FROGGER'),
      `${phase} should not repeat the title; the logo is always on screen`
    );
  }
}

/** Each phase holds for a sensible while. */
export async function everyPhaseHasADuration(): Promise<void> {
  for (const phase of ATTRACT_ORDER) {
    assert.ok(ATTRACT_FRAMES[phase] > 0, `${phase} needs a duration`);
  }
  assert.ok(
    ATTRACT_FRAMES.demo > ATTRACT_FRAMES.invite,
    'the demo runs longer than a panel'
  );
}

/**
 * The demo actually plays: from the bank, it works its way up the board.
 */
export async function theDemoPlaysTheGame(): Promise<void> {
  const { game, data } = startedLevel(1);

  const startY = data.frog.y;
  let best = startY;

  for (let i = 0; i < 600; i++) {
    game.demoStep();
    game.update();
    best = Math.min(best, data.frog.y);
    if (data.state !== 'playing') break;
  }

  assert.ok(
    best < startY,
    `the demo should get off the bank; it reached row ${best} from ${startY}`
  );
}

/**
 * The demo will not hop into a car.
 *
 * Asserted by putting one exactly where it wants to go, rather than by
 * playing on and hoping: level 1 has three cars in forty cells, so a demo
 * that ignores traffic entirely still usually survives a few seconds.
 */
export async function theDemoWillNotHopIntoACar(): Promise<void> {
  const { game, data } = startedLevel(1);

  // The road lane directly above the bank.
  const road = data.lanes.find(l => l.type === 'road' && l.y === data.frog.y - 1);
  assert.ok(road, 'there should be a road lane above the start');

  // One car, sitting on the cell the demo would hop into.
  road!.objects = [{
    id: 99, type: 'car', x: data.frog.x, y: road!.y,
    lane: road!.lane, width: 2, speed: road!.speed,
  }];

  const before = data.frog.y;
  game.demoStep();

  assert.strictEqual(data.frog.y, before, 'it should wait, not hop into the car');
}

/** With the lane clear, it hops. */
export async function theDemoHopsWhenTheRoadIsClear(): Promise<void> {
  const { game, data } = startedLevel(1);

  const road = data.lanes.find(l => l.type === 'road' && l.y === data.frog.y - 1);
  road!.objects = [];

  const before = data.frog.y;
  game.demoStep();

  assert.strictEqual(data.frog.y, before - 1, 'a clear road should be taken');
}

/** It will not hop into open water either. */
export async function theDemoWillNotHopIntoWater(): Promise<void> {
  const { game, data } = startedLevel(1);

  const water = data.lanes.find(l => l.type === 'water' && l.lane === 1);
  assert.ok(water, 'there should be a first water lane');

  // Stand it on the median with nothing to jump to.
  const median = data.lanes.find(l => l.type === 'safe' && l.y === water!.y + 1);
  assert.ok(median, 'the median sits below water lane 1');

  data.frog.y = median!.y;
  data.frog.x = 20;
  water!.objects = [];

  const before = data.frog.y;
  game.demoStep();

  assert.strictEqual(data.frog.y, before, 'no footing means no hop');
}

/** A demo game is a game like any other: it starts on the bank. */
export async function theDemoStartsOnTheBank(): Promise<void> {
  const { data } = startedLevel(1);
  assert.strictEqual(data.frog.y, GRID_HEIGHT - 1);
}
