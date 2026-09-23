"use strict";
/**
 * Where a PETSCII screen goes when the caller saves it.
 *
 * Two targets, the pair the ANSI editor door has carried since it was
 * written (`Doors/ansi-editor/index.ts`):
 *
 *   - EVERY CALLER gets his own drawings, in the door's per-user storage.
 *     They are his; nothing else on the board reads them.
 *   - A SYSOP additionally gets the board's own screen directories, which is
 *     what the web studio writes to. That path is the board's art, so the
 *     board's two rules are enforced on it - bank 1 only, black background
 *     only (`sdk/petscii/board-rules.ts`).
 *
 * A `.seq` is BYTES, not text. Storage holds JSON, so the bytes travel as
 * base64 and are decoded here - never read or written as a string, which is
 * how a high-bit byte becomes U+FFFD.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BBS_SCREEN_DIRS = exports.SYSOP_ACCESS_LEVEL = exports.FILE_PREFIX = void 0;
exports.isSysop = isSysop;
exports.listOwnScreens = listOwnScreens;
exports.loadOwnScreen = loadOwnScreen;
exports.saveOwnScreen = saveOwnScreen;
exports.deleteOwnScreen = deleteOwnScreen;
exports.listBoardScreens = listBoardScreens;
exports.loadBoardScreen = loadBoardScreen;
exports.saveBoardScreen = saveBoardScreen;
exports.withSeqExtension = withSeqExtension;
const petscii_1 = require("@amiexpress/bbs-door-sdk/petscii");
/** The key prefix a caller's own screens live under. */
exports.FILE_PREFIX = 'seq:';
/** Access level the board calls a sysop. */
exports.SYSOP_ACCESS_LEVEL = 255;
/**
 * The board directories a sysop may draw into.
 *
 * The same list the ANSI editor offers, because they are the same screens -
 * one of them in `.ans` and one in `.seq`, chosen by what the caller's
 * terminal is.
 */
exports.BBS_SCREEN_DIRS = [
    'Screens',
    'Bulletins',
    'Conf01/Screens',
    'Conf01/Bulletins',
    'Conf02/Screens',
    'Conf03/Screens',
];
function isSysop(ctx) {
    return (ctx.user?.accessLevel ?? 0) >= exports.SYSOP_ACCESS_LEVEL;
}
/** Every screen this caller has saved, newest name order, without the prefix. */
async function listOwnScreens(ctx) {
    const keys = await ctx.storage.keys();
    return keys
        .filter((key) => key.startsWith(exports.FILE_PREFIX))
        .map((key) => key.slice(exports.FILE_PREFIX.length))
        .sort((a, b) => a.localeCompare(b));
}
async function loadOwnScreen(ctx, name) {
    const stored = (await ctx.storage.load(exports.FILE_PREFIX + name));
    if (!stored?.content)
        return null;
    return Uint8Array.from(Buffer.from(stored.content, 'base64'));
}
async function saveOwnScreen(ctx, name, bytes) {
    const stored = {
        content: Buffer.from(bytes).toString('base64'),
        modified: new Date().toISOString(),
    };
    await ctx.storage.save(exports.FILE_PREFIX + name, stored);
}
async function deleteOwnScreen(ctx, name) {
    await ctx.storage.delete(exports.FILE_PREFIX + name);
}
/** The `.seq` files in one of the board's screen directories. */
async function listBoardScreens(ctx, directory) {
    const bbs = ctx.bbs;
    const lower = (await bbs.listFiles?.(directory, '*.seq')) ?? [];
    const upper = (await bbs.listFiles?.(directory, '*.SEQ')) ?? [];
    return Array.from(new Set([...lower, ...upper])).sort((a, b) => a.localeCompare(b));
}
async function loadBoardScreen(ctx, path) {
    const raw = await ctx.bbs.readFile?.(path, 'binary');
    if (raw === null || raw === undefined)
        return null;
    if (raw instanceof Uint8Array)
        return raw;
    // A board that hands back latin1 text still hands back the bytes; the
    // encoding is the lossless one for this exact reason.
    return Uint8Array.from(Buffer.from(raw, 'binary'));
}
/**
 * Write a screen into the board's own art, or refuse it.
 *
 * The refusal is the board's rule, not this door's opinion, and it is
 * checked on the BYTES about to be written rather than on the surface that
 * produced them - the file is what the next caller's C64 will read.
 */
async function saveBoardScreen(ctx, path, bytes) {
    const violations = (0, petscii_1.checkBoardRules)(bytes);
    if (violations.length > 0)
        return { saved: false, reason: (0, petscii_1.boardRulesReason)(violations) };
    await ctx.bbs.writeFile?.(path, Buffer.from(bytes).toString('binary'), 'binary');
    return { saved: true };
}
/** `name.seq`, whatever the caller typed. */
function withSeqExtension(name) {
    return /\.seq$/i.test(name) ? name : `${name}.seq`;
}
