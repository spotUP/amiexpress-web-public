"use strict";
/**
 * A video frame as CELLS, before it is anything else.
 *
 * The encoders used to go straight from pixels to blessed markup, so the
 * thing that travelled over the wire was text like
 * `{lightgreen-fg}{gray-bg}▀▀▀{/}` - twenty-four bytes every time the
 * colour changed, for a picture whose entire vocabulary is sixteen colours.
 * A 146x46 tile came to 21 KB a frame, and since the client paces itself
 * against a byte budget, that was two frames a second.
 *
 * A cell needs one byte. Half-block is two palette indices, four bits each;
 * coloured ASCII is a ramp index and a palette index; braille is eight dots.
 * Markup is a rendering detail, and belongs where the rendering happens -
 * in the door, next to the terminal - not on the wire.
 *
 * Pure: pixels in, bytes out, and bytes back to markup. Testable without a
 * camera or a terminal.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pixelsPerChar = exports.ASCII_RAMP = exports.MODE_BRAILLE = exports.MODE_ASCII_COLOR = exports.MODE_ASCII = exports.MODE_HALFBLOCK = void 0;
exports.modeCode = modeCode;
exports.halfblockCells = halfblockCells;
exports.asciiCells = asciiCells;
exports.brailleCells = brailleCells;
exports.cellsToTags = cellsToTags;
exports.fitCellsToTile = fitCellsToTile;
exports.richCells = richCells;
exports.richToTags = richToTags;
exports.fitRichToTile = fitRichToTile;
exports.shrinkRich = shrinkRich;
const video_encoders_1 = require("./video-encoders");
Object.defineProperty(exports, "pixelsPerChar", { enumerable: true, get: function () { return video_encoders_1.pixelsPerChar; } });
const video_hysteresis_1 = require("./video-hysteresis");
exports.MODE_HALFBLOCK = 0;
exports.MODE_ASCII = 1;
exports.MODE_ASCII_COLOR = 2;
exports.MODE_BRAILLE = 3;
/** The ramp the ASCII modes quantise brightness to. Ten steps fit four bits. */
exports.ASCII_RAMP = ' .:-=+*#%@';
/** Map a render mode name to its wire code. */
function modeCode(mode, colored) {
    switch (mode) {
        case 'braille': return exports.MODE_BRAILLE;
        case 'halfblock': return exports.MODE_HALFBLOCK;
        case 'color': return exports.MODE_ASCII_COLOR;
        default: return colored ? exports.MODE_ASCII_COLOR : exports.MODE_ASCII;
    }
}
/**
 * Half-block cells: the top pixel in the high nibble, the bottom in the low.
 *
 * One character covers two vertically stacked pixels, which is why the
 * source buffer is twice as tall as the cell grid.
 */
function halfblockCells(img, w, h, memory) {
    const out = new Uint8Array(w * h);
    const mem = memory ? (0, video_hysteresis_1.fitColorMemory)(memory, w, h) : undefined;
    let lastFg = -1;
    let lastBg = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const cell = y * w + x;
            const topI = ((y * 2) * w + x) * 4;
            const botI = ((y * 2 + 1) * w + x) * 4;
            const fg = (0, video_hysteresis_1.pickColor)(video_encoders_1.PALETTE, img.data[topI], img.data[topI + 1], img.data[topI + 2], mem ? [mem.fg[cell], lastFg] : [], mem?.stickiness);
            const bg = (0, video_hysteresis_1.pickColor)(video_encoders_1.PALETTE, img.data[botI], img.data[botI + 1], img.data[botI + 2], mem ? [mem.bg[cell], lastBg] : [], mem?.stickiness);
            if (mem) {
                mem.fg[cell] = fg;
                mem.bg[cell] = bg;
            }
            lastFg = fg;
            lastBg = bg;
            out[cell] = (fg << 4) | bg;
        }
        lastFg = -1;
        lastBg = -1;
    }
    return out;
}
/** ASCII cells: ramp index in the high nibble, colour in the low. */
function asciiCells(img, w, h, colored, memory) {
    const out = new Uint8Array(w * h);
    const mem = colored && memory ? (0, video_hysteresis_1.fitColorMemory)(memory, w, h) : undefined;
    let lastFg = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const cell = y * w + x;
            const i = cell * 4;
            const r = img.data[i];
            const g = img.data[i + 1];
            const b = img.data[i + 2];
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            const ramp = Math.min(exports.ASCII_RAMP.length - 1, Math.max(0, Math.floor(lum * (exports.ASCII_RAMP.length - 1))));
            let fg = 0;
            if (colored) {
                fg = (0, video_hysteresis_1.pickColor)(video_encoders_1.PALETTE, r, g, b, mem ? [mem.fg[cell], lastFg] : [], mem?.stickiness);
                if (mem)
                    mem.fg[cell] = fg;
                lastFg = fg;
            }
            out[cell] = (ramp << 4) | fg;
        }
        lastFg = -1;
    }
    return out;
}
/** Braille cells: the eight dots of one character, as bits. */
function brailleCells(img, w, h) {
    const out = new Uint8Array(w * h);
    const sw = w * 2;
    // Dot bit for each (x, y) inside the 2x4 block, in Unicode braille order.
    const DOTS = [
        [0x01, 0x08],
        [0x02, 0x10],
        [0x04, 0x20],
        [0x40, 0x80],
    ];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let bits = 0;
            for (let dy = 0; dy < 4; dy++) {
                for (let dx = 0; dx < 2; dx++) {
                    const i = ((y * 4 + dy) * sw + (x * 2 + dx)) * 4;
                    const lum = (0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]) / 255;
                    if (lum > 0.5)
                        bits |= DOTS[dy][dx];
                }
            }
            out[y * w + x] = bits;
        }
    }
    return out;
}
/**
 * Cells back to blessed markup, for the terminal that finally draws them.
 *
 * Colour tags are emitted only where the colour changes, so a run of one
 * colour costs one tag however long it is - the same run-length trick the
 * old encoders used, now applied at the point of rendering instead of on
 * the wire.
 */
function cellsToTags(cells, w, h, mode) {
    const rows = [];
    for (let y = 0; y < h; y++) {
        let row = '';
        let lastFg = -1;
        let lastBg = -1;
        for (let x = 0; x < w; x++) {
            const value = cells[y * w + x] ?? 0;
            if (mode === exports.MODE_BRAILLE) {
                row += String.fromCharCode(0x2800 + value);
                continue;
            }
            if (mode === exports.MODE_ASCII) {
                row += exports.ASCII_RAMP[(value >> 4) & 0x0f] ?? ' ';
                continue;
            }
            const fg = mode === exports.MODE_HALFBLOCK ? (value >> 4) & 0x0f : value & 0x0f;
            const bg = mode === exports.MODE_HALFBLOCK ? value & 0x0f : -1;
            if (fg !== lastFg || bg !== lastBg) {
                if (lastFg >= 0 || lastBg >= 0)
                    row += '{/}';
                row += `{${video_encoders_1.PALETTE[fg][0]}-fg}`;
                if (bg >= 0)
                    row += `{${video_encoders_1.PALETTE[bg][0]}-bg}`;
                lastFg = fg;
                lastBg = bg;
            }
            row += mode === exports.MODE_HALFBLOCK ? '▀' : (exports.ASCII_RAMP[(value >> 4) & 0x0f] ?? ' ');
        }
        if (lastFg >= 0 || lastBg >= 0)
            row += '{/}';
        rows.push(row);
    }
    return rows.join('\n');
}
/**
 * Scale a cell picture to fill a tile, keeping its shape, centred.
 *
 * One encode is broadcast to every viewer, and their tiles are all
 * different sizes, so the sender picks a size from its byte budget rather
 * than from anybody's furniture. That left the picture sitting small in the
 * top-left corner of a larger tile.
 *
 * Cells scale where markup could not. "ASCII cannot be rescaled" was true
 * of tagged text - half of `{lightgreen-fg}` is nothing - but a cell is a
 * number, and nearest-neighbour sampling of numbers is exact and cheap.
 * The picture is enlarged by whole-pixel sampling, keeps its aspect ratio,
 * and is centred in whatever is left.
 *
 * A picture LARGER than the tile is scaled down the same way, which beats
 * clipping somebody's head off.
 */
function fitCellsToTile(cells, srcWidth, srcHeight, dstWidth, dstHeight) {
    if (dstWidth <= 0 || dstHeight <= 0)
        return new Uint8Array(0);
    if (srcWidth <= 0 || srcHeight <= 0)
        return new Uint8Array(dstWidth * dstHeight);
    if (srcWidth === dstWidth && srcHeight === dstHeight)
        return cells;
    // The largest scale that still fits, on whichever axis runs out first.
    const scale = Math.min(dstWidth / srcWidth, dstHeight / srcHeight);
    const drawWidth = Math.max(1, Math.min(dstWidth, Math.floor(srcWidth * scale)));
    const drawHeight = Math.max(1, Math.min(dstHeight, Math.floor(srcHeight * scale)));
    // Centre what is left over, so the picture sits in the middle of the
    // tile rather than in a corner.
    const offsetX = Math.floor((dstWidth - drawWidth) / 2);
    const offsetY = Math.floor((dstHeight - drawHeight) / 2);
    const out = new Uint8Array(dstWidth * dstHeight);
    for (let y = 0; y < drawHeight; y++) {
        const srcY = Math.min(srcHeight - 1, Math.floor((y * srcHeight) / drawHeight));
        const srcRow = srcY * srcWidth;
        const dstRow = (y + offsetY) * dstWidth + offsetX;
        for (let x = 0; x < drawWidth; x++) {
            const srcX = Math.min(srcWidth - 1, Math.floor((x * srcWidth) / drawWidth));
            out[dstRow + x] = cells[srcRow + srcX];
        }
    }
    return out;
}
/** Dot bit for each position in the 2x4 block, in Unicode braille order. */
const BRAILLE_DOTS = [
    [0x01, 0x08],
    [0x02, 0x10],
    [0x04, 0x20],
    [0x40, 0x80],
];
/** Lit dots per byte value, for turning a dot pattern into a ramp step. */
const POPCOUNT = (() => {
    const table = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        let bits = 0;
        for (let b = 0; b < 8; b++)
            if (i & (1 << b))
                bits++;
        table[i] = bits;
    }
    return table;
})();
/**
 * Build both planes from one pass over the pixels.
 *
 * The source must be at braille resolution - two pixels across and four
 * down per cell - since that is the finest any mode needs. The colour
 * plane samples the top and bottom halves of the same block.
 */
function richCells(img, w, h, memory) {
    const dots = new Uint8Array(w * h);
    const colors = new Uint8Array(w * h);
    const mem = memory ? (0, video_hysteresis_1.fitColorMemory)(memory, w, h) : undefined;
    const sourceWidth = w * 2;
    let lastFg = -1;
    let lastBg = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const cell = y * w + x;
            let bits = 0;
            let topR = 0, topG = 0, topB = 0;
            let botR = 0, botG = 0, botB = 0;
            for (let dy = 0; dy < 4; dy++) {
                for (let dx = 0; dx < 2; dx++) {
                    const i = ((y * 4 + dy) * sourceWidth + (x * 2 + dx)) * 4;
                    const r = img.data[i];
                    const g = img.data[i + 1];
                    const b = img.data[i + 2];
                    if ((0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5) {
                        bits |= BRAILLE_DOTS[dy][dx];
                    }
                    // Rows 0-1 are the cell's top half, rows 2-3 its bottom half.
                    if (dy < 2) {
                        topR += r;
                        topG += g;
                        topB += b;
                    }
                    else {
                        botR += r;
                        botG += g;
                        botB += b;
                    }
                }
            }
            // Dither between the two nearest palette entries, by position, so
            // the sixteen colours weave into far more apparent ones.
            //
            // Only the TEMPORAL incumbent is passed, not the colour of the
            // current run. Preferring the run's colour lengthened runs for
            // compression, but it also flattens exactly the cell-to-cell
            // variation a dither pattern is made of - the two cancel out. Bytes
            // are cheap now (about a fifth of a byte per cell after delta
            // encoding); a picture that uses its palette is worth more.
            const fg = (0, video_hysteresis_1.pickColorDithered)(video_encoders_1.PALETTE, topR / 4, topG / 4, topB / 4, x, y * 2, mem ? [mem.fg[cell]] : [], mem?.stickiness);
            const bg = (0, video_hysteresis_1.pickColorDithered)(video_encoders_1.PALETTE, botR / 4, botG / 4, botB / 4, x, y * 2 + 1, mem ? [mem.bg[cell]] : [], mem?.stickiness);
            if (mem) {
                mem.fg[cell] = fg;
                mem.bg[cell] = bg;
            }
            lastFg = fg;
            lastBg = bg;
            dots[cell] = bits;
            colors[cell] = (fg << 4) | bg;
        }
        lastFg = -1;
        lastBg = -1;
    }
    return { dots, colors };
}
/**
 * Draw a rich frame in whichever mode the VIEWER has chosen.
 *
 * Every mode is derived from the same two planes, so changing mode redraws
 * the picture already in hand - no round trip, and no effect on anybody
 * else's view.
 */
function richToTags(frame, w, h, mode) {
    const rows = [];
    for (let y = 0; y < h; y++) {
        let row = '';
        let lastFg = -1;
        let lastBg = -1;
        for (let x = 0; x < w; x++) {
            const cell = y * w + x;
            const dots = frame.dots[cell] ?? 0;
            const color = frame.colors[cell] ?? 0;
            const fg = (color >> 4) & 0x0f;
            const bg = color & 0x0f;
            if (mode === exports.MODE_BRAILLE) {
                row += String.fromCharCode(0x2800 + dots);
                continue;
            }
            if (mode === exports.MODE_HALFBLOCK) {
                if (fg !== lastFg || bg !== lastBg) {
                    if (lastFg >= 0 || lastBg >= 0)
                        row += '{/}';
                    row += `{${video_encoders_1.PALETTE[fg][0]}-fg}{${video_encoders_1.PALETTE[bg][0]}-bg}`;
                    lastFg = fg;
                    lastBg = bg;
                }
                row += '▀';
                continue;
            }
            // ASCII: brightness is how many of the eight dots are lit.
            const step = Math.min(exports.ASCII_RAMP.length - 1, Math.round((POPCOUNT[dots] / 8) * (exports.ASCII_RAMP.length - 1)));
            if (mode === exports.MODE_ASCII_COLOR && fg !== lastFg) {
                if (lastFg >= 0)
                    row += '{/}';
                row += `{${video_encoders_1.PALETTE[fg][0]}-fg}`;
                lastFg = fg;
                lastBg = -1;
            }
            row += exports.ASCII_RAMP[step] ?? ' ';
        }
        if (lastFg >= 0 || lastBg >= 0)
            row += '{/}';
        rows.push(row);
    }
    return rows.join('\n');
}
/** Scale both planes of a rich frame to a tile, keeping shape and centring. */
function fitRichToTile(frame, srcWidth, srcHeight, dstWidth, dstHeight) {
    if (dstWidth <= 0 || dstHeight <= 0) {
        return { dots: new Uint8Array(0), colors: new Uint8Array(0) };
    }
    if (srcWidth <= 0 || srcHeight <= 0) {
        return { dots: new Uint8Array(dstWidth * dstHeight), colors: new Uint8Array(dstWidth * dstHeight) };
    }
    // Fit inside the tile, keeping the picture's shape.
    const scale = Math.min(dstWidth / srcWidth, dstHeight / srcHeight);
    const drawWidth = Math.max(1, Math.min(dstWidth, Math.floor(srcWidth * scale)));
    const drawHeight = Math.max(1, Math.min(dstHeight, Math.floor(srcHeight * scale)));
    // SHRINKING averages; enlarging repeats. Point-sampling a dithered
    // picture down aliases the dither pattern into noise - the difference
    // between a coarse picture and a distorted one.
    const resized = (drawWidth < srcWidth || drawHeight < srcHeight)
        ? shrinkRich(frame, srcWidth, srcHeight, drawWidth, drawHeight)
        : {
            dots: fitCellsToTile(frame.dots, srcWidth, srcHeight, drawWidth, drawHeight),
            colors: fitCellsToTile(frame.colors, srcWidth, srcHeight, drawWidth, drawHeight),
        };
    // Then centre it in the tile.
    return {
        dots: fitCellsToTile(resized.dots, drawWidth, drawHeight, dstWidth, dstHeight),
        colors: fitCellsToTile(resized.colors, drawWidth, drawHeight, dstWidth, dstHeight),
    };
}
/** Lit dots per byte, for treating a dot pattern as a brightness. */
const DOT_COUNT = (() => {
    const table = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
        let bits = 0;
        for (let b = 0; b < 8; b++)
            if (i & (1 << b))
                bits++;
        table[i] = bits;
    }
    return table;
})();
/**
 * Shrink a rich frame by averaging, rather than by picking one cell in each
 * group and throwing the rest away.
 *
 * Nearest-neighbour sampling is fine when enlarging - a cell simply repeats
 * - but destructive when shrinking a DITHERED picture. The dither is a 4x4
 * pattern, so point-sampling it lands on whichever phase of that pattern
 * happens to line up and aliases into noise: an 80x25 BBS terminal showing
 * a frame encoded for a 146x46 window came out distorted rather than
 * merely coarse (2026-08-26).
 *
 * Averaging is what the dither asked for in the first place - it exists to
 * be blended by eye - so the dots are averaged as brightness and the
 * colours resolved by majority. The result is a smaller picture that still
 * looks like the scene.
 */
function shrinkRich(frame, srcWidth, srcHeight, dstWidth, dstHeight) {
    const dots = new Uint8Array(dstWidth * dstHeight);
    const colors = new Uint8Array(dstWidth * dstHeight);
    for (let y = 0; y < dstHeight; y++) {
        const y0 = Math.floor((y * srcHeight) / dstHeight);
        const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * srcHeight) / dstHeight));
        for (let x = 0; x < dstWidth; x++) {
            const x0 = Math.floor((x * srcWidth) / dstWidth);
            const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * srcWidth) / dstWidth));
            let litTotal = 0;
            let samples = 0;
            // Sixteen palette entries, counted for the majority vote.
            const fgVotes = new Uint16Array(16);
            const bgVotes = new Uint16Array(16);
            for (let sy = y0; sy < y1 && sy < srcHeight; sy++) {
                for (let sx = x0; sx < x1 && sx < srcWidth; sx++) {
                    const cell = sy * srcWidth + sx;
                    litTotal += DOT_COUNT[frame.dots[cell]];
                    fgVotes[(frame.colors[cell] >> 4) & 0x0f]++;
                    bgVotes[frame.colors[cell] & 0x0f]++;
                    samples++;
                }
            }
            if (samples === 0)
                continue;
            // Brightness back to a dot pattern: fill from the top of the cell, so
            // a half-bright group reads as a half-filled character.
            const lit = Math.round(litTotal / samples);
            let bits = 0;
            const ORDER = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80];
            for (let i = 0; i < lit && i < 8; i++)
                bits |= ORDER[i];
            let fg = 0;
            let bg = 0;
            for (let i = 1; i < 16; i++) {
                if (fgVotes[i] > fgVotes[fg])
                    fg = i;
                if (bgVotes[i] > bgVotes[bg])
                    bg = i;
            }
            const out = y * dstWidth + x;
            dots[out] = bits;
            colors[out] = (fg << 4) | bg;
        }
    }
    return { dots, colors };
}
