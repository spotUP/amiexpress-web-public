"use strict";
/**
 * WHY THAT CARD WILL NOT GO, AND WHAT TO DO INSTEAD.
 *
 * "if i can't throw a card in any cardgame try print an explanatory status
 * message" (sysop, 2026-09-16). Every game in the lobby refused differently
 * and none of them said what to do next:
 *
 *   Skitgubbe  "7H does not answer KS."     - the reason, and nothing else
 *   UNO        "Cannot play that card."      - not even the reason
 *   Patience   "Nothing will go home yet."   - no way out offered
 *
 * A refusal a player cannot act on reads as the door being broken, which is
 * exactly how it was reported. So a refusal is two things: the REASON, which
 * only the game's own rules can give, and the ADVICE, which is the move that
 * IS available - taking the pile, drawing a card, picking a different pile.
 * `TableGameModule.refusalAdvice` is where a game says the second, and this
 * is the one place the two are put together, so every game reads the same and
 * a new game gets the shape for free.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.explainRefusal = explainRefusal;
/**
 * One sentence for the status bar: the reason, then the way out.
 *
 * The reason is trimmed of its full stop before the advice is joined on, so a
 * game can write either with or without one and the result never reads
 * "does not answer KS.. Press C".
 */
function explainRefusal(reason, advice) {
    const why = (reason ?? '').trim().replace(/\s*\.\s*$/, '');
    const what = (advice ?? '').trim();
    if (!why)
        return what;
    if (!what)
        return `${why}.`;
    return `${why}. ${what}`;
}
