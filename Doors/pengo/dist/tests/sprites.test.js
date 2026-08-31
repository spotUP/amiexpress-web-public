"use strict";
/**
 * Pengo is drawn with sprites, not letters.
 *
 * It used to draw one ASCII letter per cell - 'P' for the penguin, 'S' for a
 * Sno-Bee, '#' for ice - and pad the row by pushing a space between every
 * character. A letter reads as a letter, and the padding put a space through
 * the middle of anything wider than one column.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.everySpriteIsExactlyOneCellWide = everySpriteIsExactlyOneCellWide;
exports.nothingIsDrawnAsALetter = nothingIsDrawnAsALetter;
exports.everythingLooksDifferentFromEverythingElse = everythingLooksDifferentFromEverythingElse;
exports.theMazePiecesAreDistinguishable = theMazePiecesAreDistinguishable;
exports.aStunnedEnemyLooksDifferent = aStunnedEnemyLooksDifferent;
exports.pengoIsDrawnAgainstItsGround = pengoIsDrawnAgainstItsGround;
exports.everyBoardColourHasAComplement = everyBoardColourHasAComplement;
exports.theRendererDoesNotPadRowsByHand = theRendererDoesNotPadRowsByHand;
const assert_1 = __importDefault(require("assert"));
const fs_1 = require("fs");
const path_1 = require("path");
const sprites_1 = require("../game/sprites");
/** What the terminal actually paints, with the colour tags removed. */
function visible(text) {
    return text.replace(/\{[^}]*\}/g, '');
}
/** Every sprite covers exactly one cell - no more, no less. */
async function everySpriteIsExactlyOneCellWide() {
    const sprites = [
        ['floor', (0, sprites_1.terrainSprite)('empty')],
        ['ice', (0, sprites_1.terrainSprite)('ice')],
        ['wall', (0, sprites_1.terrainSprite)('wall')],
        ['diamond', (0, sprites_1.terrainSprite)('diamond')],
        ['pengo', (0, sprites_1.pengoSprite)()],
        ['enemy', (0, sprites_1.enemySprite)(false)],
        ['stunned enemy', (0, sprites_1.enemySprite)(true)],
        ['egg', (0, sprites_1.eggSprite)()],
    ];
    for (const [name, sprite] of sprites) {
        assert_1.default.strictEqual(sprite.text.length, sprites_1.CELL_WIDTH, `the ${name} sprite is ${sprite.text.length} columns, not ${sprites_1.CELL_WIDTH}`);
        assert_1.default.strictEqual(visible((0, sprites_1.paint)(sprite)).length, sprites_1.CELL_WIDTH, `the painted ${name} sprite must still be ${sprites_1.CELL_WIDTH} columns`);
    }
}
/** Nothing is drawn as a bare letter any more. */
async function nothingIsDrawnAsALetter() {
    const drawn = [
        (0, sprites_1.terrainSprite)('ice'), (0, sprites_1.terrainSprite)('wall'), (0, sprites_1.terrainSprite)('diamond'),
        (0, sprites_1.pengoSprite)(), (0, sprites_1.enemySprite)(false), (0, sprites_1.eggSprite)(),
    ];
    for (const sprite of drawn) {
        assert_1.default.ok(!/[A-Za-z]/.test(sprite.text), `sprites should be shapes, not letters - got ${JSON.stringify(sprite.text)}`);
    }
}
/** No two things on the board look the same. */
async function everythingLooksDifferentFromEverythingElse() {
    const byName = [
        ['ice', (0, sprites_1.terrainSprite)('ice').text],
        ['wall', (0, sprites_1.terrainSprite)('wall').text],
        ['diamond', (0, sprites_1.terrainSprite)('diamond').text],
        ['pengo', (0, sprites_1.pengoSprite)().text],
        ['enemy', (0, sprites_1.enemySprite)(false).text],
        ['egg', (0, sprites_1.eggSprite)().text],
    ];
    for (let i = 0; i < byName.length; i++) {
        for (let j = i + 1; j < byName.length; j++) {
            assert_1.default.notStrictEqual(byName[i][1], byName[j][1], `${byName[i][0]} and ${byName[j][0]} are both drawn as ${JSON.stringify(byName[i][1])}`);
        }
    }
}
/** Ice, wall and diamond are told apart by colour as well as shape. */
async function theMazePiecesAreDistinguishable() {
    const ice = (0, sprites_1.terrainSprite)('ice');
    const wall = (0, sprites_1.terrainSprite)('wall');
    const floor = (0, sprites_1.terrainSprite)('empty');
    assert_1.default.notStrictEqual(ice.bg, wall.bg, 'ice and wall must not share a background');
    assert_1.default.notStrictEqual(ice.bg, floor.bg, 'a pushable block must stand out from open floor');
    assert_1.default.notStrictEqual(ice.text, wall.text, 'and they should not share a glyph either');
}
/** A stunned Sno-Bee is visibly different from a live one. */
async function aStunnedEnemyLooksDifferent() {
    assert_1.default.notStrictEqual((0, sprites_1.enemySprite)(true).fg, (0, sprites_1.enemySprite)(false).fg, 'a stunned Sno-Bee is the moment to act on; it must be obvious');
}
/**
 * Pengo takes the colour of whatever it stands on into account.
 *
 * It can only stand on floor today, but the rule is the one Frogger's frog
 * uses, so a level that later lets it stand on ice cannot make it vanish.
 */
async function pengoIsDrawnAgainstItsGround() {
    const onFloor = (0, sprites_1.pengoSprite)(sprites_1.BG_COLORS.floor);
    const onIce = (0, sprites_1.pengoSprite)(sprites_1.BG_COLORS.ice);
    assert_1.default.strictEqual(onFloor.bg, sprites_1.BG_COLORS.floor);
    assert_1.default.strictEqual(onIce.bg, sprites_1.BG_COLORS.ice, 'the sprite sits on the ground it is on');
    assert_1.default.notStrictEqual(onIce.fg, onIce.bg, 'the penguin must never be the same colour as what it is standing on');
}
/** The complement table covers every colour the board can paint. */
async function everyBoardColourHasAComplement() {
    const used = new Set([...Object.values(sprites_1.BG_COLORS), ...Object.values(sprites_1.SPRITE_FG)]);
    for (const colour of used) {
        assert_1.default.ok(sprites_1.COLOR_COMPLEMENT[colour], `${colour} is painted on the board but has no complement`);
    }
}
/**
 * The renderer no longer pads rows by hand.
 *
 * `line.split('').join(' ')` inserted a space between every character to
 * fake a wider board - which also inserted one into the middle of every
 * two-character sprite.
 */
async function theRendererDoesNotPadRowsByHand() {
    const game = (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '..', 'game', 'pengo-game.ts'), 'utf8');
    assert_1.default.ok(!/split\('''\)\.join\(' '\)/.test(game) && !/split\(''\)\.join\(' '\)/.test(game), 'the space-padding hack should be gone; cells are already CELL_WIDTH wide');
    assert_1.default.ok(/paint\(/.test(game), 'the renderer should paint sprites');
    assert_1.default.ok(!/line \+= '\{cyan-fg\}P\{\/\}'/.test(game), "the penguin should not be drawn as the letter P");
}
//# sourceMappingURL=sprites.test.js.map