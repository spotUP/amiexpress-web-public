/**
 * Recording a game and getting the same game back.
 *
 * The port is PROVED by replaying two of panel-attack's own recordings frame
 * for frame. This is the other half of that: a game played here, written in
 * their format, loaded back, and required to produce an identical board. If
 * the recorder and the engine ever disagree - one frame dropped, one input
 * mis-encoded - the reloaded game diverges and this fails.
 *
 * The comparison is the whole board, not the score. Two games can score the
 * same and be different games.
 */

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Stack } from '../../core/panels/stack';
import { GeneratorSource } from '../../core/panels/generator-source';
import { getClassicEndless } from '../../core/panels/level-data';
import { defaultBehaviours } from '../../core/panels/stack';
import { ENGINE_VERSIONS } from '../../core/panels/consts';
import { PanelAi } from '../../ai/panel-ai';
import { encodeInput } from '../../core/panels/input-codec';
import {
  PanelReplayRecorder,
  loadReplayV3,
  REPLAY_VERSION,
  PANEL_SOURCE_TYPES,
  STACK_TYPES,
} from '../../core/panels/replay-recorder';
import { stackForReplay } from '../../core/panels/replay';
import { PanelReplayStore } from '../../server/panel-replay-store';

const SEED = 20260903;
const FRAMES = 900;

function boardOf(stack: Stack): string {
  const rows: string[] = [];
  for (let row = stack.height; row >= 1; row--) {
    let line = '';
    for (let col = 1; col <= stack.width; col++) line += String(stack.panels[row][col].color);
    rows.push(line);
  }
  return rows.join('/');
}

/** Play a real game with the bot, recording every frame as it is fed. */
function playAndRecord(): { stack: Stack; recorder: PanelReplayRecorder; frames: number } {
  const levelData = getClassicEndless('normal');
  const stack = new Stack({
    levelData,
    panelSource: new GeneratorSource(SEED, true),
    doCountdown: true,
  });
  stack.startingState();

  const recorder = new PanelReplayRecorder({
    engineVersion: ENGINE_VERSIONS.CURRENT ?? stack.engineVersion,
    seed: SEED,
    levelData,
    behaviours: defaultBehaviours(),
    mode: 'endless',
    playerName: 'TESTER',
    doCountdown: true,
    shockEnabled: true,
  });

  const bot = new PanelAi(stack, 6);
  let frames = 0;
  for (; frames < FRAMES && !stack.gameEnded(); frames++) {
    const input = encodeInput(bot.update());
    recorder.record(input);
    stack.receiveConfirmedInput(input);
    stack.run();
  }
  return { stack, recorder, frames };
}

export async function aRecordedGameReplaysIntoTheSameBoard(): Promise<void> {
  const { stack, recorder, frames } = playAndRecord();
  assert.ok(stack.panelsCleared > 0, 'the bot actually played');
  assert.strictEqual(recorder.frames, frames, 'one character recorded per frame');

  const json = recorder.toJson(stack.gameEnded());
  const replayed = stackForReplay(loadReplayV3(json));
  for (let i = 0; i < frames; i++) replayed.run();

  assert.strictEqual(replayed.clock, stack.clock, 'same number of frames');
  assert.strictEqual(replayed.score, stack.score, 'same score');
  assert.strictEqual(replayed.panelsCleared, stack.panelsCleared);
  assert.strictEqual(replayed.speed, stack.speed);
  assert.strictEqual(boardOf(replayed), boardOf(stack), 'and the same board, panel for panel');
}

/** The file is upstream's, not ours: a V3 reader must recognise every field. */
export async function theFileIsPanelAttacksOwnFormat(): Promise<void> {
  const { stack, recorder } = playAndRecord();
  const replay = recorder.toReplayV3(stack.gameEnded());

  assert.strictEqual(replay.replayVersion, REPLAY_VERSION);
  assert.strictEqual(replay.panelSource.sourceType, PANEL_SOURCE_TYPES.seedV1);
  assert.strictEqual(replay.panelSource.seed, SEED);
  assert.strictEqual(replay.stacks.length, 1);
  assert.strictEqual(replay.stacks[0].stackType, STACK_TYPES.Stack);
  assert.strictEqual(replay.stacks[0].inputMethod, 'controller');
  assert.strictEqual(replay.metadata.gameModeName, 'endless');
  assert.strictEqual(replay.metadata.stacks[0].name, 'TESTER');

  // The keys upstream's writer emits, in the order it emits them.
  assert.deepStrictEqual(Object.keys(replay), [
    'engineVersion', 'replayVersion', 'panelSource', 'rules',
    'stacks', 'garbageFlows', 'metadata',
  ]);
}

/** Inputs are stored compressed, which is what makes a long game a small file. */
export async function inputsAreStoredCompressed(): Promise<void> {
  const { stack, recorder, frames } = playAndRecord();
  const replay = recorder.toReplayV3(stack.gameEnded());

  assert.ok(
    replay.stacks[0].inputs.length < frames,
    `${replay.stacks[0].inputs.length} characters for ${frames} frames`,
  );
  // And it still expands to exactly the game that was played.
  const loaded = loadReplayV3(JSON.stringify(replay));
  assert.strictEqual(loaded.inputs.length, frames);
}

/**
 * A game the player walked out of is marked incomplete, as upstream marks it:
 * it replays into a board that simply stops, and a viewer should be told that
 * rather than left wondering.
 */
export async function anAbandonedGameIsMarkedIncomplete(): Promise<void> {
  const { recorder } = playAndRecord();

  const finished = recorder.toReplayV3(true);
  assert.strictEqual(finished.metadata.completed, true);
  assert.strictEqual(finished.metadata.incomplete, undefined);

  const abandoned = recorder.toReplayV3(false);
  assert.strictEqual(abandoned.metadata.incomplete, true);
  assert.strictEqual(abandoned.metadata.completed, undefined);
  assert.ok(recorder.fileName(false).endsWith('-INCOMPLETE'));
}

export async function theStoreWritesListsAndLoadsReplays(): Promise<void> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-replays-'));
  const store = new PanelReplayStore(directory);
  const { stack, recorder } = playAndRecord();

  assert.deepStrictEqual(store.list(), [], 'nothing yet');

  const id = store.save(recorder.fileName(true), recorder.toReplayV3(true));
  assert.ok(id, 'the replay was written');

  const listed = store.list();
  assert.strictEqual(listed.length, 1);
  assert.strictEqual(listed[0].playerName, 'TESTER');
  assert.strictEqual(listed[0].mode, 'endless');
  assert.strictEqual(listed[0].completed, true);
  assert.ok(listed[0].duration > 0);

  // And it loads back into the same game.
  const json = store.load(listed[0].id);
  assert.ok(json);
  const replayed = stackForReplay(loadReplayV3(json as string));
  for (let i = 0; i < stack.clock; i++) replayed.run();
  assert.strictEqual(boardOf(replayed), boardOf(stack));

  assert.strictEqual(store.delete(listed[0].id), true);
  assert.deepStrictEqual(store.list(), []);
  fs.rmSync(directory, { recursive: true, force: true });
}

/** An id is also something a caller can type, so it must not walk the disk. */
export async function theStoreRefusesToLeaveItsDirectory(): Promise<void> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-replays-'));
  const store = new PanelReplayStore(directory);

  assert.strictEqual(store.load('../../../etc/passwd'), null);
  assert.strictEqual(store.load('..'), null);
  assert.strictEqual(store.delete('../something'), false);

  fs.rmSync(directory, { recursive: true, force: true });
}

/** A store pointed at nothing lists nothing rather than throwing. */
export async function anEmptyStoreIsNotAnError(): Promise<void> {
  const store = new PanelReplayStore(path.join(os.tmpdir(), 'panel-replays-does-not-exist'));
  assert.deepStrictEqual(store.list(), []);
  assert.strictEqual(store.load('anything'), null);
}
