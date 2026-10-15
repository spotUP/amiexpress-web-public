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
import type { LevelData } from './level-data';
import type { StackBehaviours } from './stack';
import { type LoadedReplay } from './replay';
export declare const REPLAY_VERSION = 3;
/** Which kind of board the panels came from. Upstream's numbering. */
export declare const PANEL_SOURCE_TYPES: {
    readonly seedV1: 1;
    readonly puzzle: 2;
    readonly seedV2: 3;
};
/** A real board, or a boardless opponent. Upstream's numbering. */
export declare const STACK_TYPES: {
    readonly Stack: 1;
    readonly SimulatedStack: 2;
};
/** The mode names upstream writes into a replay. */
export type ReplayGameMode = 'endless' | 'timeattack' | 'vsSelf' | 'training' | 'challenge' | 'VS' | 'puzzle';
export interface ReplayV3Json {
    engineVersion: string;
    replayVersion: number;
    panelSource: {
        sourceType: number;
        seed: number;
        allowAdjacentColorsOnStartingBoard: boolean;
        shockEnabled: boolean;
    };
    rules: {
        stackOverConditions: Record<string, number>;
        stackWinConditions: Record<string, number>;
        stackSetupModifications: Record<string, unknown>;
        doCountdown: boolean;
    };
    stacks: Array<{
        stackType: number;
        levelData: LevelData;
        stackBehaviours: StackBehaviours;
        inputMethod: string;
        /** RLE-compressed, exactly as upstream stores it. */
        inputs: string;
    }>;
    garbageFlows: Array<{
        source: number;
        recipients: number[];
    }>;
    metadata: {
        timestamp: number;
        stacks: Array<{
            stackIndex: number;
            name?: string;
            level?: number;
        }>;
        gameModeName: ReplayGameMode;
        duration?: number;
        completed?: boolean;
        incomplete?: boolean;
    };
}
export interface PanelReplayOptions {
    engineVersion: string;
    seed: number;
    levelData: LevelData;
    behaviours: StackBehaviours;
    mode: ReplayGameMode;
    playerName: string;
    /** The modern level number, when the game was played on one. */
    level?: number;
    doCountdown: boolean;
    shockEnabled?: boolean;
    allowAdjacentColorsOnStartingBoard?: boolean;
}
/**
 * Collects one input character per frame and writes the file at the end.
 *
 * Recording costs one array push per frame and nothing else: the board is never
 * snapshotted, because a deterministic engine can rebuild it from the seed.
 */
export declare class PanelReplayRecorder {
    private readonly options;
    private readonly inputs;
    private readonly timestamp;
    constructor(options: PanelReplayOptions);
    record(inputCharacter: string): void;
    get frames(): number;
    /**
     * The finished replay.
     *
     * `completed` distinguishes a game that ended from one the player walked out
     * of; upstream marks the latter incomplete and so does this, because a
     * half-recorded game replays into a board that simply stops.
     */
    toReplayV3(completed: boolean): ReplayV3Json;
    toJson(completed: boolean): string;
    /**
     * The name upstream would give this file.
     *
     * Worth matching: a caller who downloads their replays and drops them into
     * Panel Attack finds them sorted the way that program expects.
     */
    fileName(completed: boolean): string;
}
/**
 * Load a V3 replay for playback.
 *
 * Returns the same LoadedReplay the V1 loader does, so playback, simulation and
 * the conformance tests all go through one path regardless of which version the
 * file was written in.
 */
export declare function loadReplayV3(json: string): LoadedReplay;
//# sourceMappingURL=replay-recorder.d.ts.map