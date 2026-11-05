"use strict";
/**
 * Matching, chains, combos, stop time and score.
 * Ported from common/engine/checkMatches.lua (@ c80668e).
 *
 * Written as free functions over a MatchableStack rather than methods, so the
 * whole of this can be tested against a hand-built board without standing up a
 * game. Stack passes itself in; the shape is otherwise the Lua one.
 *
 * FOUR RULES HERE ARE EASY TO GET SUBTLY WRONG:
 *
 *  1. Only panels whose state CHANGED this frame seed a match check. A settled
 *     board is never rescanned, which is why `stateChanged` is load-bearing and
 *     not merely an optimisation.
 *
 *  2. Both axes are evaluated independently and both are kept, but a panel is
 *     added once - `matching` is the dedupe flag. So a cross of 3+3 is a combo
 *     of FIVE, not six.
 *
 *  3. A match is a chain link if ANY ONE of its panels carries `chaining`. The
 *     chain counter has no 1: the first link sets it straight to 2.
 *
 *  4. Chain flags are cleared at the END of every checkMatches, for any panel
 *     that has come back to rest without matching - UNLESS the panel directly
 *     below it is mid-swap, which is what keeps a chain alive across a swap the
 *     player is still performing.
 *
 * Garbage matching is declared here as optional hooks. It needs the garbage
 * queue, which arrives with the versus work; until then a stack simply does not
 * implement them and matching behaves exactly as it does in a solo game.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.canMatch = canMatch;
exports.sortByPopOrder = sortByPopOrder;
exports.getMetalCount = getMetalCount;
exports.isNewChainLink = isNewChainLink;
exports.getOnScreenCount = getOnScreenCount;
exports.getMatchingPanels = getMatchingPanels;
exports.incrementChainCounter = incrementChainCounter;
exports.applyMatchToPanels = applyMatchToPanels;
exports.calculateStopTime = calculateStopTime;
exports.awardStopTime = awardStopTime;
exports.addScore = addScore;
exports.updateScoreWithChain = updateScoreWithChain;
exports.updateScoreWithCombo = updateScoreWithCombo;
exports.updateScoreWithBonus = updateScoreWithBonus;
exports.clearChainingFlags = clearChainingFlags;
exports.checkMatches = checkMatches;
const level_data_1 = require("./level-data");
const consts_1 = require("./consts");
/**
 * Can this panel take part in a match right now?
 *
 * Note `matchAnyway && hovering`: a panel that has just begun hovering above a
 * cell that popped is matchable for exactly one frame. That single clause is
 * what makes every skill chain in the game possible.
 */
function canMatch(panel) {
    if (panel.color === 0 || panel.color === 9)
        return false;
    return panel.state === 'normal'
        || panel.state === 'landing'
        || (panel.matchAnyway && panel.state === 'hovering');
}
/**
 * Order a match for popping.
 *
 * Ordinary matches pop top to bottom, left to right within a row. Garbage pops
 * the other way on both axes: bottom to top, right to left.
 */
function sortByPopOrder(panelList, isGarbage) {
    panelList.sort((a, b) => {
        if (a.row === b.row) {
            return isGarbage ? b.column - a.column : a.column - b.column;
        }
        return isGarbage ? a.row - b.row : b.row - a.row;
    });
    return panelList;
}
/** Shock panels in a match; three or more of them send shock garbage. */
function getMetalCount(panels) {
    return panels.reduce((count, panel) => count + (panel.color === 8 ? 1 : 0), 0);
}
/** One chaining panel anywhere in the match promotes the whole match to a link. */
function isNewChainLink(matchingPanels) {
    return matchingPanels.some((panel) => panel.chaining);
}
/** Garbage panels above the top of the stack do not count toward pop timing. */
function getOnScreenCount(stackHeight, panels) {
    return panels.reduce((count, panel) => count + (panel.row <= stackHeight ? 1 : 0), 0);
}
/**
 * Every panel that should match this frame, without duplicates.
 *
 * Candidates are only panels that changed state this frame. From each, walk out
 * in all four directions until the colour changes or an unmatchable panel is
 * hit; two or more in a direction pair means a match of three or more.
 */
function getMatchingPanels(stack) {
    const { panels, width, height } = stack;
    const matchingPanels = [];
    const candidatePanels = [];
    for (let row = 1; row <= height; row++) {
        for (let col = 1; col <= width; col++) {
            const panel = panels[row][col];
            if (panel.stateChanged && canMatch(panel))
                candidatePanels.push(panel);
        }
    }
    const verticallyConnected = [];
    const horizontallyConnected = [];
    for (const candidate of candidatePanels) {
        verticallyConnected.length = 0;
        horizontallyConnected.length = 0;
        // below
        for (let row = candidate.row - 1; row >= 1; row--) {
            const panel = panels[row][candidate.column];
            if (panel.color === candidate.color && canMatch(panel))
                verticallyConnected.push(panel);
            else
                break;
        }
        // above
        for (let row = candidate.row + 1; row <= height; row++) {
            const panel = panels[row][candidate.column];
            if (panel.color === candidate.color && canMatch(panel))
                verticallyConnected.push(panel);
            else
                break;
        }
        // left
        for (let column = candidate.column - 1; column >= 1; column--) {
            const panel = panels[candidate.row][column];
            if (panel.color === candidate.color && canMatch(panel))
                horizontallyConnected.push(panel);
            else
                break;
        }
        // right
        for (let column = candidate.column + 1; column <= width; column++) {
            const panel = panels[candidate.row][column];
            if (panel.color === candidate.color && canMatch(panel))
                horizontallyConnected.push(panel);
            else
                break;
        }
        const matchesVertically = verticallyConnected.length >= 2;
        const matchesHorizontally = horizontallyConnected.length >= 2;
        if ((matchesVertically || matchesHorizontally) && !candidate.matching) {
            matchingPanels.push(candidate);
            candidate.matching = true;
        }
        if (matchesVertically) {
            for (const panel of verticallyConnected) {
                if (!panel.matching) {
                    panel.matching = true;
                    matchingPanels.push(panel);
                }
            }
        }
        if (matchesHorizontally) {
            for (const panel of horizontallyConnected) {
                if (!panel.matching) {
                    panel.matching = true;
                    matchingPanels.push(panel);
                }
            }
        }
    }
    // A hovering panel that matches can never chain - see Panel.matchAnyway.
    for (const panel of matchingPanels) {
        if (panel.state === 'hovering')
            panel.chaining = false;
    }
    return matchingPanels;
}
/** The first link sets the counter to 2; there is no chain 1. */
function incrementChainCounter(stack) {
    stack.chainCounter = stack.chainCounter !== 0 ? stack.chainCounter + 1 : 2;
}
/** Put every panel of the match into matched state, in pop order. */
function applyMatchToPanels(matchingPanels, isChain, comboSize) {
    const ordered = sortByPopOrder(matchingPanels, false);
    for (let i = 0; i < comboSize; i++) {
        ordered[i].match(isChain, i + 1, comboSize);
    }
    return { row: ordered[0].row, column: ordered[0].column };
}
/**
 * How long the stack stops rising for this match.
 *
 * Four branches, and the "topped out" ones are the game being generous when you
 * are about to die - the in-game tutorial calls it out: "When you are in big
 * trouble, they'll stop a little longer. At that time, a 'Stop' mark appears."
 */
function calculateStopTime(stack, comboSize, toppedOut, isChain, chainCounter) {
    const stop = stack.levelData.stop;
    if (!(comboSize > 3 || isChain))
        return 0;
    if (toppedOut && isChain) {
        if (stop.formula === level_data_1.StopFormula.MODERN) {
            const length = chainCounter > 4 ? 6 : chainCounter;
            return stop.dangerConstant + (length - 1) * stop.dangerCoefficient;
        }
        return stop.dangerConstant;
    }
    if (toppedOut) {
        if (stop.formula === level_data_1.StopFormula.MODERN) {
            const length = comboSize < 9 ? 2 : 3;
            return stop.coefficient * length + stop.chainConstant;
        }
        return stop.dangerConstant;
    }
    if (isChain) {
        if (stop.formula === level_data_1.StopFormula.MODERN) {
            const length = Math.min(chainCounter, 13);
            return stop.coefficient * length + stop.chainConstant;
        }
        return stop.chainConstant;
    }
    if (stop.formula === level_data_1.StopFormula.MODERN) {
        return stop.coefficient * comboSize + stop.comboConstant;
    }
    return stop.comboConstant;
}
/** Stop time is taken, not accumulated: a bigger award replaces a smaller one. */
function awardStopTime(stack, isChain, comboSize) {
    const stopTime = calculateStopTime(stack, comboSize, stack.wasToppedOut, isChain, stack.chainCounter);
    if (stopTime > stack.stopTime)
        stack.stopTime = stopTime;
}
/** Add to the score, capped. Upstream's comment on the cap is "lol owned". */
function addScore(stack, amount) {
    stack.score += amount;
    if (stack.score > consts_1.MAX_SCORE)
        stack.score = consts_1.MAX_SCORE;
}
/**
 * Chain bonus.
 *
 * Deliberately NOT gated on this match being a chain link: while a chain is
 * live, every match scores the chain bonus again. A player noticed the same
 * thing from the outside - "At x13, just clear as many matches as possible, as
 * each clear gets you the points you would normally get for a x13 chain."
 *
 * And above 13 the bonus is zero, not 1800.
 */
function updateScoreWithChain(stack) {
    let chainBonus = stack.chainCounter;
    if (chainBonus > consts_1.MAX_SCORING_CHAIN)
        chainBonus = 0;
    addScore(stack, consts_1.SCORE_CHAIN_TA[chainBonus] ?? 0);
}
/** Combo bonus. Only 4 or more scores; the table tops out at 30. */
function updateScoreWithCombo(stack, comboSize) {
    if (comboSize > 3) {
        addScore(stack, consts_1.SCORE_COMBO_TA[Math.min(30, comboSize)] ?? 0);
    }
}
/** Always call after the chain counter has been incremented. */
function updateScoreWithBonus(stack, comboSize) {
    updateScoreWithChain(stack);
    updateScoreWithCombo(stack, comboSize);
}
/**
 * Drop the chain flag from panels that have settled without matching.
 *
 * The exception is the whole point: a panel keeps its chain flag while the
 * panel directly below it is mid-swap, because the player may still be building
 * the next link. Row 1 always loses it - there is nowhere left to fall from.
 */
function clearChainingFlags(stack) {
    const { panels, width, height } = stack;
    // Garbage clearing off-screen can support a chain, but panel generation makes
    // extra chains above height + 1 impossible, so height + 2 is far enough.
    const topRow = Math.min(panels.length - 1, height + 2);
    for (let row = 1; row <= topRow; row++) {
        for (let column = 1; column <= width; column++) {
            const panel = panels[row][column];
            if (!panel.matching && panel.chaining && !panel.matchAnyway
                && (canMatch(panel) || panel.color === 9)) {
                if (row > 1) {
                    if (panels[row - 1][column].state !== 'swapping')
                        panel.chaining = false;
                }
                else {
                    panel.chaining = false;
                }
            }
        }
    }
}
/**
 * The whole match pass for one frame.
 *
 * Order matters throughout: the chain counter is incremented before stop time
 * and score are computed, because both read it.
 */
function checkMatches(stack) {
    const matchingPanels = getMatchingPanels(stack);
    const comboSize = matchingPanels.length;
    if (comboSize > 0) {
        const frameConstants = stack.levelData.frameConstants;
        const metalCount = getMetalCount(matchingPanels);
        const isChainLink = isNewChainLink(matchingPanels);
        if (isChainLink)
            incrementChainCounter(stack);
        // A match interrupts a manual raise and locks the rise for this frame.
        stack.manualRaise = false;
        stack.riseLock = true;
        const origin = applyMatchToPanels(matchingPanels, isChainLink, comboSize);
        const garbagePanels = stack.getConnectedGarbagePanels?.(matchingPanels) ?? null;
        let garbagePanelCountOnScreen = 0;
        if (garbagePanels && garbagePanels.length > 0) {
            garbagePanelCountOnScreen = getOnScreenCount(stack.height, garbagePanels);
            const garbageMatchTime = frameConstants.FLASH + frameConstants.FACE
                + frameConstants.POP * (comboSize + garbagePanelCountOnScreen);
            stack.matchGarbagePanels?.(garbagePanels, garbageMatchTime, isChainLink, garbagePanelCountOnScreen);
        }
        const preStopTime = frameConstants.FLASH + frameConstants.FACE
            + frameConstants.POP * (comboSize + garbagePanelCountOnScreen);
        stack.preStopTime = Math.max(stack.preStopTime, preStopTime);
        awardStopTime(stack, isChainLink, comboSize);
        stack.onMatched?.(origin, isChainLink, comboSize, metalCount, garbagePanels ? garbagePanels.length : 0);
        // A plain three-panel match with no chain and no shock sends nothing.
        if (isChainLink || comboSize > 3 || metalCount > 0) {
            stack.pushGarbage?.(origin, isChainLink, comboSize, metalCount);
        }
        updateScoreWithBonus(stack, comboSize);
    }
    clearChainingFlags(stack);
}
//# sourceMappingURL=check-matches.js.map