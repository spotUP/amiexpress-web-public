/**
 * STAGE CLEAR.
 *
 * The rule is the original's and is quoted in the module: clear until every
 * panel is below the line, the stack starting higher and the line further down
 * as you go, with Bowser waiting at the halfway point and the end.
 *
 * The thirty board LAYOUTS are not published anywhere, so they are generated
 * from a per-stage seed. These tests therefore pin the things that are
 * knowable: that the campaign has the shape the FAQ describes, that a stage is
 * winnable, that it is not won before it starts, and that it is the same board
 * every time.
 */

import assert from 'assert';
import {
  buildStages,
  stageSpeed,
  stageSeed,
  stageBoardString,
  stageStackOptions,
  bossHealth,
  StageClearGame,
  ROUNDS,
  STAGES_PER_ROUND,
  STAGE_COUNT,
} from '../../core/panels/stage-clear';
import { PanelAi } from '../../ai/panel-ai';
import { encodeInput } from '../../core/panels/input-codec';

export async function theCampaignIsSixRoundsOfFivePlusTwoFights(): Promise<void> {
  const stages = buildStages();
  assert.strictEqual(ROUNDS, 6);
  assert.strictEqual(STAGES_PER_ROUND, 5);
  assert.strictEqual(STAGE_COUNT, 30);

  const boards = stages.filter((stage) => !stage.boss);
  const bosses = stages.filter((stage) => stage.boss);
  assert.strictEqual(boards.length, 30);
  assert.deepStrictEqual(bosses.map((stage) => stage.label), ['SPECIAL', 'FINAL']);

  // Bowser waits AFTER 3-5 and AFTER 6-5, not anywhere else.
  assert.strictEqual(stages[5].label, '2-1');
  assert.strictEqual(stages[15].label, 'SPECIAL');
  assert.strictEqual(stages[stages.length - 1].label, 'FINAL');
}

export async function everyBoardStageIsLabelledRoundDashStage(): Promise<void> {
  const boards = buildStages().filter((stage) => !stage.boss);
  assert.strictEqual(boards[0].label, '1-1');
  assert.strictEqual(boards[9].label, '2-5');
  assert.strictEqual(boards[29].label, '6-5');
}

/**
 * The line must sit BELOW the starting stack or the stage is won before a key
 * is pressed. The first draft had round 1 starting at five rows with the line
 * at five, and stage 1-1 reported itself cleared on frame one.
 */
export async function theClearLineIsAlwaysBelowTheStartingStack(): Promise<void> {
  for (const stage of buildStages()) {
    if (stage.boss) continue;
    assert.ok(
      stage.clearLine < stage.startingHeight,
      `${stage.label}: line ${stage.clearLine} is not below a stack of ${stage.startingHeight}`,
    );
    assert.ok(stage.clearLine >= 1, `${stage.label}: the line is on the board`);
    assert.ok(stage.startingHeight <= 10, `${stage.label}: the stack fits under the top`);
  }
}

/** Harder as it goes: the stack starts higher and the gap grows. */
export async function theCampaignGetsHarder(): Promise<void> {
  const boards = buildStages().filter((stage) => !stage.boss);
  const gap = (i: number) => boards[i].startingHeight - boards[i].clearLine;

  assert.ok(boards[0].startingHeight < boards[29].startingHeight, 'the stack starts higher');
  assert.ok(gap(0) < gap(29), 'and the gap to close grows');
  for (let i = 1; i < boards.length; i++) {
    assert.ok(
      boards[i].startingHeight >= boards[i - 1].startingHeight,
      'the starting height never drops back',
    );
    assert.ok(gap(i) >= gap(i - 1), 'and neither does the gap');
  }
}

/** Within a round the board is the same shape and the speed climbs instead. */
export async function speedClimbsOneStepPerStage(): Promise<void> {
  const stages = buildStages();
  assert.strictEqual(stageSpeed(stages[0]), 1);
  for (let i = 1; i < stages.length; i++) {
    assert.strictEqual(
      stageSpeed(stages[i]), stageSpeed(stages[i - 1]) + 1,
      'one step per stage, bosses included',
    );
  }
  assert.ok(stageSpeed(stages[stages.length - 1]) <= 99, 'and never past the engine cap');
}

/**
 * A campaign whose stages reshuffled per attempt would not be a campaign: the
 * board a stage generates is fixed by its number.
 */
export async function aStageIsTheSameBoardEveryTime(): Promise<void> {
  const stage = buildStages()[7];
  assert.strictEqual(stageBoardString(stage, 5), stageBoardString(stage, 5));
  assert.notStrictEqual(
    stageBoardString(stage, 5),
    stageBoardString(buildStages()[8], 5),
    'and a different stage is a different board',
  );

  const seeds = buildStages().map(stageSeed);
  assert.strictEqual(new Set(seeds).size, seeds.length, 'no two stages share a seed');
}

export async function aGeneratedStageBoardIsTheStatedHeight(): Promise<void> {
  for (const stage of buildStages().filter((s) => !s.boss)) {
    const board = stageBoardString(stage, stage.startingHeight);
    assert.strictEqual(
      board.length, stage.startingHeight * 6,
      `${stage.label}: ${board.length / 6} rows, expected ${stage.startingHeight}`,
    );
    assert.ok(/^[0-9]+$/.test(board), 'colours only, no garbage notation');
  }
}

export async function aStageStartsAtItsHeightAndIsNotYetCleared(): Promise<void> {
  const stage = buildStages()[0];
  const game = new StageClearGame(stage);
  assert.strictEqual(game.highestPanelRow(), stage.startingHeight);
  assert.strictEqual(game.hasCleared(), false);
  assert.strictEqual(game.result(), 'playing');
}

export async function theStackStartsAtTheStagesSpeed(): Promise<void> {
  const stage = buildStages()[12];
  const game = new StageClearGame(stage);
  assert.strictEqual(game.stack.speed, stageSpeed(stage));
}

/**
 * Winnable, proved by playing it: the bot clears the opening stage. A campaign
 * of unwinnable stages would pass every other assertion in this file.
 */
export async function theBotCanClearTheOpeningStage(): Promise<void> {
  const game = new StageClearGame(buildStages()[0]);
  const bot = new PanelAi(game.stack, 7);

  let outcome = 'playing';
  for (let i = 0; i < 6000 && outcome === 'playing'; i++) {
    game.stack.receiveConfirmedInput(encodeInput(bot.update()));
    outcome = game.run();
  }

  assert.strictEqual(outcome, 'cleared');
  assert.ok(
    game.highestPanelRow() <= game.stage.clearLine,
    'and the board really is below the line',
  );
}

/** A Bowser fight is a match against a health model, not a board to clear. */
export async function aBowserStageIsNotPlayedAsABoard(): Promise<void> {
  const boss = buildStages().find((stage) => stage.boss)!;
  assert.throws(() => new StageClearGame(boss), /played as a match/);
}

export async function theFinalFightIsTheHarderOne(): Promise<void> {
  const stages = buildStages();
  const special = stages.find((stage) => stage.label === 'SPECIAL')!;
  const final = stages.find((stage) => stage.label === 'FINAL')!;

  const easy = bossHealth(special);
  const hard = bossHealth(final);
  assert.ok(hard.lineClearGPM > easy.lineClearGPM, 'Bowser attacks faster at the end');
  assert.ok(hard.riseSpeed > easy.riseSpeed);
  assert.ok(hard.framesToppedOutToLose > easy.framesToppedOutToLose, 'and takes longer to bury');
}

/** The rise buffer is real panels, so a long stage never runs dry of colours. */
export async function theStackRisesIntoRealPanels(): Promise<void> {
  const options = stageStackOptions(buildStages()[0]);
  const stack = new (require('../../core/panels/stack').Stack)(options);
  stack.startingState();

  for (let i = 0; i < 2000; i++) stack.run();

  let colourless = 0;
  for (let row = 1; row <= stack.height; row++) {
    for (let col = 1; col <= stack.width; col++) {
      if (stack.panels[row][col].color === 9) colourless += 1;
    }
  }
  assert.strictEqual(colourless, 0, 'no grey filler ever reaches the board');
}
