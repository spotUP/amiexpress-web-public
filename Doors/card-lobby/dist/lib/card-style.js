"use strict";
/**
 * How cards are drawn: the player's choice, and what the panel allows.
 *
 * The SDK's card engine takes six things that change how a card or a hand
 * looks (sdk/engines/cards/card-engine.ts:49-101):
 *
 *   style      unicode or ascii faces
 *   size       full (7 rows) or mini (4)
 *   colour     ansi or none
 *   backStyle  lined, dotted, classic, shiny
 *   layout     flat, flat-condensed, arch, arch-condensed  (hands only)
 *   spacing    columns between neighbours; the engine's default overlaps a
 *              condensed layout by four columns
 *
 * The door offered three of them and hardcoded the rest, and UNO hardcoded
 * `mini` on top of that - "uno in cardlobby doesnt show the full size cards
 * when it can", and "we have much more to chose from when it comes to card
 * styles and hand layouts" (sysop, 2026-09-02). This module is the whole set,
 * resolved once for whatever panel is doing the drawing.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CARD_STYLE_CHOICES = exports.deckChoices = exports.BUILT_IN_DECK = exports.MINI_CARD_ROWS = exports.FULL_CARD_ROWS = void 0;
exports.findThemesDirectory = findThemesDirectory;
exports.loadDecks = loadDecks;
exports.forgetDecks = forgetDecks;
exports.resolveCardStyle = resolveCardStyle;
exports.cardRows = cardRows;
exports.toRenderOptions = toRenderOptions;
/** A full-size card is seven rows tall; a mini is four. */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
exports.FULL_CARD_ROWS = 7;
exports.MINI_CARD_ROWS = 4;
/**
 * The decks the door ships, read once from `themes/`.
 *
 * `built-in` is the engine's own drawing, which is what every board had
 * before a card could be themed; the rest are files, and a board that drops
 * another one in gets it in this menu without a code change (the SDK reads
 * csol's format - sdk/engines/cards/card-theme.ts).
 */
exports.BUILT_IN_DECK = 'built-in';
let deckCache = null;
/** Where the `.theme` files live; walked for, like the games directory. */
function findThemesDirectory(start = __dirname) {
    let at = start;
    for (let depth = 0; depth < 8; depth += 1) {
        const candidate = path.join(at, 'themes');
        try {
            if (fs.existsSync(candidate) && fs.readdirSync(candidate).some((n) => n.endsWith('.theme'))) {
                return candidate;
            }
        }
        catch { /* keep walking */ }
        const parent = path.dirname(at);
        if (parent === at)
            break;
        at = parent;
    }
    return null;
}
function loadDecks(directory = findThemesDirectory()) {
    if (deckCache)
        return deckCache;
    const decks = new Map();
    if (directory) {
        for (const file of fs.readdirSync(directory).sort()) {
            if (!file.endsWith('.theme'))
                continue;
            try {
                const theme = (0, bbs_door_sdk_1.parseCardTheme)(fs.readFileSync(path.join(directory, file), 'utf8'));
                decks.set(theme.name, theme);
            }
            catch (error) {
                // One unreadable deck must not cost the player the others.
                console.warn(`[card-lobby] ${file} is not a deck: ${error instanceof Error ? error.message : error}`);
            }
        }
    }
    deckCache = decks;
    return decks;
}
/** For tests, and for a board that adds a deck while the door is open. */
function forgetDecks() {
    deckCache = null;
}
const deckChoices = () => [exports.BUILT_IN_DECK, ...loadDecks().keys()];
exports.deckChoices = deckChoices;
/** Every value the player can pick, in the order the panel cycles them. */
exports.CARD_STYLE_CHOICES = {
    deck: [exports.BUILT_IN_DECK],
    size: ['auto', 'full', 'mini'],
    style: ['ascii', 'unicode'],
    colour: ['ansi', 'none'],
    back: ['lined', 'dotted', 'classic', 'shiny'],
    layout: ['flat-condensed', 'flat', 'arch', 'arch-condensed'],
    spacing: ['auto', 'tight', 'wide'],
};
/** 'tight' overlaps hard, 'wide' gives each card its own column run. */
const SPACING_COLUMNS = {
    auto: undefined,
    tight: 3,
    wide: 12,
};
/**
 * Decide how to draw in a panel `panelRows` tall.
 *
 * `unicodeCapable` is the session's own answer: a player may ask for unicode
 * faces, but a terminal that cannot draw them gets ASCII anyway, because a box
 * of question marks is worse than a plain card.
 */
function resolveCardStyle(preferences, panelRows, unicodeCapable = false) {
    const asked = preferences?.size ?? 'auto';
    const fits = panelRows >= exports.FULL_CARD_ROWS;
    const size = asked === 'auto' ? (fits ? 'full' : 'mini') : asked;
    const deck = preferences?.deck && preferences.deck !== exports.BUILT_IN_DECK
        ? loadDecks().get(preferences.deck)
        : undefined;
    return {
        theme: deck,
        style: preferences?.style === 'unicode' && unicodeCapable ? 'unicode' : 'ascii',
        // A full card asked for in a panel that cannot hold one is still cut off,
        // so an explicit 'full' is honoured only where it fits.
        size: size === 'full' && !fits ? 'mini' : size,
        color: preferences?.colour === 'none' ? 'none' : 'ansi',
        backStyle: preferences?.back ?? 'lined',
        layout: preferences?.layout ?? 'flat-condensed',
        spacing: SPACING_COLUMNS[preferences?.spacing ?? 'auto'],
    };
}
/** How many rows a card of this size occupies, for laying a panel out. */
function cardRows(size) {
    return size === 'full' ? exports.FULL_CARD_ROWS : exports.MINI_CARD_ROWS;
}
/** What the engine's renderHandLines/renderUnoCardLines want, from a resolved style. */
function toRenderOptions(style) {
    return {
        // A theme decides the card entirely; the rest is what the engine falls
        // back to when there is none.
        ...(style.theme ? { theme: style.theme } : {}),
        style: style.style,
        size: style.size,
        color: style.color,
        backStyle: style.backStyle,
        layout: style.layout,
        ...(style.spacing === undefined ? {} : { spacing: style.spacing }),
    };
}
