"use strict";
/**
 * TetriNET Game Rules
 *
 * Defines rule configurations for TetriNET games:
 * - Classic: No specials (pure Tetris)
 * - Standard: Original 9 TetriNET specials
 * - Extended: All 16 specials including TetriNET2 additions
 * - Custom: User-configurable special rates
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTENDED_OPTIONS = exports.STANDARD_OPTIONS = exports.CLASSIC_OPTIONS = void 0;
exports.getDefaultOptions = getDefaultOptions;
exports.createCustomOptions = createCustomOptions;
exports.validateOptions = validateOptions;
exports.getGarbageToSend = getGarbageToSend;
exports.getSpecialsToGenerate = getSpecialsToGenerate;
exports.getRuleDisplayName = getRuleDisplayName;
exports.getRuleDescription = getRuleDescription;
exports.getLevelSpeed = getLevelSpeed;
exports.getLevelFromLines = getLevelFromLines;
/**
 * Default options for Classic rule (no specials)
 */
exports.CLASSIC_OPTIONS = {
    rule: 'classic',
    noSpecials: true,
    inventorySize: 0,
    linesToMakeForSpecials: 1,
    specialsAddedEachTime: 0,
    specialOccurancies: [],
    startingHeight: 0,
    linesPerLevel: 2,
    levelIncrement: 1,
    pieceFrequency: [14, 28, 42, 56, 70, 84, 100],
    specialFrequency: [11, 22, 33, 44, 55, 66, 77, 88, 100],
    levelAverage: false,
    classicMode: true,
    startingLevel: 0,
    classicStyleMultiplayer: true,
    nextPieceDelayMs: 1000,
    delayBeforeSuddenDeath: 3,
    suddenDeathTick: 5,
};
/**
 * Default options for Standard rule (original 9 specials)
 */
exports.STANDARD_OPTIONS = {
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
    startingHeight: 0,
    linesPerLevel: 2,
    levelIncrement: 1,
    pieceFrequency: [14, 28, 42, 56, 70, 84, 100],
    specialFrequency: [11, 22, 33, 44, 55, 66, 77, 88, 100],
    levelAverage: false,
    classicMode: false,
    startingLevel: 0,
    classicStyleMultiplayer: true,
    nextPieceDelayMs: 1000,
    delayBeforeSuddenDeath: 2,
    suddenDeathTick: 5,
};
/**
 * Default options for Extended rule (all 16 specials)
 */
exports.EXTENDED_OPTIONS = {
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
    startingHeight: 0,
    linesPerLevel: 2,
    levelIncrement: 1,
    pieceFrequency: [14, 28, 42, 56, 70, 84, 100],
    specialFrequency: [11, 22, 33, 44, 55, 66, 77, 88, 100],
    levelAverage: false,
    classicMode: false,
    startingLevel: 0,
    classicStyleMultiplayer: true,
    nextPieceDelayMs: 1000,
    delayBeforeSuddenDeath: 2,
    suddenDeathTick: 5,
};
/**
 * Get default options for a rule type
 */
function getDefaultOptions(rule) {
    switch (rule) {
        case 'classic':
            return { ...exports.CLASSIC_OPTIONS };
        case 'standard':
            return { ...exports.STANDARD_OPTIONS };
        case 'extended':
            return { ...exports.EXTENDED_OPTIONS };
        case 'custom':
            // Start with extended as base for custom
            return { ...exports.EXTENDED_OPTIONS, rule: 'custom' };
    }
}
/**
 * Create custom options
 */
function createCustomOptions(baseRule, overrides) {
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
function validateOptions(options) {
    const errors = [];
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
    if (options.nextPieceDelayMs < 0 || options.nextPieceDelayMs > 5000) {
        errors.push('Next piece delay must be 0-5000 ms');
    }
    if (options.suddenDeathTick < 1 || options.suddenDeathTick > 30) {
        errors.push('Sudden death tick must be 1-30 seconds');
    }
    if (options.pieceFrequency.length !== 7) {
        errors.push('Piece frequency must have 7 values');
    }
    if (options.specialFrequency.length !== 9) {
        errors.push('Special frequency must have 9 values');
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
function getGarbageToSend(linesCleared, classicStyle) {
    if (!classicStyle) {
        // Non-classic: 1 garbage per line cleared
        return linesCleared;
    }
    // Classic TetriNET garbage rules
    switch (linesCleared) {
        case 1: return 0; // Single sends nothing
        case 2: return 1; // Double sends 1
        case 3: return 2; // Triple sends 2
        case 4: return 4; // Tetris sends 4
        default: return Math.max(0, linesCleared - 1);
    }
}
/**
 * Get specials to generate based on lines cleared
 */
function getSpecialsToGenerate(linesCleared, options) {
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
function getRuleDisplayName(rule) {
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
function getRuleDescription(rule) {
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
function getLevelSpeed(level) {
    // TetriNET formula: 1050 - (10 * level) ms, minimum 50ms
    return Math.max(50, 1050 - (10 * level));
}
/**
 * Get level from lines cleared (TetriNET style)
 */
function getLevelFromLines(linesCleared, startingLevel) {
    // Every 10 lines = 1 level
    const levelFromLines = Math.floor(linesCleared / 10);
    return Math.min(100, startingLevel + levelFromLines);
}
//# sourceMappingURL=game-rules.js.map