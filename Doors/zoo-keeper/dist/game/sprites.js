/**
 * The characters and colours Zoo Keeper is drawn with.
 *
 * The old renderer decided colour AFTER drawing, by inspecting the character
 * that had been written into the buffer - and in places by GUESSING from it
 * with regexes like /[ESCRML]/ and /[EXTRALIFE!x0-9]/, or by searching
 * ANIMAL_STATS for whichever animal happened to use that glyph.
 *
 * That cannot work, and the source says so itself:
 *
 *   zeke: '@',
 *   zekeWithNet: '@',  // Same char, different color
 *
 * Two states drawn with one character, told apart only by a colour the
 * renderer had to reconstruct from the character. Carrying the net - the
 * thing that decides whether you can catch an animal or must run from it -
 * was invisible.
 *
 * Cells carry their own colour now, written by the code that knows what it
 * is drawing. Deliberately ASCII: this goes down a BBS line where high-bit
 * glyphs depend on the client's font.
 */
/**
 * How many characters wide one logical cell is drawn.
 *
 * A terminal character is about twice as tall as it is wide, so a board
 * measured in single characters is not square: one step up covers roughly
 * twice the visual distance of one step sideways. Super Qix solves this by
 * drawing every logical cell CELL_WIDTH characters wide, and this door now
 * does the same - 40 logical columns rendered as 80 characters.
 */
export const CELL_WIDTH = 2;
export const EMPTY = { ch: ' ', fg: 'white', bg: 'black' };
/**
 * A colour per animal.
 *
 * ANIMAL_STATS gives three of the six the same yellow (camel, moose, lion)
 * and two the same gray (elephant, rhino) - so the lion, worth 30,000 and
 * the fastest thing in the zoo, was drawn exactly like a camel worth 1,000.
 * Six animals, six colours.
 *
 * The hues were checked against the sprite sheet of the PICO-8 Zoo Keeper
 * cart on the Lexaloffle BBS (zookeeper-0), decoded and looked at rather than
 * guessed: the elephants are light grey, the snakes bright green, the big
 * cats orange and yellow, the rhinos grey-lavender. Colour choices only - no
 * art or code is taken from it, and none could be: an 8x8 sprite does not
 * fit in a one-character cell. Credit to its author.
 */
export const ANIMAL_COLORS = {
    elephant: 'white', // light grey in the cart
    snake: 'lightgreen', // bright green
    camel: 'yellow',
    rhino: 'lightmagenta', // grey-lavender in the cart; was an invented blue
    moose: 'lightred',
    lion: 'lightyellow', // the orange-yellow cats
};
export const COLORS = {
    // Zeke wears green in the cart's artwork, not the cyan first guessed here.
    zeke: 'lightgreen',
    // With the net raised he goes bright, so the state that decides whether he
    // can catch anything is readable without looking twice.
    zekeWithNet: 'lightyellow',
    zelda: 'lightcyan',
    monkey: 'lightmagenta', // the lavender monkeys
    coconut: 'yellow', // no brown in a 16-colour terminal
    fuse: 'lightred',
    fuseEnd: 'lightyellow',
    // The cage is drawn in blue bars in the cart, not grey.
    wall: 'lightblue',
    wallDamaged: 'lightred',
    cage: 'lightblue',
    bonus: 'lightyellow',
};
/**
 * The bonus items, in the colours of the fruit they are.
 *
 * They were all one yellow. The cart draws a banana, cherries, a melon and a
 * clover, each its own colour, and they are worth different amounts - so
 * telling them apart at a glance is worth something.
 */
export const BONUS_COLORS = {
    banana: 'lightyellow',
    cherry: 'lightred',
    melon: 'lightgreen',
    clover: 'green',
    key: 'lightyellow',
};
/**
 * Every colour a terminal can actually paint.
 *
 * Named because it is easy to write a colour that reads well in source and
 * means nothing on the wire - 'brown' was in here for exactly one commit.
 */
export const TERMINAL_COLORS = new Set([
    'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray',
    'lightblack', 'lightred', 'lightgreen', 'lightyellow',
    'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
]);
export const cell = (ch, fg, bg = 'black') => ({ ch, fg, bg });
/**
 * A solid block of colour with a glyph on it.
 *
 * This is what makes the board read as sprites rather than as text: the
 * CELL is the colour, and the character sits on it. Drawing a bright glyph
 * on the terminal's own background gives thin coloured letters instead.
 */
const block = (ch, colour) => ({ ch, fg: 'black', bg: colour });
/**
 * Zeke, and whether he is holding the net.
 *
 * Same glyph, deliberately - it is the same man - but a colour that says at
 * a glance whether he can catch anything right now.
 */
export function zekeCell(hasNet) {
    return block('@', hasNet ? COLORS.zekeWithNet : COLORS.zeke);
}
/** An animal, in the colour of its own kind. */
export function animalCell(ch, type) {
    return block(ch, ANIMAL_COLORS[type] || 'white');
}
/** A section of cage wall, redder as it takes damage. */
export function wallCell(ch, damaged = false) {
    return block(ch, damaged ? COLORS.wallDamaged : COLORS.wall);
}
export function zeldaCell() {
    return block('Z', COLORS.zelda);
}
export function monkeyCell() {
    return block('m', COLORS.monkey);
}
export function coconutCell() {
    return block('o', COLORS.coconut);
}
/** The burning fuse, and its lit head. */
export function fuseCell(isEnd) {
    return isEnd ? block('*', COLORS.fuseEnd) : block('=', COLORS.fuse);
}
/**
 * A bonus letter or digit floating on the board.
 *
 * `kind` names the fruit when the caller knows it, so a banana and a cherry
 * are not the same yellow.
 */
export function bonusCell(ch, kind) {
    return block(ch, (kind && BONUS_COLORS[kind]) || COLORS.bonus);
}
/**
 * Paint one cell.
 *
 * Blank space is emitted untagged: the board is mostly empty and tagging
 * every space multiplies the bytes going down the line for no difference.
 */
export function paint(c) {
    // The glyph, padded to the full cell, so the whole cell carries the colour
    // and the board is made of square blocks rather than thin letters.
    const body = c.ch.padEnd(CELL_WIDTH).slice(0, CELL_WIDTH);
    if (c.bg === 'black' && c.ch === ' ')
        return ' '.repeat(CELL_WIDTH);
    return `{${c.bg}-bg}{${c.fg}-fg}${body}{/}`;
}
