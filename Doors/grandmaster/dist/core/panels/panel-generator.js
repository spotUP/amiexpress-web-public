"use strict";
/**
 * PanelGenerator, ported from common/engine/PanelGenerator.lua (@ c80668e).
 *
 * Rows are generated as strings of digits, one character per cell, and every
 * cell is rerolled until it satisfies three rules:
 *
 *   1. never the same colour as the panel below it (so a vertical pair can
 *      never be generated, which makes a generated vertical triple impossible)
 *   2. never a third of the same colour in a row horizontally
 *   3. horizontally adjacent pairs only at a certain frequency, per level
 *
 * Rule 3 is where the subtleties live, and they matter because every reroll
 * consumes a random number: get the acceptance wrong once and every subsequent
 * panel in the game differs.
 *
 * TWO LUA SEMANTICS THAT DO NOT SURVIVE A NAIVE PORT:
 *
 *   `0/0` is NaN, and `NaN <= x` is false. Upstream relies on this: on the very
 *   first adjacent pair the running frequency is 0/0, the comparison is false,
 *   and the pair is ACCEPTED. The comment in the Lua calls it "a bit jank". JS
 *   agrees with Lua on both counts, so this ports as-is - but only if the
 *   division is left alone. Guarding the zero denominator would change the
 *   first roll of every game.
 *
 *   `tonumber("0")` is 0, and 0 is TRUTHY in Lua - only nil and false are
 *   falsy. assignMetalLocations loops `while not tonumber(char)`, which in Lua
 *   exits on "0" and continues on "A". Writing that as `while (!Number(char))`
 *   in JS would spin on "0", because 0 is falsy here. Hence luaToNumber below,
 *   which answers "is this numeric" separately from the value.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PanelGenerator = exports.PANEL_COLOR_NUMBER_TO_LOWER = exports.PANEL_COLOR_NUMBER_TO_UPPER = exports.PANEL_COLOR_TO_NUMBER = void 0;
/** Colour letter/digit to colour number. Upper and lower case are the two shock slots. */
exports.PANEL_COLOR_TO_NUMBER = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, J: 0,
    a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 0,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '0': 0,
};
/** Colour number to its uppercase marker - the FIRST potential shock slot in a row. */
exports.PANEL_COLOR_NUMBER_TO_UPPER = {
    0: '0', 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E', 6: 'F', 7: 'G', 8: 'H', 9: 'I',
};
/** Colour number to its lowercase marker - the SECOND potential shock slot. */
exports.PANEL_COLOR_NUMBER_TO_LOWER = {
    0: '0', 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e', 6: 'f', 7: 'g', 8: 'h', 9: 'i',
};
/**
 * Lua's `tonumber` for a single character: the value, or null when not numeric.
 *
 * Kept separate from truthiness on purpose - see the header. "0" is numeric and
 * must be treated as such.
 */
function luaToNumber(char) {
    if (char === '' || !/^[0-9]$/.test(char))
        return null;
    return Number(char);
}
/** The colour number a row string holds at `index` (1-based, as in Lua). */
function colorAt(row, index) {
    return exports.PANEL_COLOR_TO_NUMBER[row.charAt(index - 1)];
}
/** The colour number `offset` characters back from the end (1 = last). */
function colorFromEnd(row, offset) {
    return exports.PANEL_COLOR_TO_NUMBER[row.charAt(row.length - offset)];
}
const prng_1 = require("./prng");
class PanelGenerator {
    constructor(seed, adjacentDenialFrequency) {
        /** Upstream keeps this purely to see how often random was called. Kept for parity in tests. */
        this.generatedCount = 0;
        this.adjacentAccepted = 0;
        this.adjacentDenied = 0;
        this.seed = seed;
        this.adjacentDenialFrequency = adjacentDenialFrequency;
        this.rng = new prng_1.RandomGenerator(seed);
    }
    random(min, max) {
        this.generatedCount += 1;
        return this.rng.randomRange(min, max);
    }
    getState() {
        return this.rng.getState();
    }
    setState(state) {
        this.rng.setState(state);
    }
    /**
     * Generate one row of `rowWidth` panels, given the row below it.
     *
     * `previousRow` is the row this one will sit on top of; an empty string is
     * treated as a row of empties, exactly as upstream does.
     */
    generatePanels(rowWidth, ncolors, previousRow) {
        let previous = previousRow;
        if (!previous || previous === '')
            previous = '0'.repeat(rowWidth);
        if (ncolors < 2) {
            throw new Error(`Trying to generate panels with only ${ncolors} colors`);
        }
        let newPanels = '';
        for (let n = 1; n <= rowWidth; n++) {
            // Two identical colours already sitting at the end of this row means the
            // next one may not make a third.
            const previousTwoMatchOnThisRow = n > 2 && colorFromEnd(newPanels, 1) === colorFromEnd(newPanels, 2);
            const belowColor = colorAt(previous, n);
            let nogood = true;
            let color = 0;
            while (nogood) {
                color = this.random(1, ncolors);
                if (color === belowColor) {
                    // can't have the same color as above
                    nogood = true;
                }
                else if (previousTwoMatchOnThisRow && color === colorFromEnd(newPanels, 1)) {
                    // can't have three in a row
                    nogood = true;
                }
                else if (n > 1 && color === colorFromEnd(newPanels, 1)) {
                    // only allow horizontally adjacent colors with a certain frequency
                    if (this.adjacentDenialFrequency >= 1) {
                        // denying everything, no need to track numbers
                        nogood = true;
                    }
                    else if (this.adjacentDenialFrequency === 0) {
                        nogood = false;
                    }
                    else {
                        // NaN on the very first call, and NaN <= x is false, so the first
                        // adjacent pair of a game is always accepted. Do not "fix" this.
                        const frequency = this.adjacentDenied / (this.adjacentAccepted + this.adjacentDenied);
                        if (frequency <= this.adjacentDenialFrequency) {
                            this.adjacentDenied += 1;
                            nogood = true;
                        }
                        else {
                            this.adjacentAccepted += 1;
                            nogood = false;
                        }
                    }
                }
                else {
                    nogood = false;
                }
            }
            newPanels += String(color);
        }
        return newPanels;
    }
    /**
     * Mark two cells of a row as the potential shock positions.
     *
     * The first becomes uppercase, the second lowercase; whether either actually
     * becomes a shock panel is decided later by convertMetalPanels, from how many
     * the stack has queued. Positions are rerolled while the SAME position in the
     * row below is already a marker, so shock panels cannot ghost-match on their
     * own - the same reasoning as the colour rules above.
     */
    assignMetalLocations(rowString, previousRowString) {
        const rowWidth = rowString.length;
        let previous = previousRowString;
        if (!previous || previous === '')
            previous = '0'.repeat(rowWidth);
        let first;
        let second;
        while (first === undefined || luaToNumber(previous.charAt(first - 1)) === null) {
            first = this.random(1, rowWidth);
        }
        while (second === undefined ||
            second === first ||
            luaToNumber(previous.charAt(second - 1)) === null) {
            second = this.random(1, rowWidth);
        }
        let newString = '';
        for (let j = 1; j <= rowWidth; j++) {
            const char = rowString.charAt(j - 1);
            const num = luaToNumber(char);
            if (j === first) {
                newString += (num === null ? undefined : exports.PANEL_COLOR_NUMBER_TO_UPPER[num]) ?? char ?? '0';
            }
            else if (j === second) {
                newString += (num === null ? undefined : exports.PANEL_COLOR_NUMBER_TO_LOWER[num]) ?? char ?? '0';
            }
            else {
                newString += char;
            }
        }
        return newString;
    }
}
exports.PanelGenerator = PanelGenerator;
//# sourceMappingURL=panel-generator.js.map