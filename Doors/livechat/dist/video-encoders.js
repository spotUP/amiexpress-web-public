"use strict";
/**
 * Browser-side video encoders.
 *
 * Extracted from client.ts so they can be TESTED. They lived inside the
 * browser bundle, where a row that came out one column too wide - the fault
 * behind "every second frame in some render modes is broken" - could only be
 * found by looking at a webcam. The frame is drawn by concatenating one
 * string per cell, so equal width per row is the whole contract, and that is
 * checkable without a camera.
 *
 * Pure: pixels in, blessed-tagged text out. No DOM beyond the shape of the
 * pixel buffer, which is declared here rather than imported so this compiles
 * in a door that has no DOM lib.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pixelsPerChar = pixelsPerChar;
exports.rgbToBlessed = rgbToBlessed;
exports.renderAscii = renderAscii;
exports.renderHalfblock = renderHalfblock;
exports.renderBraille = renderBraille;
exports.pixelAspect = pixelAspect;
exports.fitPreservingAspect = fitPreservingAspect;
/**
 * Source pixels per output char for each render mode.
 *  - ascii / color: 1 char = 1 pixel
 *  - halfblock:     1 char = 1x2 pixels (top half + bottom half)
 *  - braille:       1 char = 2x4 pixels (8 dots)
 */
function pixelsPerChar(mode) {
    switch (mode) {
        case 'braille': return { px: 2, py: 4 };
        case 'halfblock': return { px: 1, py: 2 };
        case 'color':
        case 'ascii':
        default: return { px: 1, py: 1 };
    }
}
const ASCII_RAMP = ' .:-=+*#%@';
/**
 * Map an RGB triplet to the nearest blessed 16-colour palette token.
 * Blessed's tag parser only understands named colours, not 24-bit; every
 * attempt to pass raw `\x1b[38;2;R;G;B m` through a blessed widget ended
 * up mis-aligned because blessed's internal cell buffer can't account
 * for those bytes. Neoshowcase's working webcam demo uses this same
 * approach (rgbToBlessed + {name-fg} tags).
 */
const PALETTE = [
    ['black', 0, 0, 0],
    ['red', 170, 0, 0],
    ['green', 0, 170, 0],
    ['yellow', 170, 85, 0],
    ['blue', 0, 0, 170],
    ['magenta', 170, 0, 170],
    ['cyan', 0, 170, 170],
    ['white', 170, 170, 170],
    ['gray', 85, 85, 85],
    ['lightred', 255, 85, 85],
    ['lightgreen', 85, 255, 85],
    ['lightyellow', 255, 255, 85],
    ['lightblue', 85, 85, 255],
    ['lightmagenta', 255, 85, 255],
    ['lightcyan', 85, 255, 255],
    ['lightwhite', 255, 255, 255],
];
function rgbToBlessed(r, g, b) {
    let best = 'white';
    let bestDist = Infinity;
    for (const [name, pr, pg, pb] of PALETTE) {
        const dr = r - pr, dg = g - pg, db = b - pb;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestDist) {
            bestDist = d;
            best = name;
        }
    }
    return best;
}
function renderAscii(img, w, h, colored) {
    let out = '';
    let lastFg = '';
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const r = img.data[i];
            const g = img.data[i + 1];
            const b = img.data[i + 2];
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            const ch = ASCII_RAMP[Math.floor(lum * (ASCII_RAMP.length - 1))] || ' ';
            if (colored) {
                const fg = rgbToBlessed(r, g, b);
                if (fg !== lastFg) {
                    if (lastFg)
                        out += '{/}';
                    out += `{${fg}-fg}`;
                    lastFg = fg;
                }
            }
            out += ch;
        }
        if (lastFg) {
            out += '{/}';
            lastFg = '';
        }
        out += '\n';
    }
    return out.replace(/\n+$/, '');
}
/**
 * Half-block: U+2580 with fg=top, bg=bottom — each char encodes two
 * vertically-stacked pixels. Uses blessed 16-colour palette tokens via
 * rgbToBlessed() so the output is safe for blessed's cell buffer.
 */
function renderHalfblock(img, w, h) {
    const sw = w;
    let out = '';
    let lastFg = '', lastBg = '';
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const topI = ((y * 2) * sw + x) * 4;
            const botI = ((y * 2 + 1) * sw + x) * 4;
            const fg = rgbToBlessed(img.data[topI], img.data[topI + 1], img.data[topI + 2]);
            const bg = rgbToBlessed(img.data[botI], img.data[botI + 1], img.data[botI + 2]);
            if (fg !== lastFg || bg !== lastBg) {
                if (lastFg || lastBg)
                    out += '{/}';
                out += `{${fg}-fg}{${bg}-bg}`;
                lastFg = fg;
                lastBg = bg;
            }
            out += '▀';
        }
        if (lastFg || lastBg) {
            out += '{/}';
            lastFg = '';
            lastBg = '';
        }
        out += '\n';
    }
    return out.replace(/\n+$/, '');
}
/**
 * Braille: 1 char = 2x4 source pixels mapped to 8 braille dots. Mono only
 * (Unicode braille blocks have no fg/bg style by themselves; renderer
 * picks a threshold). 8x effective resolution.
 *
 * Dot positions in U+2800..U+28FF:
 *   1 4
 *   2 5
 *   3 6
 *   7 8
 */
function renderBraille(img, w, h) {
    const sw = w * 2;
    // (col, row) in the 2x4 cell -> dot bit
    const dotBits = [
        [0x01, 0x08], // row 0
        [0x02, 0x10], // row 1
        [0x04, 0x20], // row 2
        [0x40, 0x80], // row 3
    ];
    let out = '';
    for (let cy = 0; cy < h; cy++) {
        for (let cx = 0; cx < w; cx++) {
            let bits = 0;
            for (let dy = 0; dy < 4; dy++) {
                for (let dx = 0; dx < 2; dx++) {
                    const px = cx * 2 + dx;
                    const py = cy * 4 + dy;
                    const i = (py * sw + px) * 4;
                    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
                    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                    if (lum > 0.5)
                        bits |= dotBits[dy][dx];
                }
            }
            out += String.fromCharCode(0x2800 + bits);
        }
        out += '\n';
    }
    return out.replace(/\n+$/, '');
}
/**
 * How wide one canvas pixel appears on screen, relative to its height.
 *
 * A terminal cell is about twice as tall as it is wide, and each render mode
 * packs a different number of canvas pixels into one cell (see
 * pixelsPerChar). In ASCII and colour modes one pixel IS one cell, so it
 * appears half as wide as it is tall; halfblock and braille pack two and four
 * rows into a cell, which comes out square.
 */
function pixelAspect(mode) {
    const { px, py } = pixelsPerChar(mode);
    // cell height is 2x cell width, so: (cellW/px) / (cellH/py) = py / (2*px)
    return py / (2 * px);
}
/**
 * Where to draw the camera inside the capture canvas so it keeps its shape.
 *
 * The camera used to be stretched to fill the canvas, which is fine only
 * while the tile happens to match the camera's proportions - and once the
 * video tile could be any shape, a wide tile gave everyone a wide face
 * ("it does not force aspect, it's wide now").
 *
 * The picture is fitted inside the canvas instead, centred, with the
 * leftover space black. `pixelAspect` is what makes this correct in a
 * TERMINAL rather than on a square-pixel screen.
 */
function fitPreservingAspect(srcW, srcH, canvasW, canvasH, aspect) {
    if (srcW <= 0 || srcH <= 0 || canvasW <= 0 || canvasH <= 0) {
        return { dx: 0, dy: 0, dw: Math.max(0, canvasW), dh: Math.max(0, canvasH) };
    }
    // The width:height the destination needs, in canvas pixels, for the result
    // to LOOK like the source once the terminal stretches each pixel.
    const wanted = (srcW / srcH) / aspect;
    let dw = canvasW;
    let dh = dw / wanted;
    if (dh > canvasH) {
        dh = canvasH;
        dw = dh * wanted;
    }
    // Round the SIZE first, then centre what is actually drawn - centring on
    // the unrounded size leaves the picture a pixel off its own box.
    const width = Math.round(dw);
    const height = Math.round(dh);
    return {
        dx: Math.round((canvasW - width) / 2),
        dy: Math.round((canvasH - height) / 2),
        dw: width,
        dh: height,
    };
}
