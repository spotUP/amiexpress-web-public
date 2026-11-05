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
import { compressInputString, decompressInputString } from './input-codec';
import { GeneratorSource, type PanelSource } from './generator-source';
import { LegacyPanelSource } from './legacy-panel-source';
import { getModern } from './level-data';
import { usesLegacyPanelSource, type LoadedReplay } from './replay';

export const REPLAY_VERSION = 3;

/** Which kind of board the panels came from. Upstream's numbering. */
export const PANEL_SOURCE_TYPES = { seedV1: 1, puzzle: 2, seedV2: 3 } as const;
/** A real board, or a boardless opponent. Upstream's numbering. */
export const STACK_TYPES = { Stack: 1, SimulatedStack: 2 } as const;

/** The mode names upstream writes into a replay. */
export type ReplayGameMode =
  'endless' | 'timeattack' | 'vsSelf' | 'training' | 'challenge' | 'VS' | 'puzzle';

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
  garbageFlows: Array<{ source: number; recipients: number[] }>;
  metadata: {
    timestamp: number;
    stacks: Array<{ stackIndex: number; name?: string; level?: number }>;
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
export class PanelReplayRecorder {
  private readonly options: PanelReplayOptions;
  private readonly inputs: string[] = [];
  private readonly timestamp = Math.floor(Date.now() / 1000);

  constructor(options: PanelReplayOptions) {
    this.options = options;
  }

  record(inputCharacter: string): void {
    this.inputs.push(inputCharacter);
  }

  get frames(): number {
    return this.inputs.length;
  }

  /**
   * The finished replay.
   *
   * `completed` distinguishes a game that ended from one the player walked out
   * of; upstream marks the latter incomplete and so does this, because a
   * half-recorded game replays into a board that simply stops.
   */
  toReplayV3(completed: boolean): ReplayV3Json {
    const { options } = this;

    return {
      engineVersion: options.engineVersion,
      replayVersion: REPLAY_VERSION,
      panelSource: {
        sourceType: PANEL_SOURCE_TYPES.seedV1,
        seed: options.seed,
        allowAdjacentColorsOnStartingBoard:
          options.allowAdjacentColorsOnStartingBoard ?? false,
        shockEnabled: options.shockEnabled ?? true,
      },
      rules: {
        stackOverConditions: { HEALTH: 0 },
        stackWinConditions: {},
        stackSetupModifications: {},
        doCountdown: options.doCountdown,
      },
      stacks: [{
        stackType: STACK_TYPES.Stack,
        levelData: options.levelData,
        stackBehaviours: options.behaviours,
        inputMethod: 'controller',
        inputs: compressInputString(this.inputs.join('')),
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

  toJson(completed: boolean): string {
    return JSON.stringify(this.toReplayV3(completed));
  }

  /**
   * The name upstream would give this file.
   *
   * Worth matching: a caller who downloads their replays and drops them into
   * Panel Attack finds them sorted the way that program expects.
   */
  fileName(completed: boolean): string {
    const when = new Date(this.timestamp * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
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

/**
 * Load a V3 replay for playback.
 *
 * Returns the same LoadedReplay the V1 loader does, so playback, simulation and
 * the conformance tests all go through one path regardless of which version the
 * file was written in.
 */
export function loadReplayV3(json: string): LoadedReplay {
  const parsed = JSON.parse(json) as ReplayV3Json;
  if (parsed.replayVersion !== REPLAY_VERSION) {
    throw new Error(`not a V3 replay: version ${parsed.replayVersion}`);
  }

  const stack = parsed.stacks.find((entry) => entry.stackType === STACK_TYPES.Stack);
  if (!stack) throw new Error('replay has no player stack');

  const { seed, shockEnabled, allowAdjacentColorsOnStartingBoard } = parsed.panelSource;

  let panelSource: PanelSource;
  if (usesLegacyPanelSource(parsed.engineVersion)) {
    const legacy = new LegacyPanelSource(seed, shockEnabled);
    legacy.setAllowAdjacentColorsOnStartingBoard(allowAdjacentColorsOnStartingBoard);
    panelSource = legacy;
  } else {
    panelSource = new GeneratorSource(seed, shockEnabled);
  }

  // levelData travels in the file; a level number is only a label for it.
  const levelData = stack.levelData ?? getModern(10);

  return {
    engineVersion: parsed.engineVersion,
    seed,
    inputs: decompressInputString(stack.inputs),
    levelData,
    doCountdown: parsed.rules.doCountdown,
    cursorWaitTime: 20,
    panelSource,
  };
}
