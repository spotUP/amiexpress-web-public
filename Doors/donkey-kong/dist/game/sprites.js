/**
 * The characters and colours Donkey Kong is drawn with.
 *
 * The board was a plain character buffer, and colour was worked out
 * AFTERWARDS by matching the glyph that had been written into it. That is
 * not merely indirect - it was wrong, because two different things are drawn
 * with the same character:
 *
 *   playerClimb: 'H'   and   ladder: 'H'
 *
 * The matcher tested the ladder first, so a climbing Mario was painted in
 * the ladder's colour and disappeared into it for the whole climb - which is
 * most of the game.
 *
 * Cells carry their own colour now, written by the code that knows what it
 * is drawing. Deliberately ASCII: this goes down a BBS line where high-bit
 * glyphs depend on the client's font.
 */
export const EMPTY = { ch: ' ', fg: 'white' };
export const COLORS = {
    girder: 'lightred',
    conveyor: 'yellow',
    ladder: 'lightcyan',
    ladderBroken: 'cyan',
    player: 'lightblue',
    playerHammer: 'lightyellow',
    barrel: 'yellow',
    blueBarrel: 'lightblue',
    fireball: 'lightred',
    dk: 'lightred',
    pauline: 'lightmagenta',
    rivet: 'lightwhite',
    hammer: 'lightyellow',
    elevator: 'lightgreen',
    spring: 'lightgreen',
};
export const cell = (ch, fg, bg) => ({ ch, fg, bg });
/**
 * Paint one cell.
 *
 * Blank space is emitted untagged: the board is mostly empty and tagging
 * every space multiplies the bytes on the wire for no visible difference.
 */
export function paint(c) {
    if (c.ch === ' ' && !c.bg)
        return ' ';
    const bg = c.bg ? `{${c.bg}-bg}` : '';
    return `${bg}{${c.fg}-fg}${c.ch}{/}`;
}
