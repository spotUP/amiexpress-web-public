"use strict";
/**
 * A board that was AUTHORED rather than generated.
 * Ports common/engine/PuzzleSource.lua.
 *
 * Every other source in this door invents panels; this one reads them out of a
 * string somebody wrote down. That makes it the only source whose rows cannot
 * be described as six colours, because an authored board can contain garbage,
 * and a garbage panel belongs to a BLOCK - which block, where inside it, how
 * wide and how tall - that a single digit has no room for.
 *
 * The notation, and the reason the walk below looks inside out:
 *
 *     [====]     one garbage block, one row tall, six wide
 *     {====}     the same, but metal
 *     [=====     a block spanning two rows: it opens on the row ABOVE
 *     =====]     and closes on the row below, because the string is read
 *                bottom-up and right-to-left
 *
 * So `]` and `}` OPEN a block (they are met first, at its bottom right) and `[`
 * and `{` close it at its top left. Every panel between them belongs to it. The
 * horizontal offset cannot be known until the closing marker is reached, so
 * upstream parks the column index in x_offset and subtracts afterwards; that is
 * kept, because it is also what makes irregular blocks come out the way the
 * original draws them.
 *
 * The panels are produced in one pass over the WHOLE string rather than row by
 * row, for the same reason: a block that spans rows cannot be resolved from one
 * row in isolation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PuzzleSource = void 0;
exports.buildPanels = buildPanels;
const consts_1 = require("./consts");
/** Characters that open a garbage block, reading bottom-up and right-to-left. */
const OPENS = new Set([']', '}']);
/** And close it. */
const CLOSES = new Set(['[', '{']);
class PuzzleSource {
    constructor(puzzleString, panelBuffer = '', garbageBuffer = '') {
        /** Panels already built and not yet handed to the stack, TOP row first. */
        this.pending = [];
        this.panelGenCount = 0;
        this.puzzleString = puzzleString;
        this.panelBuffer = panelBuffer;
        this.garbagePanelBuffer = garbageBuffer;
        // The buffer is consumed a row at a time, so a partial row is padded with
        // colourless panels rather than shifting every row after it.
        const remainder = this.panelBuffer.length % 6;
        if (remainder !== 0)
            this.panelBuffer += '9'.repeat(6 - remainder);
    }
    clone() {
        const copy = new PuzzleSource(this.puzzleString, '', this.garbagePanelBuffer);
        copy.panelBuffer = this.panelBuffer;
        copy.pending = this.pending.map((spec) => ({ ...spec }));
        copy.panelGenCount = this.panelGenCount;
        return copy;
    }
    /** How many rows the authored board is; the stack builds exactly that many. */
    getStartingBoardHeight() {
        return Math.ceil(this.puzzleString.length / 6);
    }
    /**
     * The next row to commit at the bottom of the board.
     *
     * TOP ROW FIRST, which reads backwards until you follow what newRow does:
     * every committed row is pushed up by the one after it, so the row handed
     * over first ends up highest. Hand them out bottom-first and the authored
     * board is built upside down - a mirror that every other test would still
     * pass, because it is a perfectly valid board.
     *
     * The board is built once, in full, the first time a row is asked for -
     * multi-row garbage cannot be resolved any other way - and then handed out
     * six panels at a time.
     */
    nextRowPanels(stack) {
        const puzzleStack = stack;
        if (this.panelGenCount === 0) {
            this.panelGenCount = 1;
            this.pending = buildPanels(this.puzzleString, puzzleStack);
        }
        if (this.pending.length < stack.width) {
            this.pending.push(...buildPanels(this.takeBufferRow(stack.width), puzzleStack));
        }
        return this.pending.splice(0, stack.width);
    }
    /**
     * Never called: nextRowPanels answers instead, and a source is asked for one
     * or the other. Present because the interface is shared with the generators.
     */
    nextRowColors(stack, metalPanelsQueued) {
        const specs = this.nextRowPanels(stack);
        return { colors: specs.map((spec) => spec.color), metalPanelsQueued };
    }
    getGarbagePanelRowString(stack) {
        if (this.garbagePanelBuffer.length < stack.width) {
            // An empty buffer means cleared garbage becomes colourless panels, which
            // is the documented default and not an error.
            this.garbagePanelBuffer += '9'.repeat(stack.width - this.garbagePanelBuffer.length);
        }
        const row = this.garbagePanelBuffer.slice(0, stack.width);
        this.garbagePanelBuffer = this.garbagePanelBuffer.slice(stack.width);
        return row;
    }
    /** One row of the raise buffer, padded with colourless panels when it runs dry. */
    takeBufferRow(width) {
        if (this.panelBuffer.length > width) {
            const row = this.panelBuffer.slice(0, width);
            this.panelBuffer = this.panelBuffer.slice(width);
            return row;
        }
        const row = this.panelBuffer + '9'.repeat(Math.max(0, width - this.panelBuffer.length));
        this.panelBuffer = '';
        return row;
    }
}
exports.PuzzleSource = PuzzleSource;
/**
 * Turn an authored string into panels, TOP row first.
 *
 * Exported because it is the whole of the notation and deserves to be tested
 * without a stack around it.
 */
function buildPanels(puzzleString, stack) {
    const width = stack.width;
    const stripped = puzzleString.replace(/\s/g, '');
    const rows = [];
    let garbageStartRow = null;
    let garbageStartColumn = 0;
    let isMetal = false;
    let connected = [];
    let garbageId = 0;
    const rowCount = Math.ceil(stripped.length / width);
    let remaining = stripped;
    for (let row = 1; row <= rowCount; row++) {
        // Bottom-up: the LAST six characters are the bottom row.
        const rowString = remaining.slice(-width);
        remaining = remaining.slice(0, -width);
        const rowSpecs = [];
        rows.push(rowSpecs);
        // Right to left, so a block's opening marker is met before its contents.
        for (let column = width; column >= 1; column--) {
            const char = rowString.charAt(column - 1);
            const spec = { color: 0 };
            rowSpecs[column - 1] = spec;
            const numeric = /^[0-9]$/.test(char) ? Number(char) : null;
            if (garbageStartRow === null && numeric !== null) {
                spec.color = numeric;
                continue;
            }
            if (OPENS.has(char)) {
                garbageStartRow = row;
                garbageStartColumn = column;
                connected = [];
                garbageId = stack.nextGarbageId();
                isMetal = char === '}';
            }
            if (garbageStartRow === null) {
                throw new Error(`puzzle string has a stray '${char}' outside a garbage block`);
            }
            spec.isGarbage = true;
            spec.color = 9;
            spec.garbageId = garbageId;
            spec.metal = isMetal;
            spec.yOffset = row - garbageStartRow;
            // The horizontal offset is not knowable until the block closes, so the
            // column index is parked here and turned into an offset below.
            spec.xOffset = column;
            connected.push(spec);
            if (CLOSES.has(char)) {
                const height = (connected[connected.length - 1].yOffset ?? 0) + 1;
                const blockWidth = garbageStartColumn - column + 1;
                const shakeTime = (0, consts_1.shakeFramesForGarbageSize)(blockWidth, height);
                for (const member of connected) {
                    member.xOffset = (member.xOffset ?? 0) - column;
                    member.width = blockWidth;
                    member.height = height;
                    // Only garbage that ends up off screen grants shake time when it lands.
                    if (row > stack.height)
                        member.shakeTime = shakeTime;
                }
                garbageStartRow = null;
                garbageStartColumn = 0;
                connected = [];
                isMetal = false;
            }
        }
    }
    if (garbageStartRow !== null) {
        throw new Error('puzzle string has a garbage block that is never closed');
    }
    // rows[0] is the BOTTOM row, because the string was walked bottom-up. Rows
    // are handed out top first, so unroll in reverse.
    const out = [];
    for (let i = rows.length - 1; i >= 0; i--)
        out.push(...rows[i]);
    return out;
}
//# sourceMappingURL=puzzle-source.js.map