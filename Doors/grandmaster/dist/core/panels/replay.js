"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.usesLegacyPanelSource = usesLegacyPanelSource;
exports.loadLegacyEndlessReplay = loadLegacyEndlessReplay;
exports.stackForReplay = stackForReplay;
exports.simulateReplay = simulateReplay;
const stack_1 = require("./stack");
const legacy_panel_source_1 = require("./legacy-panel-source");
const generator_source_1 = require("./generator-source");
const level_data_1 = require("./level-data");
const input_codec_1 = require("./input-codec");
const consts_1 = require("./consts");
/** Engine versions that were played on the legacy panel generator. */
const LEGACY_ENGINE_VERSIONS = new Set([
    consts_1.ENGINE_VERSIONS.PRE_TELEGRAPH,
    consts_1.ENGINE_VERSIONS.TELEGRAPH_COMPATIBLE,
    consts_1.ENGINE_VERSIONS.TOUCH_COMPATIBLE,
]);
function usesLegacyPanelSource(engineVersion) {
    return LEGACY_ENGINE_VERSIONS.has(engineVersion);
}
/**
 * Load a V1 endless replay.
 *
 * `allowAdjacentColorsOnStartingBoard` is set TRUE for these, which is not
 * guessable from the file - it was established by driving the fixture that has
 * a published expected outcome and finding it is the only setting that
 * reproduces it. With it false the same replay dies 66 frames early.
 */
function loadLegacyEndlessReplay(json) {
    const parsed = JSON.parse(json);
    const engineVersion = parsed.engineVersion;
    const block = parsed.endless;
    if (!block)
        throw new Error('not a V1 endless replay');
    const levelData = block.level !== undefined
        ? (0, level_data_1.getModern)(block.level)
        : (0, level_data_1.getClassicEndless)((block.difficulty ?? 1));
    if (block.speed !== undefined)
        levelData.startingSpeed = block.speed;
    let panelSource;
    if (usesLegacyPanelSource(engineVersion)) {
        const legacy = new legacy_panel_source_1.LegacyPanelSource(block.seed, true);
        legacy.setAllowAdjacentColorsOnStartingBoard(true);
        panelSource = legacy;
    }
    else {
        panelSource = new generator_source_1.GeneratorSource(block.seed, true);
    }
    return {
        engineVersion,
        seed: block.seed,
        inputs: (0, input_codec_1.decompressInputString)(block.in_buf),
        levelData,
        doCountdown: block.do_countdown !== false,
        cursorWaitTime: block.cur_wait_time ?? 20,
        panelSource,
    };
}
/** Build a stack set up to play a loaded replay back. */
function stackForReplay(replay, extra) {
    const stack = new stack_1.Stack({
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
function simulateReplay(replay, maxFrames = 100000) {
    const stack = stackForReplay(replay);
    let frames = 0;
    while (!stack.gameEnded() && frames < maxFrames) {
        stack.run();
        frames += 1;
    }
    return stack;
}
//# sourceMappingURL=replay.js.map