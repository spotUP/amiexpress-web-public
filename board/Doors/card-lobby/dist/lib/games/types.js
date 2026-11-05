"use strict";
/**
 * ONE SEAM FOR EVERY GAME IN THE LOBBY.
 *
 * Hold'em came first and UNO was threaded in beside it: fourteen
 * `isUnoTable(table)` branches across index.ts, GameViews and the gamepad
 * bindings, plus a set of uno-named methods on the app. It worked, but it
 * priced every future game at the same fourteen edits, and the sysop asked
 * for Skitgubbe "without duplicating code" (2026-09-15).
 *
 * So the questions the door actually asks about a table are written down
 * here, once, and each game answers them:
 *
 *   - may the poker engine restore this table's hand?   `usesPokerEngine`
 *   - which hints belong in the activity panel?          `hintKind`
 *   - how does a game start here?                        `start`
 *   - what goes in the four panels?                      `render`
 *   - what do the number keys and the pad buttons do?     `selectCard`,
 *                                                         `primaryAction`,
 *                                                         `secondaryAction`,
 *                                                         `tertiaryAction`
 *
 * A game that answers them is playable; nothing else in the door needs to
 * learn its name. Hold'em and UNO answer by delegating to the code that
 * already runs them - this is a seam, not a rewrite - and Skitgubbe answers
 * for itself.
 */
Object.defineProperty(exports, "__esModule", { value: true });
