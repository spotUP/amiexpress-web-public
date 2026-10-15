"use strict";
/**
 * The simulated opponent's health, ported from common/engine/Health.lua.
 *
 * Challenge Mode's opponent has NO BOARD. It is this: one number representing
 * how buried it is, rising steadily and falling as it "clears". Garbage you
 * send adds to it; when it stays over the line long enough, the opponent dies.
 *
 * That is not a shortcut on our part - it is what panel-attack does, and it is
 * why the opponent's side of the screen shows a rising danger bar rather than
 * panels. It also means the opponent cannot be read, baited or out-played, only
 * out-damaged.
 *
 * TWO THINGS MAKE IT GET HARDER. The rise speed climbs every fifteen seconds
 * exactly as a real stack's does, and STAMINA decays: its ability to clear
 * falls linearly to half over the first five hundred seconds. So an opponent
 * you cannot beat early may still be beatable late.
 *
 * The damage a piece of garbage does is deliberately sublinear above six rows -
 * a very tall block is worth less per row than a short one - which stops one
 * enormous chain from simply ending the match.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Health = void 0;
const consts_1 = require("./consts");
const level_data_1 = require("./level-data");
/** Stamina never falls below half, however long the match runs. */
const MIN_STAMINA = 0.5;
/** Stamina lost per second of play. */
const STAMINA_DECAY_PER_SECOND = 0.01 / 10;
class Health {
    constructor(settings) {
        this.currentLines = 0;
        /**
         * Two +4 combos in a row count as one line between them - so spamming the
         * smallest combo is worth less than it looks.
         */
        this.lastWasFourCombo = false;
        this.clock = 0;
        this.framesToppedOutToLose = settings.framesToppedOutToLose;
        this.maxFramesToppedOutToLose = settings.framesToppedOutToLose;
        this.lineClearRate = (0, level_data_1.toSafePrecision)(settings.lineClearGPM / 60);
        this.height = settings.lineHeightToKill;
        this.initialRiseSpeed = settings.riseSpeed;
        this.currentRiseSpeed = settings.riseSpeed;
    }
    /**
     * Advance one frame. Returns the frames of burial it has left.
     *
     * Note the damage is PERMANENT: once the counter has dropped it never
     * refills, even if the opponent digs itself back out. A real stack's health
     * refills; this one's does not, which is what makes a sustained attack tell.
     */
    run() {
        if (this.clock > 0 && this.clock % consts_1.DT_SPEED_INCREASE === 0) {
            this.currentRiseSpeed = Math.min(this.currentRiseSpeed + 1, 99);
        }
        // SPEED_TO_RISE_TIME is frames per sixteenth of a row; multiplying back out
        // gives frames per row, and one over that is rows per frame.
        const framesPerRow = consts_1.SPEED_TO_RISE_TIME[this.currentRiseSpeed] * consts_1.DISPLACEMENT_PER_ROW;
        this.currentLines += 1 / framesPerRow;
        const stamina = Math.max(MIN_STAMINA, 1 - (this.clock / 60) * STAMINA_DECAY_PER_SECOND);
        const cleared = this.lineClearRate * (1 / 60) * stamina;
        this.currentLines = Math.max(0, this.currentLines - cleared);
        if (this.currentLines >= this.height) {
            this.framesToppedOutToLose = Math.max(0, this.framesToppedOutToLose - 1);
        }
        this.clock += 1;
        return this.framesToppedOutToLose;
    }
    /**
     * How many lines a block of this height is worth.
     *
     * Linear to five, then sublinear: +0.8, +0.6, +0.4, +0.2 and nothing after,
     * so anything ten rows or taller is worth exactly seven. A single enormous
     * chain therefore cannot end the match on its own.
     */
    damageForHeight(height) {
        if (height < 6)
            return height;
        let damage = 5;
        for (let i = 1; i <= Math.min(height - 5, 4); i++) {
            damage += 1 - i * 0.2;
        }
        return damage;
    }
    /**
     * Take a piece of garbage.
     *
     * A 3-wide non-chain block is what a +4 combo sends, and two of those in a
     * row count as one: the second is free. Anything else resets the toggle.
     */
    receiveGarbage(garbage) {
        if (!garbage.width || !garbage.height)
            return;
        let countGarbage = true;
        if (!garbage.isMetal && !garbage.isChain && garbage.width === 3) {
            if (this.lastWasFourCombo) {
                this.lastWasFourCombo = false;
                countGarbage = false;
            }
            else {
                this.lastWasFourCombo = true;
            }
        }
        else {
            this.lastWasFourCombo = false;
        }
        if (countGarbage) {
            this.currentLines += this.damageForHeight(garbage.height);
        }
    }
    /**
     * How buried the opponent is, as a fraction. This is the danger bar, and it
     * is NOT capped at 1 - an opponent can be very buried indeed.
     */
    getTopOutPercentage() {
        return Math.max(0, this.currentLines) / this.height;
    }
    getSettings() {
        return {
            framesToppedOutToLose: this.maxFramesToppedOutToLose,
            lineClearGPM: (0, level_data_1.toSafePrecision)(this.lineClearRate * 60),
            lineHeightToKill: this.height,
            riseSpeed: this.initialRiseSpeed,
        };
    }
}
exports.Health = Health;
//# sourceMappingURL=health.js.map