"use strict";
/**
 * MISSION mode - judging one mission while it is played.
 *
 * The reference counts a mission's progress inside its own frame handler and
 * ends the stage the moment the norm is met (mission.c). This door does the
 * same through two inputs and nothing else: a LockEvent per locked piece, and
 * the run clock. Keeping the judge here - rather than in the engine or the
 * screen - is what lets every objective be tested without a terminal.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissionRun = void 0;
exports.nextIsHidden = nextIsHidden;
/**
 * Is the NEXT preview hidden - by the item's timer, or because a mission
 * switched it off for the whole run? Both renderers ask this rather than
 * testing one of the two and forgetting the other.
 */
function nextIsHidden(state) {
    return state.hideNextFrames > 0 || state.missionModifiers?.hideNext === true;
}
/** Line counts that count toward each "exactly N lines" objective. */
const EXACT_CLEAR = {
    single: 1, double: 2, triple: 3, tetris: 4,
    // mission_info_en[28]: "Erase 4 lines at once %d times! Do not erase 3 or
    // less lines!" - four lines, and a smaller clear does not merely fail to
    // count, it resets. That is 'exactOrReset' of four, so the objective is
    // expressed through the strictness rather than as a branch of its own.
    b2bTetris: 4,
};
/** Objectives whose strictness is part of what they ARE, not an option. */
const FORCED_STRICTNESS = {
    b2bTetris: 'exactOrReset',
};
class MissionRun {
    constructor(mission) {
        this.mission = mission;
        this.current = 0;
        this.outcome = 'playing';
        /** For 'cycle': which clear sizes have been seen. */
        this.cycleSeen = new Set();
    }
    getMission() {
        return this.mission;
    }
    getProgress() {
        return {
            outcome: this.outcome,
            current: this.current,
            target: this.target(),
            failure: this.failure,
        };
    }
    /** 'survive' has no count to reach; everything else has its norm. */
    target() {
        if (this.mission.objective === 'survive')
            return 0;
        // 'cycle' counts DISTINCT clear sizes, and the reference compares that
        // count against mission_norm like every other type (mission.c:874-879) -
        // it does not hardcode four. A pack asking for two of the four sizes was
        // being judged as asking for all four; the loader keeps the norm inside
        // 1..4, because a fifth size does not exist.
        return this.mission.norm;
    }
    /** The engine locked a piece. Returns the outcome after judging it. */
    onLock(event) {
        if (this.outcome !== 'playing')
            return this.outcome;
        const objective = this.mission.objective;
        const exact = EXACT_CLEAR[objective];
        if (objective === 'lines') {
            this.current += event.lineCount;
        }
        else if (exact !== undefined) {
            /*
             * The GRADE option (mission_opt_1, mission.c:841-866). 'exact' is the
             * default and what every pack meant before the field existed;
             * 'atLeast' takes the bigger clear too; 'exactOrReset' takes the exact
             * one and throws the count away on any other clear.
             */
            const strictness = FORCED_STRICTNESS[objective] ?? this.mission.strictness ?? 'exact';
            const counts = strictness === 'atLeast'
                ? event.lineCount >= exact
                : event.lineCount === exact;
            if (counts)
                this.current++;
            else if (strictness === 'exactOrReset' && event.lineCount > 0)
                this.current = 0;
        }
        else if (objective === 'cycle') {
            if (event.lineCount > 0)
                this.cycleSeen.add(event.lineCount);
            this.current = this.cycleSeen.size;
        }
        else if (objective === 'tspin') {
            // mission.c:955-957, with tspin_flag forced 3-corner in MISSION mode.
            if (event.tSpinFull && event.lineCount > 0)
                this.current++;
        }
        else if (objective === 'tspinDouble') {
            // mission.c:1101-1103 is `tspin_flag == 2 && lines >= 2`, so a T-spin
            // TRIPLE counts too. It did not here, which made the objective harder
            // than the one it is named after.
            if (event.tSpinFull && event.lineCount >= 2)
                this.current++;
        }
        else if (objective === 'combo') {
            // "Do %d combo(s)" - the highest combo reached, not a running total.
            // With NOT1LINE it is the counter singles do not advance that is read.
            const reached = this.mission.ignoreSingles
                ? event.comboIgnoringSingles
                : event.combo;
            this.current = Math.max(this.current, reached);
        }
        else if (objective === 'allClear') {
            if (event.allClear)
                this.current++;
        }
        else if (objective === 'pieces') {
            this.current = event.piecesPlaced;
        }
        else if (objective === 'level') {
            this.current = event.level;
        }
        if (objective !== 'survive' && this.current >= this.target()) {
            this.outcome = 'cleared';
        }
        return this.outcome;
    }
    /**
     * The clock moved. A timed mission that is not 'survive' fails when the
     * clock runs out; 'survive' is cleared by exactly the same moment.
     */
    onTime(elapsedSeconds) {
        if (this.outcome !== 'playing')
            return this.outcome;
        const limit = this.mission.timeLimitSeconds;
        if (limit <= 0)
            return this.outcome;
        if (this.mission.objective === 'survive') {
            this.current = Math.min(elapsedSeconds, limit);
            if (elapsedSeconds >= limit)
                this.outcome = 'cleared';
            return this.outcome;
        }
        if (elapsedSeconds >= limit) {
            this.outcome = 'failed';
            this.failure = 'out of time';
        }
        return this.outcome;
    }
    /** The stack topped out. Every mission fails on that, including 'survive'. */
    onTopOut() {
        if (this.outcome === 'playing') {
            this.outcome = 'failed';
            this.failure = 'topped out';
        }
        return this.outcome;
    }
    /** One line for the HUD: what to do, and how far along. */
    describe() {
        const { objective, norm, timeLimitSeconds } = this.mission;
        switch (objective) {
            case 'survive':
                return `SURVIVE ${timeLimitSeconds}s  ${Math.floor(this.current)}/${timeLimitSeconds}`;
            case 'cycle':
                return `ALL CLEAR SIZES  ${this.current}/${norm}`;
            case 'combo':
                return `COMBO ${norm}  BEST ${this.current}`;
            case 'level':
                return `REACH LEVEL ${norm}  ${this.current}/${norm}`;
            default: {
                // 'atLeast' is a different mission from 'exact' and the player has to
                // be told which one they are playing: "DOUBLE 4" and "DOUBLE 4+" are
                // not the same ask.
                const plus = (this.mission.strictness ?? 'exact') === 'atLeast' ? '+' : '';
                return `${objective.toUpperCase()} ${norm}${plus}  ${this.current}/${norm}`;
            }
        }
    }
}
exports.MissionRun = MissionRun;
//# sourceMappingURL=mission-run.js.map