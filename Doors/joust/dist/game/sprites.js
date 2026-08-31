/**
 * The characters and colours Joust is drawn with.
 *
 * Two things were wrong with the old board.
 *
 * The buzzards were drawn '{' and '}' - which are blessed's own tag
 * delimiters. Every enemy on screen emitted a bare brace into tagged
 * content, where '{' begins a colour tag and '}' ends one. That is not a
 * character the renderer can be relied upon to paint.
 *
 * And colour was decided AFTER the fact, by matching the glyph that had been
 * written into the buffer: the renderer asked "is this character the enemy
 * character?" and, if so, searched the enemy list by position to find out
 * what colour it should have been. The information was thrown away at draw
 * time and reconstructed afterwards. Now the colour is written alongside the
 * glyph, by the code that knows which bird it is drawing.
 *
 * Deliberately ASCII: the board goes down a BBS line where the high-bit
 * glyphs depend on the client's font.
 */
/** The empty sky. */
export const EMPTY = { ch: ' ', fg: 'white' };
/** Glyphs. None of them may be a brace - see the note above. */
export const GLYPHS = {
    playerRight: '>',
    playerLeft: '<',
    playerFlap: '^',
    enemyRight: 'P',
    enemyLeft: 'q',
    egg: 'o',
    eggHatching: '0',
    pterodactyl: 'W',
    platform: '=',
    lava: '~',
    lavaHand: '/',
};
export const COLORS = {
    player: 'lightcyan',
    platform: 'lightgreen',
    platformEdge: 'green',
    lava: 'lightred',
    lavaBg: 'red',
    egg: 'lightwhite',
    eggHatching: 'lightyellow',
    pterodactyl: 'lightmagenta',
    enemyFallback: 'lightred',
};
/** The rider, facing the way it is travelling, or flapping. */
export function playerCell(direction, flapping) {
    const ch = flapping
        ? GLYPHS.playerFlap
        : direction === 'right' ? GLYPHS.playerRight : GLYPHS.playerLeft;
    return { ch, fg: COLORS.player };
}
/** A buzzard, in the colour of its own kind. */
export function enemyCell(direction, colour) {
    return {
        ch: direction === 'right' ? GLYPHS.enemyRight : GLYPHS.enemyLeft,
        fg: colour || COLORS.enemyFallback,
    };
}
/** An egg, brighter once it is hatching so it reads as a warning. */
export function eggCell(hatching) {
    return hatching
        ? { ch: GLYPHS.eggHatching, fg: COLORS.eggHatching }
        : { ch: GLYPHS.egg, fg: COLORS.egg };
}
export function pterodactylCell() {
    return { ch: GLYPHS.pterodactyl, fg: COLORS.pterodactyl };
}
export function platformCell() {
    return { ch: GLYPHS.platform, fg: COLORS.platform };
}
/** Lava, which churns between two glyphs and sits on a hot background. */
export function lavaCell(frame) {
    return {
        ch: frame % 10 < 5 ? GLYPHS.lava : GLYPHS.lavaHand,
        fg: COLORS.lava,
        bg: COLORS.lavaBg,
    };
}
/**
 * Paint one cell.
 *
 * Blank sky is emitted as a plain space rather than a tagged one: a board is
 * mostly empty, and wrapping every space in colour tags multiplies the bytes
 * on the wire by about eight for no visible difference.
 */
export function paint(cell) {
    if (cell.ch === ' ' && !cell.bg)
        return ' ';
    const bg = cell.bg ? `{${cell.bg}-bg}` : '';
    return `${bg}{${cell.fg}-fg}${cell.ch}{/}`;
}
