"use strict";
/**
 * The shipped sprite sheet is complete and valid.
 *
 * The renderer (game/render.ts) asks for these sprites and animations BY
 * NAME; a missing one throws mid-game. This test walks the exact set the
 * renderer uses, so a renamed animation fails here, not in front of a
 * player.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.everySpriteAndAnimationTheRendererNamesExists = everySpriteAndAnimationTheRendererNamesExists;
exports.everySpriteIsOneBoardCell = everySpriteIsOneBoardCell;
exports.deathHoldsItsLastFrame = deathHoldsItsLastFrame;
const assert_1 = __importDefault(require("assert"));
const path_1 = require("path");
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const REQUIRED = {
    'pengo': ['walk-up', 'walk-down', 'walk-left', 'walk-right', 'push', 'death'],
    'sno-bee': ['crawl', 'stunned', 'hatching'],
    'ice': ['idle', 'sliding'],
    'diamond': ['sparkle'],
    'wall': ['idle', 'shake'],
    'egg': ['idle'],
};
async function everySpriteAndAnimationTheRendererNamesExists() {
    const sheet = (0, cell_art_1.loadSpriteSheet)((0, path_1.join)(__dirname, '..', 'sprites'));
    for (const [name, animations] of Object.entries(REQUIRED)) {
        assert_1.default.ok(sheet[name], `sprite '${name}' is missing from sprites/`);
        for (const anim of animations) {
            assert_1.default.ok(sheet[name].animations[anim], `sprite '${name}' is missing animation '${anim}'`);
        }
    }
}
async function everySpriteIsOneBoardCell() {
    const sheet = (0, cell_art_1.loadSpriteSheet)((0, path_1.join)(__dirname, '..', 'sprites'));
    for (const sprite of Object.values(sheet)) {
        assert_1.default.strictEqual(sprite.cellW, 5, `${sprite.name} is not 5 wide`);
        assert_1.default.strictEqual(sprite.cellH, 2, `${sprite.name} is not 2 tall`);
    }
}
async function deathHoldsItsLastFrame() {
    const sheet = (0, cell_art_1.loadSpriteSheet)((0, path_1.join)(__dirname, '..', 'sprites'));
    assert_1.default.strictEqual(sheet['pengo'].animations['death'].loop, false, 'a looping death animation resurrects the penguin visually');
}
//# sourceMappingURL=sprites-assets.test.js.map