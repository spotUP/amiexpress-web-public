"use strict";
/**
 * UNO's ACTION KEYS.
 *
 * Play, draw, call UNO, challenge - the four things a caller does at an UNO
 * table that are not picking a card. They moved out of index.ts when it hit
 * the door's 2000-line ceiling for the second time (2026-09-16), the same way
 * `KeyBindings` did for the keyboard and for the same reason: the file that
 * holds the door together should not also hold one game's rules.
 *
 * They read as methods because that is what they were - the door delegates to
 * them and the registry's UNO adapter still calls `host.triggerUnoPlayCard()`
 * and friends, so nothing outside this file had to learn a new name.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnoActions = void 0;
const uno_engine_1 = require("../lib/uno-engine");
const refusal_1 = require("../lib/games/refusal");
class UnoActions {
    constructor(host) {
        this.host = host;
    }
    playCard() {
        if (this.host.modalActive || !this.host.currentProfile || !this.host.lobby)
            return;
        const table = this.host.currentProfile.currentTableId
            ? this.host.findTableById(this.host.currentProfile.currentTableId)
            : null;
        if (!table)
            return;
        const gameState = this.host.loadUnoGameState(table);
        if (!gameState)
            return;
        const state = gameState.engine.getGameState();
        const currentPlayer = state.players[state.currentPlayerIndex];
        // Check if it's the player's turn
        if (currentPlayer.id !== this.host.currentProfile.userId) {
            this.host.pushNotice('Not your turn.');
            return;
        }
        // Check if a card is selected
        if (this.host.selectedUnoCardIndex === null) {
            this.host.pushNotice('Select a card first (keys 1-9, 0).');
            return;
        }
        const card = currentPlayer.hand[this.host.selectedUnoCardIndex];
        if (!card) {
            this.host.pushNotice('Invalid card selection.');
            return;
        }
        /*
         * WHY IT WILL NOT GO, AND WHAT WOULD. "Cannot play that card." told the
         * caller nothing at all - not the rule, not the way out ("if i can't
         * throw a card in any cardgame try print an explanatory status message",
         * sysop 2026-09-16). UNO's rule is colour, or value, or a wild; the way
         * out is the draw pile.
         */
        if (!gameState.engine.canPlayCard(this.host.currentProfile.userId, card)) {
            const state = gameState.engine.getGameState();
            const top = state.discardPile[state.discardPile.length - 1];
            const colour = (0, uno_engine_1.unoColorName)(state.currentColor);
            this.host.pushNotice((0, refusal_1.explainRefusal)(`${(0, uno_engine_1.unoCardName)(card)} does not match ${colour} ${top ? (0, uno_engine_1.unoCardName)(top) : ''}`.trim(), `Play a ${colour} card, another ${top ? String(top.value).toUpperCase() : 'match'}, `
                + 'or a wild - or press D to draw.'));
            return;
        }
        // If wild card, we'll prompt for color in handleUnoAction
        this.host.runAction(async () => {
            await this.host.handleUnoAction('play-card', this.host.selectedUnoCardIndex ?? undefined);
            this.host.selectedUnoCardIndex = null;
        });
    }
    drawCard() {
        if (this.host.modalActive || !this.host.currentProfile || !this.host.lobby)
            return;
        const table = this.host.currentProfile.currentTableId
            ? this.host.findTableById(this.host.currentProfile.currentTableId)
            : null;
        if (!table)
            return;
        const gameState = this.host.loadUnoGameState(table);
        if (!gameState)
            return;
        const state = gameState.engine.getGameState();
        const currentPlayer = state.players[state.currentPlayerIndex];
        // Check if it's the player's turn
        if (currentPlayer.id !== this.host.currentProfile.userId) {
            this.host.pushNotice('Not your turn.');
            return;
        }
        this.host.runAction(() => this.host.handleUnoAction('draw-card'));
    }
    callUno() {
        if (this.host.modalActive || !this.host.currentProfile || !this.host.lobby)
            return;
        const table = this.host.currentProfile.currentTableId
            ? this.host.findTableById(this.host.currentProfile.currentTableId)
            : null;
        if (!table)
            return;
        const gameState = this.host.loadUnoGameState(table);
        if (!gameState)
            return;
        const player = gameState.engine.getPlayer(this.host.currentProfile.userId);
        if (!player)
            return;
        // Check if player has 1 card (can call UNO)
        if (player.hand.length !== 1) {
            this.host.pushNotice('You can only call UNO when you have 1 card left.');
            return;
        }
        if (player.calledUno) {
            this.host.pushNotice('You already called UNO.');
            return;
        }
        this.host.runAction(() => this.host.handleUnoAction('call-uno'));
    }
    challenge() {
        if (this.host.modalActive || !this.host.currentProfile || !this.host.lobby)
            return;
        const table = this.host.currentProfile.currentTableId
            ? this.host.findTableById(this.host.currentProfile.currentTableId)
            : null;
        if (!table)
            return;
        const gameState = this.host.loadUnoGameState(table);
        if (!gameState)
            return;
        const state = gameState.engine.getGameState();
        // Check if there's an active challenge window
        if (!state.challengeWindow) {
            this.host.pushNotice('No challenge available.');
            return;
        }
        // Check if player is eligible to challenge
        if (!state.challengeWindow.eligibleChallengers.includes(this.host.currentProfile.userId)) {
            this.host.pushNotice('You cannot challenge this action.');
            return;
        }
        // Determine challenge type
        const challengeType = state.challengeWindow.type === 'uno'
            ? 'challenge-uno'
            : 'challenge-wild-four';
        this.host.runAction(() => this.host.handleUnoAction(challengeType));
    }
}
exports.UnoActions = UnoActions;
