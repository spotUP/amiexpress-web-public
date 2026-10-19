"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pictureRows = pictureRows;
exports.fullscreenRows = fullscreenRows;
exports.mediaCredit = mediaCredit;
exports.creditLine = creditLine;
exports.frameRows = frameRows;
/**
 * A story's pictures as rows the reader sets in a column (plan
 * 2026-10-19-mag-linked-media-ascii, M9). The converted rows live in the
 * story's sidecar (written by the backend); this turns the one stored at the
 * caller's column width into painted rows, reusing the art row readers so an
 * ANSI picture and a .seq picture reach the screen exactly as board art does.
 */
const magazine_1 = require("@amiexpress/bbs-door-sdk/formats/magazine");
const art_1 = require("./art");
const ascii_1 = require("@amiexpress/bbs-door-sdk/media/ascii");
/** The rendering for `colWidth`: the exact width, else the widest narrower one. Null when none. */
function pictureRows(sidecar, mediaIndex, petscii, colWidth) {
    const picture = sidecar?.pictures.find((p) => p.media === mediaIndex);
    if (!picture)
        return null;
    const terminal = petscii ? 'petscii' : 'ansi';
    let best = null;
    for (const [key, rendering] of Object.entries(picture.renderings)) {
        if (key === (0, magazine_1.renderingKey)(terminal, rendering.cols, 'column') && rendering.cols <= colWidth && rendering.rows.length > 0) {
            if (!best || rendering.cols > best.cols)
                best = rendering;
        }
    }
    if (!best)
        return null;
    return paintRows(best.rows, best.cols, petscii, Math.floor((colWidth - best.cols) / 2));
}
/** Stored rows as painted rows of `cols` cells, each led by `pad` blanks. */
function paintRows(rows, cols, petscii, pad) {
    const lead = ' '.repeat(Math.max(0, pad));
    return rows.map((row) => {
        const raw = petscii
            ? (0, art_1.seqRows)(Buffer.from(row, 'base64'), 1, cols)[0] ?? ''
            : (0, art_1.ansiRows)(Buffer.from(row, 'latin1'), 1, cols, 'latin1')[0] ?? '';
        return { raw: lead + raw, text: lead + (0, art_1.artRowText)(raw).padEnd(cols) };
    });
}
/**
 * The fullscreen rendering the viewer shows (D11): 80x24 ANSI or 40x24 PETSCII,
 * always at the stored size (the viewer centres it). Null when the sidecar has none.
 */
function fullscreenRows(sidecar, mediaIndex, petscii) {
    const picture = sidecar?.pictures.find((p) => p.media === mediaIndex);
    const terminal = petscii ? 'petscii' : 'ansi';
    const cols = magazine_1.FULLSCREEN_COLS[terminal];
    const rendering = picture?.renderings[(0, magazine_1.renderingKey)(terminal, cols, 'full')];
    if (!rendering || rendering.rows.length === 0)
        return null;
    return { cols, rows: paintRows(rendering.rows, cols, petscii, 0) };
}
/** What the item is and where it comes from (D7): `IMG site` or `VIDEO site`. */
function mediaCredit(media) {
    return `${media.kind !== 'image' ? 'VIDEO' : 'IMG'}${media.site ? ' ' + media.site : ''}`;
}
/** `>> IMG site  [V] view` / `>> VIDEO site  [V] play`, in the source trailer's style (D11). */
function creditLine(media) {
    return `>> ${mediaCredit(media)}  [V] ${media.kind !== 'image' ? 'play' : 'view'}`;
}
/**
 * One decoded video frame as painted rows, the way the stored fullscreen
 * rendering is painted (same emitters the ingest uses, same row readers), so a
 * frame and the poster it rests on look alike. `pad` blanks lead each row.
 */
function frameRows(cells, petscii, pad) {
    const cols = cells[0]?.length ?? 0;
    const stored = petscii
        ? (0, ascii_1.cellsToPetsciiRows)(cells).map((r) => Buffer.from(r).toString('base64'))
        : (0, ascii_1.cellsToAnsiRows)(cells);
    return paintRows(stored, cols, petscii, pad);
}
//# sourceMappingURL=pictures.js.map