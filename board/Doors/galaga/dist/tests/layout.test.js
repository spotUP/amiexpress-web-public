"use strict";
/**
 * The board is not allowed to wrap.
 *
 * Reported live: "the lines in zookeeper are too long, every second one is
 * black". Every arcade door here was built from the same template, and the
 * template omits two options on the boxes that matter:
 *
 *   - blessed.box() returns a Panel, and a Panel INJECTS a line border
 *     whenever `border` is absent from the options. That steals two columns
 *     and two rows. A row drawn to the full field width then overflows the
 *     box by two columns, wraps, and the wrapped remainder paints as a black
 *     line - so the board appears on every other row.
 *
 *   - a one-row HUD is worse: the injected border IS the whole box, so the
 *     score line never appears at all.
 *
 * There was a sweep for exactly this ("sweep ghost-border fix to all blessed
 * doors") and it missed six doors, so this test exists per door rather than
 * as one shared check somebody can forget to extend.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.theGameAreaHasNoGhostBorderAndDoesNotWrap = theGameAreaHasNoGhostBorderAndDoesNotWrap;
exports.theHudHasNoGhostBorder = theHudHasNoGhostBorder;
const assert_1 = __importDefault(require("assert"));
const fs_1 = require("fs");
const path_1 = require("path");
/** The options block of a named blessed.box() call. */
function boxOptions(src, name) {
    const re = new RegExp(`${name}\\s*=\\s*blessed\\.box\\(\\{([\\s\\S]*?)\\n  \\}\\)`);
    const m = src.match(re);
    assert_1.default.ok(m, `no ${name} = blessed.box({...}) found`);
    return m[1];
}
function indexSource() {
    return (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '..', 'index.ts'), 'utf8');
}
/** The playfield must not draw its own border, and must not wrap. */
async function theGameAreaHasNoGhostBorderAndDoesNotWrap() {
    const opts = boxOptions(indexSource(), 'gameArea');
    assert_1.default.ok(/border:\s*undefined/.test(opts), 'gameArea must pass border: undefined explicitly, or Panel injects one ' +
        'and steals two columns from a row that is already full width');
    assert_1.default.ok(/wrap:\s*false/.test(opts), 'gameArea must set wrap: false, or a full-width row wraps and the board ' +
        'renders on every other line');
}
/** A one-row HUD must not draw a border, or it has no room for content. */
async function theHudHasNoGhostBorder() {
    const opts = boxOptions(indexSource(), 'hudBox');
    assert_1.default.ok(/border:\s*undefined/.test(opts), 'hudBox must pass border: undefined explicitly - on a one-row box the ' +
        'injected border is the whole box and the score line never appears');
}
//# sourceMappingURL=layout.test.js.map