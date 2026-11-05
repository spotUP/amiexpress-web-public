/**
 * Loading a recorded game and playing it back.
 *
 * A replay is a seed, a level, and one input character per frame. Feed the same
 * seed and the same inputs to a correct engine and you get the same game, frame
 * for frame - which is why replays are the strongest conformance test available
 * for a port like this one, and why they are worth loading before the door has
 * any way to record them.
 *
 * FORMAT VERSIONS. Upstream has three, and the engine version matters as much
 * as the file version:
 *
 *   V1  the unversioned legacy blob - a `endless` / `time` / `vs` object.
 *       Engine 045-047, which means the LEGACY panel generator.
 *   V2  `replayVersion: 2`, players array. Not implemented yet.
 *   V3  `replayVersion: 3`, the current schema. Not implemented yet.
 *
 * Engine version decides the panel source, and getting it wrong does not fail
 * loudly - it just produces a different board and therefore a different game.
 * That is exactly what happened here before the legacy source existed: the
 * smallest endless fixture died at frame 336 instead of 402.
 */

import { Stack, StackOptions } from './stack';
import { LegacyPanelSource } from './legacy-panel-source';
import { GeneratorSource } from './generator-source';
import { getClassicEndless, getModern, LevelData } from './level-data';
import { decompressInputString } from './input-codec';
import { ENGINE_VERSIONS } from './consts';
import type { PanelSource } from './generator-source';

/** Engine versions that were played on the legacy panel generator. */
const LEGACY_ENGINE_VERSIONS = new Set<string>([
  ENGINE_VERSIONS.PRE_TELEGRAPH,
  ENGINE_VERSIONS.TELEGRAPH_COMPATIBLE,
  ENGINE_VERSIONS.TOUCH_COMPATIBLE,
]);

export function usesLegacyPanelSource(engineVersion: string): boolean {
  return LEGACY_ENGINE_VERSIONS.has(engineVersion);
}

/** The `endless` block of a V1 replay. */
interface LegacyEndlessBlock {
  in_buf: string;
  cur_wait_time?: number;
  seed: number;
  speed?: number;
  difficulty?: number;
  level?: number;
  do_countdown?: boolean;
}

export interface LoadedReplay {
  engineVersion: string;
  seed: number;
  /** One character per frame, already expanded. */
  inputs: string;
  levelData: LevelData;
  doCountdown: boolean;
  cursorWaitTime: number;
  panelSource: PanelSource;
}

/**
 * Load a V1 endless replay.
 *
 * `allowAdjacentColorsOnStartingBoard` is set TRUE for these, which is not
 * guessable from the file - it was established by driving the fixture that has
 * a published expected outcome and finding it is the only setting that
 * reproduces it. With it false the same replay dies 66 frames early.
 */
export function loadLegacyEndlessReplay(json: string): LoadedReplay {
  const parsed = JSON.parse(json) as { engineVersion: string; endless: LegacyEndlessBlock };
  const engineVersion = parsed.engineVersion;
  const block = parsed.endless;
  if (!block) throw new Error('not a V1 endless replay');

  const levelData = block.level !== undefined
    ? getModern(block.level)
    : getClassicEndless((block.difficulty ?? 1) as 1 | 2 | 3 | 4);
  if (block.speed !== undefined) levelData.startingSpeed = block.speed;

  let panelSource: PanelSource;
  if (usesLegacyPanelSource(engineVersion)) {
    const legacy = new LegacyPanelSource(block.seed, true);
    legacy.setAllowAdjacentColorsOnStartingBoard(true);
    panelSource = legacy;
  } else {
    panelSource = new GeneratorSource(block.seed, true);
  }

  return {
    engineVersion,
    seed: block.seed,
    inputs: decompressInputString(block.in_buf),
    levelData,
    doCountdown: block.do_countdown !== false,
    cursorWaitTime: block.cur_wait_time ?? 20,
    panelSource,
  };
}

/** Build a stack set up to play a loaded replay back. */
export function stackForReplay(replay: LoadedReplay, extra?: Partial<StackOptions>): Stack {
  const stack = new Stack({
    levelData: replay.levelData,
    panelSource: replay.panelSource,
    doCountdown: replay.doCountdown,
    engineVersion: replay.engineVersion,
    cursorWaitTime: replay.cursorWaitTime,
    ...extra,
  });
  stack.startingState();
  stack.receiveConfirmedInput(replay.inputs);
  return stack;
}

/**
 * Play a replay to its conclusion.
 *
 * `maxFrames` is a safety net, not a rule: a replay that has not ended by then
 * has diverged, and the caller should treat that as a failure rather than a
 * result.
 */
export function simulateReplay(replay: LoadedReplay, maxFrames = 100000): Stack {
  const stack = stackForReplay(replay);
  let frames = 0;
  while (!stack.gameEnded() && frames < maxFrames) {
    stack.run();
    frames += 1;
  }
  return stack;
}
