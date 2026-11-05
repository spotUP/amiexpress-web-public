/**
 * Matching, chains, combos, stop time and score, on hand-built boards.
 *
 * Boards are written as digit strings, top row first, the way puzzles are
 * written - so a test reads like the screen it describes.
 */

import assert from 'assert';
import { Panel, PanelGrid } from '../../core/panels/panel';
import { getModern, getClassic, LevelData } from '../../core/panels/level-data';
import {
  MatchableStack,
  getMatchingPanels,
  applyMatchToPanels,
  incrementChainCounter,
  calculateStopTime,
  awardStopTime,
  updateScoreWithBonus,
  updateScoreWithChain,
  clearChainingFlags,
  sortByPopOrder,
  canMatch,
  addScore,
} from '../../core/panels/check-matches';

const WIDTH = 6;
const HEIGHT = 12;

interface TestStack extends MatchableStack {
  panels: PanelGrid;
}

function makeStack(levelData: LevelData = getModern(1)): TestStack {
  const panels: PanelGrid = [];
  let id = 0;
  for (let row = 0; row <= HEIGHT + 2; row++) {
    panels[row] = [];
    for (let col = 1; col <= WIDTH; col++) {
      const panel = new Panel(row, col, id++, levelData.frameConstants);
      panel.onPop = () => {};
      panel.onPopped = () => {};
      panel.onLand = () => {};
      panels[row][col] = panel;
    }
  }
  return {
    panels,
    width: WIDTH,
    height: HEIGHT,
    levelData,
    chainCounter: 0,
    wasToppedOut: false,
    stopTime: 0,
    preStopTime: 0,
    score: 0,
    manualRaise: false,
    riseLock: false,
  };
}

/**
 * Fill rows from the bottom up. Each string is one row of WIDTH digits, given
 * BOTTOM first, so `fill(stack, ['123123'])` puts that row at row 1.
 */
function fill(stack: TestStack, rows: string[]): void {
  rows.forEach((rowString, index) => {
    const row = index + 1;
    for (let col = 1; col <= WIDTH; col++) {
      const panel = stack.panels[row][col];
      panel.color = Number(rowString.charAt(col - 1));
      panel.state = 'normal';
      // Only panels that changed state this frame seed a match.
      panel.stateChanged = true;
    }
  });
}

export async function threeInARowMatchesHorizontally(): Promise<void> {
  const stack = makeStack();
  fill(stack, ['111234']);
  const matched = getMatchingPanels(stack);
  assert.strictEqual(matched.length, 3);
}

export async function threeInAColumnMatchesVertically(): Promise<void> {
  const stack = makeStack();
  // Column 1 is 1,1,1 going up. Every other column is deliberately varied per
  // row: a lazy filler like '3456' repeated would form four more vertical
  // matches and the count would be meaningless.
  fill(stack, ['145362',
               '153426',
               '134256']);
  const matched = getMatchingPanels(stack);
  assert.strictEqual(matched.length, 3);
}

export async function twoInARowDoesNotMatch(): Promise<void> {
  const stack = makeStack();
  fill(stack, ['112345']);
  assert.strictEqual(getMatchingPanels(stack).length, 0);
}

/**
 * A cross of a horizontal three and a vertical three sharing their centre is
 * FIVE panels, not six - the shared panel is counted once. Combo size drives
 * garbage and score, so double-counting would over-send on every L and T.
 */
export async function aCrossCountsTheSharedPanelOnce(): Promise<void> {
  const stack = makeStack();
  // Column 1 is the vertical arm, row 2 columns 1-3 the horizontal one; they
  // share panels[2][1]. Fillers vary per row so nothing else matches.
  fill(stack, ['145362',
               '111425',
               '134526']);
  const matched = getMatchingPanels(stack);
  assert.strictEqual(matched.length, 5, 'three across plus three up, sharing one panel');
}

/**
 * Only panels whose state changed this frame seed a check. A board that has
 * settled is never rescanned - this is a rule, not an optimisation, and a match
 * that appears without a state change must NOT be found.
 */
export async function aSettledBoardIsNeverRescanned(): Promise<void> {
  const stack = makeStack();
  fill(stack, ['111234']);
  for (let col = 1; col <= WIDTH; col++) stack.panels[1][col].stateChanged = false;
  assert.strictEqual(getMatchingPanels(stack).length, 0, 'no state change, no match');
}

export async function hoveringPanelsCannotMatchUnlessMatchAnyway(): Promise<void> {
  const stack = makeStack();
  fill(stack, ['111234']);
  for (let col = 1; col <= 3; col++) stack.panels[1][col].state = 'hovering';
  assert.strictEqual(getMatchingPanels(stack).length, 0, 'hovering panels do not match');

  for (let col = 1; col <= 3; col++) stack.panels[1][col].matchAnyway = true;
  assert.strictEqual(
    getMatchingPanels(stack).length, 3,
    'except in their one matchAnyway frame - the basis of every skill chain',
  );
}

export async function theFirstChainLinkSetsTheCounterToTwo(): Promise<void> {
  const stack = makeStack();
  assert.strictEqual(stack.chainCounter, 0);
  incrementChainCounter(stack);
  assert.strictEqual(stack.chainCounter, 2, 'there is no chain 1');
  incrementChainCounter(stack);
  assert.strictEqual(stack.chainCounter, 3);
}

export async function popOrderIsTopToBottomThenLeftToRight(): Promise<void> {
  const stack = makeStack();
  fill(stack, ['111234']);
  stack.panels[2][1].color = 1;
  stack.panels[2][1].stateChanged = true;
  stack.panels[3][1].color = 1;
  stack.panels[3][1].stateChanged = true;

  const matched = getMatchingPanels(stack);
  const origin = applyMatchToPanels(matched, false, matched.length);

  // The first to pop is the topmost, leftmost panel of the match.
  assert.strictEqual(origin.row, 3);
  assert.strictEqual(origin.column, 1);
  assert.strictEqual(stack.panels[3][1].comboIndex, 1, 'top of the column pops first');
}

export async function garbagePopsBottomToTopAndRightToLeft(): Promise<void> {
  const stack = makeStack();
  const a = stack.panels[1][1];
  const b = stack.panels[1][3];
  const c = stack.panels[2][2];
  const ordered = sortByPopOrder([c, a, b], true);
  assert.deepStrictEqual(
    ordered.map((p) => [p.row, p.column]),
    [[1, 3], [1, 1], [2, 2]],
    'garbage pops bottom row first, right to left within a row',
  );
}

// --- stop time ---

export async function modernStopTimeForAPlainCombo(): Promise<void> {
  const stack = makeStack(getModern(1)); // coefficient 20, comboConstant -20
  assert.strictEqual(calculateStopTime(stack, 5, false, false, 0), 20 * 5 - 20);
  assert.strictEqual(calculateStopTime(stack, 3, false, false, 0), 0, 'a plain 3 stops nothing');
}

export async function modernStopTimeForAChain(): Promise<void> {
  const stack = makeStack(getModern(1)); // coefficient 20, chainConstant 80
  assert.strictEqual(calculateStopTime(stack, 3, false, true, 2), 20 * 2 + 80);
  assert.strictEqual(
    calculateStopTime(stack, 3, false, true, 20), 20 * 13 + 80,
    'the chain length used for stop time is capped at 13',
  );
}

/**
 * Being about to die buys more time, on a different formula. The in-game
 * tutorial says so out loud: "When you are in big trouble, they'll stop a
 * little longer. At that time, a 'Stop' mark will appear."
 */
export async function toppedOutChainsUseTheDangerFormula(): Promise<void> {
  const stack = makeStack(getModern(1)); // dangerConstant 160, dangerCoefficient 20
  assert.strictEqual(calculateStopTime(stack, 3, true, true, 3), 160 + (3 - 1) * 20);
  assert.strictEqual(
    calculateStopTime(stack, 3, true, true, 9), 160 + (6 - 1) * 20,
    'the danger length saturates at 6',
  );
  // Topped out on a plain combo uses the chain constant with a length of 2 or 3.
  assert.strictEqual(calculateStopTime(stack, 5, true, false, 0), 20 * 2 + 80);
  assert.strictEqual(calculateStopTime(stack, 9, true, false, 0), 20 * 3 + 80);
}

export async function classicStopTimeIsFlat(): Promise<void> {
  const stack = makeStack(getClassic('easy')); // 120 / 300 / 600, no coefficients
  assert.strictEqual(calculateStopTime(stack, 5, false, false, 0), 120);
  assert.strictEqual(calculateStopTime(stack, 3, false, true, 5), 300, 'chain length is ignored');
  assert.strictEqual(calculateStopTime(stack, 3, true, true, 5), 600);
  assert.strictEqual(calculateStopTime(stack, 5, true, false, 0), 600, 'topped out uses danger');
}

export async function stopTimeIsTakenNotAccumulated(): Promise<void> {
  const stack = makeStack(getModern(1));
  stack.stopTime = 200;
  awardStopTime(stack, false, 5); // worth 80
  assert.strictEqual(stack.stopTime, 200, 'a smaller award does not reduce it');
  stack.chainCounter = 5;
  awardStopTime(stack, true, 3); // worth 20*5 + 80 = 180
  assert.strictEqual(stack.stopTime, 200, 'and does not add to it either');
  stack.chainCounter = 13;
  awardStopTime(stack, true, 3); // 20*13 + 80 = 340
  assert.strictEqual(stack.stopTime, 340, 'a bigger award replaces it');
}

// --- score ---

export async function comboAndChainBonusesAreBothApplied(): Promise<void> {
  const stack = makeStack();
  stack.chainCounter = 2;
  updateScoreWithBonus(stack, 5);
  assert.strictEqual(stack.score, 50 + 30, 'chain 2 is 50, combo 5 is 30');
}

/**
 * The chain bonus is NOT gated on this match being a chain link: while a chain
 * is live, every match re-scores it. A player described the same behaviour from
 * the outside - "at x13, just clear as many matches as possible".
 */
export async function everyMatchDuringAChainScoresTheChainBonusAgain(): Promise<void> {
  const stack = makeStack();
  stack.chainCounter = 4; // worth 150
  updateScoreWithChain(stack);
  updateScoreWithChain(stack);
  assert.strictEqual(stack.score, 300, 'scored twice without the chain advancing');
}

export async function chainsAboveThirteenScoreNothing(): Promise<void> {
  const stack = makeStack();
  stack.chainCounter = 13;
  updateScoreWithChain(stack);
  assert.strictEqual(stack.score, 1800, 'thirteen is the top of the table');

  const beyond = makeStack();
  beyond.chainCounter = 14;
  updateScoreWithChain(beyond);
  assert.strictEqual(beyond.score, 0, 'and above it the bonus is zero, not 1800');
}

export async function scoreCapsAtNinetyNineThousand(): Promise<void> {
  const stack = makeStack();
  stack.score = 99990;
  addScore(stack, 500);
  assert.strictEqual(stack.score, 99999);
}

/**
 * A chaining panel that has come to rest without matching loses its flag - but
 * NOT while the panel directly below it is mid-swap, because the player may
 * still be building the next link. That exception is the whole rule.
 */
export async function aChainFlagSurvivesOverASwappingPanel(): Promise<void> {
  const stack = makeStack();

  const settled = stack.panels[3][2];
  settled.color = 1;
  settled.state = 'normal';
  settled.chaining = true;

  const overSwap = stack.panels[3][4];
  overSwap.color = 1;
  overSwap.state = 'normal';
  overSwap.chaining = true;
  stack.panels[2][4].state = 'swapping';

  clearChainingFlags(stack);

  assert.strictEqual(settled.chaining, false, 'settled and unmatched: flag dropped');
  assert.strictEqual(overSwap.chaining, true, 'above a swap in progress: flag kept');
}

export async function rowOneAlwaysLosesItsChainFlag(): Promise<void> {
  const stack = makeStack();
  const panel = stack.panels[1][3];
  panel.color = 1;
  panel.state = 'normal';
  panel.chaining = true;

  clearChainingFlags(stack);
  assert.strictEqual(panel.chaining, false, 'there is nowhere left to fall from');
}

export async function canMatchRejectsEmptyAndGarbageColours(): Promise<void> {
  const stack = makeStack();
  const panel = stack.panels[1][1];
  panel.state = 'normal';

  panel.color = 0;
  assert.strictEqual(canMatch(panel), false, 'empty');
  panel.color = 9;
  assert.strictEqual(canMatch(panel), false, 'garbage');
  panel.color = 8;
  assert.strictEqual(canMatch(panel), true, 'shock panels do match');
  panel.color = 1;
  assert.strictEqual(canMatch(panel), true);
}
