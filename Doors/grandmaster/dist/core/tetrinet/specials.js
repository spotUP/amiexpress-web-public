"use strict";
/**
 * TetriNET Special Blocks
 *
 * Defines all 16 special block types from TetriNET Extended rules.
 * Each special has properties for targeting, duration, and spawn rate.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPECIALS = void 0;
exports.getSpecialByChar = getSpecialByChar;
exports.getAllSpecials = getAllSpecials;
exports.getSpecialsForRule = getSpecialsForRule;
exports.canTargetOthers = canTargetOthers;
exports.isContinuous = isContinuous;
exports.getSpecialDisplay = getSpecialDisplay;
exports.getSpecialColor = getSpecialColor;
exports.getSpecialDisplayChar = getSpecialDisplayChar;
exports.selectRandomSpecial = selectRandomSpecial;
/**
 * All special block definitions with TetriNET2 Extended default spawn rates
 */
exports.SPECIALS = {
    add_line: {
        type: 'add_line',
        char: 'A',
        name: 'Add Line',
        description: 'Send 1 garbage line to target',
        targetable: true,
        selfOnly: false,
        continuous: false,
        duration: 0,
        pieceCount: 0,
        occurancy: 11,
        color: 'red',
    },
    clear_line: {
        type: 'clear_line',
        char: 'C',
        name: 'Clear Line',
        description: 'Remove 1 line from your board',
        targetable: false,
        selfOnly: true,
        continuous: false,
        duration: 0,
        pieceCount: 0,
        occurancy: 11,
        color: 'cyan',
    },
    nuke: {
        type: 'nuke',
        char: 'N',
        name: 'Nuke Field',
        description: 'Clear target\'s entire board',
        targetable: true,
        selfOnly: false,
        continuous: false,
        duration: 0,
        pieceCount: 0,
        occurancy: 3,
        color: 'yellow',
    },
    random_clear: {
        type: 'random_clear',
        char: 'R',
        name: 'Random Clear',
        description: 'Remove 10-25% of target\'s blocks',
        targetable: true,
        selfOnly: false,
        continuous: false,
        duration: 0,
        pieceCount: 0,
        occurancy: 10,
        color: 'green',
    },
    switch: {
        type: 'switch',
        char: 'S',
        name: 'Switch Fields',
        description: 'Swap your board with target',
        targetable: true,
        selfOnly: false,
        continuous: false,
        duration: 0,
        pieceCount: 0,
        occurancy: 3,
        color: 'magenta',
    },
    clear_specials: {
        type: 'clear_specials',
        char: 'B',
        name: 'Clear Specials',
        description: 'Remove all special blocks from board',
        targetable: true,
        selfOnly: false,
        continuous: false,
        duration: 0,
        pieceCount: 0,
        occurancy: 9,
        color: 'blue',
    },
    gravity: {
        type: 'gravity',
        char: 'G',
        name: 'Gravity',
        description: 'Blocks fall to fill holes',
        targetable: true,
        selfOnly: false,
        continuous: false,
        duration: 0,
        pieceCount: 0,
        occurancy: 6,
        color: 'white',
    },
    quake: {
        type: 'quake',
        char: 'Q',
        name: 'Quake',
        description: 'Shift rows randomly left/right',
        targetable: true,
        selfOnly: false,
        continuous: false,
        duration: 0,
        pieceCount: 0,
        occurancy: 9,
        color: 'yellow',
    },
    block_bomb: {
        type: 'block_bomb',
        char: 'O',
        name: 'Block Bomb',
        description: 'Explode bomb blocks in target\'s field',
        targetable: true,
        selfOnly: false,
        continuous: false,
        duration: 0,
        pieceCount: 0,
        occurancy: 9,
        color: 'red',
    },
    clear_column: {
        type: 'clear_column',
        char: 'V',
        name: 'Clear Column',
        description: 'Remove a random column from your board',
        targetable: false,
        selfOnly: true,
        continuous: false,
        duration: 0,
        pieceCount: 0,
        occurancy: 5,
        color: 'cyan',
    },
    immunity: {
        type: 'immunity',
        char: 'I',
        name: 'Immunity',
        description: 'Protected from specials for 5 seconds',
        targetable: false,
        selfOnly: true,
        continuous: true,
        duration: 5000,
        pieceCount: 0,
        occurancy: 3,
        color: 'white',
    },
    darkness: {
        type: 'darkness',
        char: 'D',
        name: 'Darkness',
        description: 'Hide target\'s piece preview for 5 seconds',
        targetable: true,
        selfOnly: false,
        continuous: true,
        duration: 5000,
        pieceCount: 0,
        occurancy: 5,
        color: 'black',
    },
    confusion: {
        type: 'confusion',
        char: 'F',
        name: 'Confusion',
        description: 'Reverse target\'s left/right controls for 5 seconds',
        targetable: true,
        selfOnly: false,
        continuous: true,
        duration: 5000,
        pieceCount: 0,
        occurancy: 3,
        color: 'magenta',
    },
    mutation: {
        type: 'mutation',
        char: 'M',
        name: 'Mutation',
        description: 'Randomize target\'s next 5 pieces',
        targetable: true,
        selfOnly: false,
        continuous: true,
        duration: 0, // Piece-based, not time-based
        pieceCount: 5,
        occurancy: 7,
        color: 'green',
    },
    zebra: {
        type: 'zebra',
        char: 'Z',
        name: 'Zebra Field',
        description: 'Fill target\'s board with alternating pattern',
        targetable: true,
        selfOnly: false,
        continuous: false,
        duration: 0,
        pieceCount: 0,
        occurancy: 3,
        color: 'white',
    },
    left_gravity: {
        type: 'left_gravity',
        char: 'L',
        name: 'Left Gravity',
        description: 'Blocks shift left instead of falling',
        targetable: true,
        selfOnly: false,
        continuous: false,
        duration: 0,
        pieceCount: 0,
        occurancy: 3,
        color: 'blue',
    },
};
/**
 * Get special by single character code
 */
function getSpecialByChar(char) {
    const upperChar = char.toUpperCase();
    for (const special of Object.values(exports.SPECIALS)) {
        if (special.char === upperChar) {
            return special;
        }
    }
    return null;
}
/**
 * Get all specials as array (for iteration)
 */
function getAllSpecials() {
    return Object.values(exports.SPECIALS);
}
/**
 * Get specials by rule set
 */
function getSpecialsForRule(rule) {
    if (rule === 'classic') {
        return []; // No specials in classic mode
    }
    // Standard TetriNET specials (original 9)
    const standard = [
        'add_line',
        'clear_line',
        'nuke',
        'random_clear',
        'switch',
        'clear_specials',
        'gravity',
        'quake',
        'block_bomb',
    ];
    if (rule === 'standard') {
        return standard;
    }
    // Extended adds 7 more specials
    return [
        ...standard,
        'clear_column',
        'immunity',
        'darkness',
        'confusion',
        'mutation',
        'zebra',
        'left_gravity',
    ];
}
/**
 * Check if special can target other players
 */
function canTargetOthers(type) {
    return exports.SPECIALS[type].targetable && !exports.SPECIALS[type].selfOnly;
}
/**
 * Check if special is continuous (has duration)
 */
function isContinuous(type) {
    return exports.SPECIALS[type].continuous;
}
/**
 * Get display string for special (colored char)
 */
function getSpecialDisplay(type) {
    const special = exports.SPECIALS[type];
    return `{${special.color}-fg}${special.char}{/${special.color}-fg}`;
}
/**
 * Get display color for special type
 */
function getSpecialColor(type) {
    return exports.SPECIALS[type].color;
}
/**
 * Get display character for special type
 */
function getSpecialDisplayChar(type) {
    return exports.SPECIALS[type].char;
}
/**
 * Random special selection based on occurancy weights
 */
function selectRandomSpecial(availableSpecials) {
    if (availableSpecials.length === 0) {
        throw new Error('No specials available');
    }
    // Calculate total weight
    let totalWeight = 0;
    for (const type of availableSpecials) {
        totalWeight += exports.SPECIALS[type].occurancy;
    }
    // Random selection
    let random = Math.random() * totalWeight;
    for (const type of availableSpecials) {
        random -= exports.SPECIALS[type].occurancy;
        if (random <= 0) {
            return type;
        }
    }
    // Fallback to last special
    return availableSpecials[availableSpecials.length - 1];
}
//# sourceMappingURL=specials.js.map