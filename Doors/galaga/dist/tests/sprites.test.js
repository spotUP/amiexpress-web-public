"use strict";
/**
 * Galaga's board, and the bug the old renderer caused.
 *
 * Colour was decided AFTER drawing, by matching the glyph in the buffer, and
 * three different things are drawn with '.': a background star, an ENEMY
 * BULLET, and the last frame of an explosion. Every '.' was painted gray, so
 * incoming enemy fire looked exactly like a background star - the one thing
 * on screen that can kill you, disguised as scenery.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.anEnemyBulletDoesNotLookLikeAStar = anEnemyBulletDoesNotLookLikeAStar;
exports.anExplosionIsNotAStarEither = anExplosionIsNotAStarEither;
exports.theTwoBulletsAreDistinguishable = theTwoBulletsAreDistinguishable;
exports.eachAlienKindHasItsOwnColour = eachAlienKindHasItsOwnColour;
exports.aBossWithACapturedFighterIsMarked = aBossWithACapturedFighterIsMarked;
exports.starsHaveDepth = starsHaveDepth;
exports.paintingKeepsCellsOneColumn = paintingKeepsCellsOneColumn;
exports.emptySkyIsNotTagged = emptySkyIsNotTagged;
exports.theRendererPaintsCellsNotGlyphMatches = theRendererPaintsCellsNotGlyphMatches;
exports.theGameIsBlocksAndTheSkyIsNot = theGameIsBlocksAndTheSkyIsNot;
const assert_1 = __importDefault(require("assert"));
const fs_1 = require("fs");
const path_1 = require("path");
const sprites_1 = require("../game/sprites");
function visible(text) {
    return text.replace(/\{[^}]*\}/g, '');
}
/**
 * The regression that matters: an enemy bullet must not look like a star.
 *
 * They still share the glyph - the fix is that colour no longer comes from
 * the glyph.
 */
async function anEnemyBulletDoesNotLookLikeAStar() {
    const bullet = (0, sprites_1.bulletCell)(true);
    const dimStar = (0, sprites_1.starCell)(0);
    assert_1.default.strictEqual(bullet.ch, dimStar.ch, 'they share a glyph - that is the problem');
    assert_1.default.notStrictEqual(bullet.bg, dimStar.fg, 'the thing that kills you must not be painted like scenery');
    assert_1.default.strictEqual(bullet.bg, sprites_1.COLORS.enemyBullet);
}
/** An explosion's last frame is also a dot, and also must not be a star. */
async function anExplosionIsNotAStarEither() {
    const ember = (0, sprites_1.explosionCell)('.');
    assert_1.default.strictEqual(ember.ch, (0, sprites_1.starCell)(0).ch);
    assert_1.default.notStrictEqual(ember.bg, (0, sprites_1.starCell)(0).fg);
}
/** The player's shot and the enemy's are told apart at a glance. */
async function theTwoBulletsAreDistinguishable() {
    const mine = (0, sprites_1.bulletCell)(false);
    const theirs = (0, sprites_1.bulletCell)(true);
    assert_1.default.notStrictEqual(mine.ch, theirs.ch);
    assert_1.default.notStrictEqual(mine.bg, theirs.bg);
}
/** Each kind of alien has its own colour. */
async function eachAlienKindHasItsOwnColour() {
    const bee = (0, sprites_1.alienCell)('w', 'bee', false);
    const butterfly = (0, sprites_1.alienCell)('M', 'butterfly', false);
    const boss = (0, sprites_1.alienCell)('@', 'boss', false);
    const colours = new Set([bee.bg, butterfly.bg, boss.bg]);
    assert_1.default.strictEqual(colours.size, 3, 'three kinds of alien, three colours');
}
/** A boss holding your captured fighter is marked out. */
async function aBossWithACapturedFighterIsMarked() {
    const plain = (0, sprites_1.alienCell)('@', 'boss', false);
    const holding = (0, sprites_1.alienCell)('@', 'boss', true);
    assert_1.default.notStrictEqual(plain.bg, holding.bg, 'the boss worth shooting for your fighter back must be visibly different');
    assert_1.default.strictEqual(holding.bg, sprites_1.COLORS.captured);
}
/** Bright stars read as bright. */
async function starsHaveDepth() {
    assert_1.default.notStrictEqual((0, sprites_1.starCell)(0).fg, (0, sprites_1.starCell)(2).fg, 'a starfield needs depth');
    assert_1.default.notStrictEqual((0, sprites_1.starCell)(0).ch, (0, sprites_1.starCell)(2).ch);
}
/** Cells stay one column when painted. */
async function paintingKeepsCellsOneColumn() {
    const cells = [
        sprites_1.EMPTY, (0, sprites_1.starCell)(0), (0, sprites_1.starCell)(2), (0, sprites_1.bulletCell)(true), (0, sprites_1.bulletCell)(false),
        (0, sprites_1.alienCell)('w', 'bee', false), (0, sprites_1.playerCell)('A'), (0, sprites_1.explosionCell)('*'),
    ];
    for (const c of cells) {
        assert_1.default.strictEqual(c.ch.length, 1, `${JSON.stringify(c.ch)} is not one column`);
        assert_1.default.strictEqual(visible((0, sprites_1.paint)(c)).length, 1);
    }
}
/** Empty sky is untagged. */
async function emptySkyIsNotTagged() {
    assert_1.default.strictEqual((0, sprites_1.paint)(sprites_1.EMPTY), ' ');
}
/** The renderer paints cells rather than matching glyphs. */
async function theRendererPaintsCellsNotGlyphMatches() {
    const game = (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '..', 'game', 'galaga-game.ts'), 'utf8');
    assert_1.default.ok(/line \+= paint\(buffer\[y\]\[x\]\)/.test(game));
    assert_1.default.ok(!/char === '\.'/.test(game), 'colour must not be recovered by comparing the glyph after the fact');
}
/**
 * The things that matter are blocks of colour; the starfield is not.
 *
 * Reported: "i see no bg ansi colors". Every sprite was a bright character on
 * the terminal's own background. The stars stay plain on purpose - they are
 * scenery, and blocking them would bury the game under a wall of colour.
 */
async function theGameIsBlocksAndTheSkyIsNot() {
    for (const c of [(0, sprites_1.playerCell)('A'), (0, sprites_1.alienCell)('w', 'bee', false), (0, sprites_1.bulletCell)(true), (0, sprites_1.explosionCell)('*')]) {
        assert_1.default.ok(c.bg, `${JSON.stringify(c.ch)} should be a block of colour`);
        assert_1.default.ok(/-bg\}/.test((0, sprites_1.paint)(c)), 'the painted cell must carry a background');
    }
    for (const star of [(0, sprites_1.starCell)(0), (0, sprites_1.starCell)(1), (0, sprites_1.starCell)(2)]) {
        assert_1.default.ok(!star.bg, 'the starfield must stay scenery, not a block');
    }
}
//# sourceMappingURL=sprites.test.js.map