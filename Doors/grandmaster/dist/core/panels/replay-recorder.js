"use strict";
/**
 * Recording a game, in panel-attack's own ReplayV3 format.
 *
 * WHY VERBATIM AND NOT A FORMAT OF OUR OWN. A replay is a seed, a level and one
 * character per frame; any format would hold that. Writing upstream's means a
 * game played on this BBS opens in real Panel Attack, and upstream's own
 * replays open here - which is not a nicety, it is the conformance test. This
 * port is proved by loading two of their replays and matching them frame for
 * frame; a private format would have been a second thing to be wrong.
 *
 * The door already has a ReplayRecorder for TETRIS in server/replay-manager.ts.
 * It records piece types and rotations and is the wrong shape for a game with
 * no pieces, so this does not extend it - the two games share a door and
 * nothing else.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PanelReplayRecorder = exports.STACK_TYPES = exports.PANEL_SOURCE_TYPES = exports.REPLAY_VERSION = void 0;
exports.loadReplayV3 = loadReplayV3;
const input_codec_1 = require("./input-codec");
const generator_source_1 = require("./generator-source");
const legacy_panel_source_1 = require("./legacy-panel-source");
const level_data_1 = require("./level-data");
const replay_1 = require("./replay");
exports.REPLAY_VERSION = 3;
/** Which kind of board the panels came from. Upstream's numbering. */
exports.PANEL_SOURCE_TYPES = { seedV1: 1, puzzle: 2, seedV2: 3 };
/** A real board, or a boardless opponent. Upstream's numbering. */
exports.STACK_TYPES = { Stack: 1, SimulatedStack: 2 };
/**
 * Collects one input character per frame and writes the file at the end.
 *
 * Recording costs one array push per frame and nothing else: the board is never
 * snapshotted, because a deterministic engine can rebuild it from the seed.
 */
class PanelReplayRecorder {
    constructor(options) {
        this.inputs = [];
        this.timestamp = Math.floor(Date.now() / 1000);
        this.options = options;
    }
    record(inputCharacter) {
        this.inputs.push(inputCharacter);
    }
    get frames() {
        return this.inputs.length;
    }
    /**
     * The finished replay.
     *
     * `completed` distinguishes a game that ended from one the player walked out
     * of; upstream marks the latter incomplete and so does this, because a
     * half-recorded game replays into a board that simply stops.
     */
    toReplayV3(completed) {
        const { options } = this;
        return {
            engineVersion: options.engineVersion,
            replayVersion: exports.REPLAY_VERSION,
            panelSource: {
                sourceType: exports.PANEL_SOURCE_TYPES.seedV1,
                seed: options.seed,
                allowAdjacentColorsOnStartingBoard: options.allowAdjacentColorsOnStartingBoard ?? false,
                shockEnabled: options.shockEnabled ?? true,
            },
            rules: {
                stackOverConditions: { HEALTH: 0 },
                stackWinConditions: {},
                stackSetupModifications: {},
                doCountdown: options.doCountdown,
            },
            stacks: [{
                    stackType: exports.STACK_TYPES.Stack,
                    levelData: options.levelData,
                    stackBehaviours: options.behaviours,
                    inputMethod: 'controller',
                    inputs: (0, input_codec_1.compressInputString)(this.inputs.join('')),
                }],
            garbageFlows: [],
            metadata: {
                timestamp: this.timestamp,
                stacks: [{
                        stackIndex: 1,
                        name: options.playerName,
                        level: options.level,
                    }],
                gameModeName: options.mode,
                duration: this.inputs.length,
                ...(completed ? { completed: true } : { incomplete: true }),
            },
        };
    }
    toJson(completed) {
        return JSON.stringify(this.toReplayV3(completed));
    }
    /**
     * The name upstream would give this file.
     *
     * Worth matching: a caller who downloads their replays and drops them into
     * Panel Attack finds them sorted the way that program expects.
     */
    fileName(completed) {
        const when = new Date(this.timestamp * 1000);
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = [
            when.getFullYear(), pad(when.getMonth() + 1), pad(when.getDate()),
            pad(when.getHours()), pad(when.getMinutes()), pad(when.getSeconds()),
        ].join('-');
        const level = this.options.level !== undefined ? `-L${this.options.level}` : '';
        const tail = completed ? '' : '-INCOMPLETE';
        return `v${this.options.engineVersion}-${stamp}-${this.options.playerName}`
            + `${level}-${this.options.mode}${tail}`;
    }
}
exports.PanelReplayRecorder = PanelReplayRecorder;
/**
 * Load a V3 replay for playback.
 *
 * Returns the same LoadedReplay the V1 loader does, so playback, simulation and
 * the conformance tests all go through one path regardless of which version the
 * file was written in.
 */
function loadReplayV3(json) {
    const parsed = JSON.parse(json);
    if (parsed.replayVersion !== exports.REPLAY_VERSION) {
        throw new Error(`not a V3 replay: version ${parsed.replayVersion}`);
    }
    const stack = parsed.stacks.find((entry) => entry.stackType === exports.STACK_TYPES.Stack);
    if (!stack)
        throw new Error('replay has no player stack');
    const { seed, shockEnabled, allowAdjacentColorsOnStartingBoard } = parsed.panelSource;
    let panelSource;
    if ((0, replay_1.usesLegacyPanelSource)(parsed.engineVersion)) {
        const legacy = new legacy_panel_source_1.LegacyPanelSource(seed, shockEnabled);
        legacy.setAllowAdjacentColorsOnStartingBoard(allowAdjacentColorsOnStartingBoard);
        panelSource = legacy;
    }
    else {
        panelSource = new generator_source_1.GeneratorSource(seed, shockEnabled);
    }
    // levelData travels in the file; a level number is only a label for it.
    const levelData = stack.levelData ?? (0, level_data_1.getModern)(10);
    return {
        engineVersion: parsed.engineVersion,
        seed,
        inputs: (0, input_codec_1.decompressInputString)(stack.inputs),
        levelData,
        doCountdown: parsed.rules.doCountdown,
        cursorWaitTime: 20,
        panelSource,
    };
}
//# sourceMappingURL=replay-recorder.js.map