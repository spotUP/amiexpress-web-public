/**
 * TetriNET Game Rules
 *
 * Defines rule configurations for TetriNET games:
 * - Classic: No specials (pure Tetris)
 * - Standard: Original 9 TetriNET specials
 * - Extended: All 16 specials including TetriNET2 additions
 * - Custom: User-configurable special rates
 */
import type { SpecialType } from './specials';
/**
 * TetriNET game rule type
 */
export type TetriNetRule = 'classic' | 'standard' | 'extended' | 'custom';
/**
 * Special occurrence rate configuration
 */
export interface SpecialOccurancy {
    type: SpecialType;
    rate: number;
}
/**
 * TetriNET game options
 */
export interface TetriNetGameOptions {
    rule: TetriNetRule;
    noSpecials: boolean;
    inventorySize: number;
    linesToMakeForSpecials: number;
    specialsAddedEachTime: number;
    specialOccurancies: SpecialOccurancy[];
    startingHeight: number;
    linesPerLevel: number;
    levelIncrement: number;
    pieceFrequency: number[];
    specialFrequency: number[];
    levelAverage: boolean;
    classicMode: boolean;
    startingLevel: number;
    classicStyleMultiplayer: boolean;
    nextPieceDelayMs: number;
    useSameBlocks?: boolean;
    randomSeed?: number;
    delayBeforeSuddenDeath: number;
    suddenDeathTick: number;
}
/**
 * Default options for Classic rule (no specials)
 */
export declare const CLASSIC_OPTIONS: TetriNetGameOptions;
/**
 * Default options for Standard rule (original 9 specials)
 */
export declare const STANDARD_OPTIONS: TetriNetGameOptions;
/**
 * Default options for Extended rule (all 16 specials)
 */
export declare const EXTENDED_OPTIONS: TetriNetGameOptions;
/**
 * Get default options for a rule type
 */
export declare function getDefaultOptions(rule: TetriNetRule): TetriNetGameOptions;
/**
 * Create custom options
 */
export declare function createCustomOptions(baseRule: TetriNetRule, overrides: Partial<TetriNetGameOptions>): TetriNetGameOptions;
/**
 * Validate options
 */
export declare function validateOptions(options: TetriNetGameOptions): string[];
/**
 * Get garbage lines to send based on lines cleared (classic multiplayer rules)
 */
export declare function getGarbageToSend(linesCleared: number, classicStyle: boolean): number;
/**
 * Get specials to generate based on lines cleared
 */
export declare function getSpecialsToGenerate(linesCleared: number, options: TetriNetGameOptions): number;
/**
 * Get rule display name
 */
export declare function getRuleDisplayName(rule: TetriNetRule): string;
/**
 * Get rule description
 */
export declare function getRuleDescription(rule: TetriNetRule): string;
/**
 * Calculate game speed based on level (TetriNET style)
 * Returns drop interval in ms
 */
export declare function getLevelSpeed(level: number): number;
/**
 * Get level from lines cleared (TetriNET style)
 */
export declare function getLevelFromLines(linesCleared: number, startingLevel: number): number;
//# sourceMappingURL=game-rules.d.ts.map