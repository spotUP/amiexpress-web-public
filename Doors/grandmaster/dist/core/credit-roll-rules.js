"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.boneBlockChance = boneBlockChance;
exports.startCreditRoll = startCreditRoll;
exports.completeCreditRoll = completeCreditRoll;
/**
 * How often a piece is a BONE BLOCK at this grade (TGM3's S13 and up).
 *
 * Nothing below S13 gets them at all; from there the chance climbs with the
 * grade, to four pieces in five at GM.
 */
const BONE_PROBABILITIES = {
    'S13': 0.20,
    'm1': 0.30, 'm2': 0.30, 'm3': 0.30,
    'm4': 0.40, 'm5': 0.40, 'm6': 0.40,
    'm7': 0.50, 'm8': 0.50, 'm9': 0.50,
    'M': 0.60, 'MK': 0.60,
    'MV': 0.70, 'MO': 0.70,
    'GM': 0.80,
};
/** `atLeastS13` is the grade manager's answer; below it, nobody gets any. */
function boneBlockChance(grade, atLeastS13) {
    if (!atLeastS13)
        return 0;
    return BONE_PROBABILITIES[grade] || 0;
}
/** Begin the roll, and copy its clock into the state the screen reads. */
function startCreditRoll(state, manager) {
    state.creditRollActive = true;
    manager.start(state.level);
    const rollState = manager.getState();
    state.creditRollStartTime = rollState.startTime;
    state.creditRollTimeRemaining = rollState.timeRemaining;
}
/**
 * End it, and award the rank.
 *
 * GM for a roll survived on the invisible field, M for one that was not -
 * the roll is the last thing standing between Master and Grand Master.
 */
function completeCreditRoll(state, manager) {
    state.grade = manager.isQualified() ? 'GM' : 'M';
    state.status = 'complete';
    state.endTime = Date.now();
    state.creditRollActive = false;
}
//# sourceMappingURL=credit-roll-rules.js.map