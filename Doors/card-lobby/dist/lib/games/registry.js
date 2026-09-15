"use strict";
/**
 * WHICH GAME IS THIS TABLE PLAYING?
 *
 * One lookup, asked in the handful of places that used to ask
 * `isUnoTable(table)` and branch. A game the registry does not know is a
 * game the door politely declines to deal, which is what the catalogue's
 * `enabled: false` entries have always meant.
 *
 * Hold'em and UNO are ADAPTERS over the code that already runs them - their
 * engines, their handlers and their painters have not moved - so the risk
 * here is a dispatch change, not a rewrite. Skitgubbe is native
 * (`skitgubbe/module.ts`) and adds no branches anywhere.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRegistry = exports.UnoGameModule = exports.HoldemGameModule = void 0;
/** Texas Hold'em, exactly as it already worked. */
class HoldemGameModule {
    constructor(host) {
        this.host = host;
        this.ids = ['holdem'];
        this.usesPokerEngine = true;
        this.hintKind = 'poker';
    }
    start(table) { return this.host.startHoldemHand(table); }
    render(painter, table) { painter.renderPokerGameView(table); }
    /** Poker has no card selection: the hand plays itself. */
    selectCard() { }
    moveSelection() { }
    primaryAction() { this.host.triggerCall(); }
    secondaryAction() { this.host.triggerFold(); }
    tertiaryAction() { this.host.triggerRaise(); }
    updateActionButtons(table) { this.host.updatePokerActionButtons(table); }
    /**
     * "FLOP" was only ever right for the first three cards; the panel carries
     * the turn and the river too. BOARD is the word for all of it.
     */
    panelTitles() {
        return { board: 'Board', players: 'Players', hand: 'Your hand' };
    }
}
exports.HoldemGameModule = HoldemGameModule;
/** UNO and its house-rules variant. */
class UnoGameModule {
    constructor(host) {
        this.host = host;
        this.ids = ['uno', 'uno-house'];
        /**
         * NO. `table.hand.snapshot` holds an UnoGameSnapshot, and handing that to
         * `PokerEngine.restore()` is the "cannot restore undefined" notice the
         * sysop hit on every repaint (2026-09-02).
         */
        this.usesPokerEngine = false;
        this.hintKind = 'uno';
    }
    start(table) { return this.host.startUnoGame(table); }
    render(painter, table) { painter.renderUnoGameView(table); }
    selectCard(index) { this.host.selectUnoCard(index); }
    moveSelection(delta) { this.host.moveUnoSelection(delta); }
    primaryAction() { this.host.triggerUnoPlayCard(); }
    secondaryAction() { this.host.triggerUnoDrawCard(); }
    tertiaryAction() { this.host.triggerUnoCallUno(); }
    /** At an UNO table Q is CHALLENGE, not quit. */
    quitAction() { this.host.triggerUnoChallenge(); return true; }
    updateActionButtons(table) { this.host.updateUnoActionButtons(table); }
    panelTitles() {
        return { board: 'Discard', players: 'Players', hand: 'Your hand' };
    }
}
exports.UnoGameModule = UnoGameModule;
class GameRegistry {
    constructor(modules) {
        this.byId = new Map();
        for (const module of modules) {
            for (const id of module.ids)
                this.byId.set(id, module);
        }
    }
    /** The module that serves this table, if the lobby has one. */
    for(table) {
        return table ? this.byId.get(table.gameId) : undefined;
    }
    get(gameId) {
        return this.byId.get(gameId);
    }
    /**
     * Whether the poker engine may restore this table's hand.
     *
     * The guard that used to read `if (isUnoTable(table)) return null` inside
     * `loadTableHand`, asked of the registry instead - so a game added later
     * cannot forget it by omission: it has to say `usesPokerEngine` out loud.
     */
    usesPokerEngine(table) {
        return this.for(table)?.usesPokerEngine ?? false;
    }
    hintKind(table) {
        return this.for(table)?.hintKind ?? null;
    }
}
exports.GameRegistry = GameRegistry;
