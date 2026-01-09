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
import { SPECIALS, getSpecialsForRule } from './specials';

/**
 * TetriNET game rule type
 */
export type TetriNetRule = 'classic' | 'standard' | 'extended' | 'custom';

/**
 * Special occurrence rate configuration
 */
export interface SpecialOccurancy {
  type: SpecialType;
  rate: number;  // 0-100 (percentage weight)
}

/**
 * TetriNET game options
 */
export interface TetriNetGameOptions {
  // Rule set
  rule: TetriNetRule;

  // Special block settings
  noSpecials: boolean;                  // True = no specials (classic mode)
  inventorySize: number;                // 1-15 (default 10)
  linesToMakeForSpecials: number;       // 1-4 (lines to clear for specials, default 1)
  specialsAddedEachTime: number;        // 1-4 (specials added per clear, default 1)
  specialOccurancies: SpecialOccurancy[]; // Custom spawn rates

  // Game settings
  startingLevel: number;                // 0-100 (default 0)
  classicStyleMultiplayer: boolean;     // Line clear multipliers for garbage

  // Sudden death settings
  delayBeforeSuddenDeath: number;       // 0-15 minutes (0 = disabled)
  suddenDeathTick: number;              // 1-30 seconds between line additions
}

/**
 * Default options for Classic rule (no specials)
 */
export const CLASSIC_OPTIONS: TetriNetGameOptions = {
  rule: 'classic',
  noSpecials: true,
  inventorySize: 0,
  linesToMakeForSpecials: 1,
  specialsAddedEachTime: 0,
  specialOccurancies: [],
  startingLevel: 0,
  classicStyleMultiplayer: true,
  delayBeforeSuddenDeath: 3,
  suddenDeathTick: 5,
};

/**
 * Default options for Standard rule (original 9 specials)
 */
export const STANDARD_OPTIONS: TetriNetGameOptions = {
  rule: 'standard',
  noSpecials: false,
  inventorySize: 10,
  linesToMakeForSpecials: 1,
  specialsAddedEachTime: 1,
  specialOccurancies: [
    { type: 'add_line', rate: 14 },
    { type: 'clear_line', rate: 14 },
    { type: 'nuke', rate: 3 },
    { type: 'random_clear', rate: 11 },
    { type: 'switch', rate: 3 },
    { type: 'clear_specials', rate: 14 },
    { type: 'gravity', rate: 11 },
    { type: 'quake', rate: 15 },
    { type: 'block_bomb', rate: 15 },
  ],
  startingLevel: 0,
  classicStyleMultiplayer: true,
  delayBeforeSuddenDeath: 2,
  suddenDeathTick: 5,
};

/**
 * Default options for Extended rule (all 16 specials)
 */
export const EXTENDED_OPTIONS: TetriNetGameOptions = {
  rule: 'extended',
  noSpecials: false,
  inventorySize: 10,
  linesToMakeForSpecials: 1,
  specialsAddedEachTime: 1,
  specialOccurancies: [
    // Original specials
    { type: 'add_line', rate: 11 },
    { type: 'clear_line', rate: 11 },
    { type: 'nuke', rate: 3 },
    { type: 'random_clear', rate: 10 },
    { type: 'switch', rate: 3 },
    { type: 'clear_specials', rate: 9 },
    { type: 'gravity', rate: 6 },
    { type: 'quake', rate: 9 },
    { type: 'block_bomb', rate: 9 },
    // Extended specials
    { type: 'clear_column', rate: 5 },
    { type: 'immunity', rate: 3 },
    { type: 'darkness', rate: 5 },
    { type: 'confusion', rate: 3 },
    { type: 'mutation', rate: 7 },
    { type: 'zebra', rate: 3 },
    { type: 'left_gravity', rate: 3 },
  ],
  startingLevel: 0,
  classicStyleMultiplayer: true,
  delayBeforeSuddenDeath: 2,
  suddenDeathTick: 5,
};

/**
 * Get default options for a rule type
 */
export function getDefaultOptions(rule: TetriNetRule): TetriNetGameOptions {
  switch (rule) {
    case 'classic':
      return { ...CLASSIC_OPTIONS };
    case 'standard':
      return { ...STANDARD_OPTIONS };
    case 'extended':
      return { ...EXTENDED_OPTIONS };
    case 'custom':
      // Start with extended as base for custom
      return { ...EXTENDED_OPTIONS, rule: 'custom' };
  }
}

/**
 * Create custom options
 */
export function createCustomOptions(
  baseRule: TetriNetRule,
  overrides: Partial<TetriNetGameOptions>
): TetriNetGameOptions {
  const base = getDefaultOptions(baseRule);
  return {
    ...base,
    ...overrides,
    rule: 'custom',
  };
}

/**
 * Validate options
 */
export function validateOptions(options: TetriNetGameOptions): string[] {
  const errors: string[] = [];

  if (options.inventorySize < 0 || options.inventorySize > 15) {
    errors.push('Inventory size must be 0-15');
  }

  if (options.linesToMakeForSpecials < 1 || options.linesToMakeForSpecials > 4) {
    errors.push('Lines for specials must be 1-4');
  }

  if (options.specialsAddedEachTime < 0 || options.specialsAddedEachTime > 4) {
    errors.push('Specials added must be 0-4');
  }

  if (options.startingLevel < 0 || options.startingLevel > 100) {
    errors.push('Starting level must be 0-100');
  }

  if (options.delayBeforeSuddenDeath < 0 || options.delayBeforeSuddenDeath > 15) {
    errors.push('Sudden death delay must be 0-15 minutes');
  }

  if (options.suddenDeathTick < 1 || options.suddenDeathTick > 30) {
    errors.push('Sudden death tick must be 1-30 seconds');
  }

  // Validate special rates total
  if (!options.noSpecials && options.specialOccurancies.length > 0) {
    const total = options.specialOccurancies.reduce((sum, s) => sum + s.rate, 0);
    if (total === 0) {
      errors.push('Special rates must total more than 0');
    }
  }

  return errors;
}

/**
 * Get garbage lines to send based on lines cleared (classic multiplayer rules)
 */
export function getGarbageToSend(linesCleared: number, classicStyle: boolean): number {
  if (!classicStyle) {
    // Non-classic: 1 garbage per line cleared
    return linesCleared;
  }

  // Classic TetriNET garbage rules
  switch (linesCleared) {
    case 1: return 0;  // Single sends nothing
    case 2: return 1;  // Double sends 1
    case 3: return 2;  // Triple sends 2
    case 4: return 4;  // Tetris sends 4
    default: return Math.max(0, linesCleared - 1);
  }
}

/**
 * Get specials to generate based on lines cleared
 */
export function getSpecialsToGenerate(
  linesCleared: number,
  options: TetriNetGameOptions
): number {
  if (options.noSpecials || linesCleared < options.linesToMakeForSpecials) {
    return 0;
  }

  // Calculate how many "sets" of lines cleared
  const sets = Math.floor(linesCleared / options.linesToMakeForSpecials);
  return sets * options.specialsAddedEachTime;
}

/**
 * Get rule display name
 */
export function getRuleDisplayName(rule: TetriNetRule): string {
  switch (rule) {
    case 'classic': return 'Classic (No Specials)';
    case 'standard': return 'Standard (9 Specials)';
    case 'extended': return 'Extended (16 Specials)';
    case 'custom': return 'Custom Rules';
  }
}

/**
 * Get rule description
 */
export function getRuleDescription(rule: TetriNetRule): string {
  switch (rule) {
    case 'classic':
      return 'Pure Tetris gameplay with no special blocks. Lines cleared send garbage.';
    case 'standard':
      return 'Original TetriNET with 9 classic specials: Add Line, Clear Line, Nuke, ' +
             'Random Clear, Switch, Clear Specials, Gravity, Quake, Block Bomb.';
    case 'extended':
      return 'All 16 specials including: Immunity, Darkness, Confusion, Mutation, ' +
             'Clear Column, Zebra Field, and Left Gravity.';
    case 'custom':
      return 'Customize special spawn rates and game settings.';
  }
}

/**
 * Calculate game speed based on level (TetriNET style)
 * Returns drop interval in ms
 */
export function getLevelSpeed(level: number): number {
  // TetriNET formula: 1050 - (10 * level) ms, minimum 50ms
  return Math.max(50, 1050 - (10 * level));
}

/**
 * Get level from lines cleared (TetriNET style)
 */
export function getLevelFromLines(linesCleared: number, startingLevel: number): number {
  // Every 10 lines = 1 level
  const levelFromLines = Math.floor(linesCleared / 10);
  return Math.min(100, startingLevel + levelFromLines);
}
