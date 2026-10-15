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
import { LevelData } from './level-data';
import type { PanelSource } from './generator-source';
export declare function usesLegacyPanelSource(engineVersion: string): boolean;
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
export declare function loadLegacyEndlessReplay(json: string): LoadedReplay;
/** Build a stack set up to play a loaded replay back. */
export declare function stackForReplay(replay: LoadedReplay, extra?: Partial<StackOptions>): Stack;
/**
 * Play a replay to its conclusion.
 *
 * `maxFrames` is a safety net, not a rule: a replay that has not ended by then
 * has diverged, and the caller should treat that as a failure rather than a
 * result.
 */
export declare function simulateReplay(replay: LoadedReplay, maxFrames?: number): Stack;
//# sourceMappingURL=replay.d.ts.map