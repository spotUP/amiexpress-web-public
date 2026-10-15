"use strict";
/**
 * Card Lobby - the keyboard.
 *
 * Every `screen.key` binding the door has, in one file, the way the gamepad's
 * are (managers/GamepadBindings.ts). They moved out of index.ts when it hit
 * the door's 2000-line ceiling (2026-09-15), and the move is a good one on
 * its own: the whole keyboard is now readable in one screen, which is what
 * you want when a caller asks "what does X do here".
 *
 * Note that the game keys - the number keys, and the arrows that walk a hand
 * - go through the game registry rather than naming a game
 * (lib/games/registry.ts), so a game added later is playable on the keyboard
 * the day it registers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachKeyBindings = attachKeyBindings;
/** Bind the whole keyboard. Called once, from setupScreen. */
function attachKeyBindings(host) {
    host.screen.key(['C-c'], () => {
        if (host.modalActive)
            return;
        host.exitDoor();
    });
    host.screen.key(['q'], () => {
        if (host.modalActive)
            return;
        // Through the quit ACTION, which asks first and lets a game steal the
        // key (UNO takes Q for CHALLENGE while a challenge window is open).
        host.triggerQuit();
    });
    host.screen.key(['tab'], () => {
        if (host.modalActive)
            return;
        host.cycleFocus(1);
    });
    host.screen.key(['S-tab'], () => {
        if (host.modalActive)
            return;
        host.cycleFocus(-1);
    });
    host.screen.key(['f'], () => {
        if (host.modalActive || host.viewMode !== 'table')
            return;
        host.triggerFold();
    });
    host.screen.key(['x'], () => {
        if (host.modalActive || host.viewMode !== 'table')
            return;
        host.triggerCheck();
    });
    host.screen.key(['c'], () => {
        if (host.modalActive)
            return;
        if (host.viewMode === 'table') {
            host.triggerCall();
        }
        else if (host.viewMode === 'lobby') {
            host.runAction(() => host.tableFlow.createTableFlow());
        }
    });
    host.screen.key(['t'], () => {
        if (host.modalActive)
            return;
        host.runAction(() => host.saySomething());
    });
    host.screen.key(['r'], () => {
        if (host.modalActive)
            return;
        if (host.viewMode === 'table') {
            host.triggerRaise();
        }
        else if (host.viewMode === 'lobby') {
            host.runAction(() => host.manualRefresh());
        }
    });
    // J is NOT bound. The lobby list reads j/k as vi-style down/up, so a J
    // that also joined moved the cursor and joined whatever the cursor had
    // just left. ENTER joins, through the list's own 'select' event.
    host.screen.key(['o'], () => {
        if (host.modalActive || host.viewMode !== 'lobby')
            return;
        host.runAction(() => host.tableFlow.observeSelectedTable());
    });
    host.screen.key(['l'], () => {
        if (host.modalActive || host.viewMode !== 'table')
            return;
        host.runAction(() => host.tableFlow.leaveCurrentTable());
    });
    host.screen.key(['d'], () => {
        if (host.modalActive)
            return;
        if (host.viewMode === 'table') {
            host.runAction(() => host.dealHand());
        }
        else if (host.viewMode === 'lobby') {
            host.runAction(() => host.tableFlow.deleteTableFlow());
        }
    });
    /*
     * Left and right walk the hand; h and l do the same for the vi-handed.
     * The number keys below are a shortcut to the first ten cards, not the
     * only way in - a hand can be longer than ten (2026-09-15).
     */
    /*
   * V: the caller's other cards. A game with two lots of them says what the
   * alternative is (lib/games/types.ts, `toggleView`); games with one ignore
   * the key.
   */
    host.screen.key(['v'], () => {
        if (host.modalActive || host.viewMode !== 'table')
            return;
        const table = host.currentProfile?.currentTableId
            ? host.findTableById(host.currentProfile.currentTableId)
            : null;
        host.gameModuleFor(table)?.toggleView?.();
    });
    /*
     * THE CARD KEYS, and there is one set of them for every game in the lobby.
     *
     * The table the caller is at, and the module that serves it. Every card
     * key goes through here, so a game added later is playable on the keyboard
     * the day it registers - and a change to how cards are picked is made
     * once.
     */
    const atTable = () => {
        if (host.modalActive || host.viewMode !== 'table')
            return undefined;
        const table = host.currentProfile?.currentTableId
            ? host.findTableById(host.currentProfile.currentTableId)
            : null;
        return host.gameModuleFor(table);
    };
    /** The table itself, for the games that answer per phase. */
    const currentTable = () => (host.currentProfile?.currentTableId
        ? host.findTableById(host.currentProfile.currentTableId) ?? null
        : null);
    /**
     * ARROWS WALK THE HAND, always, whatever its length.
     *
     * The number keys reach ten cards; a hand can be twenty ("how do we do
     * when a user has picked up 20 cards?", sysop 2026-09-15), so the arrows
     * are the only way to reach the eleventh and ENTER is the only way to play
     * it. Returning `true` marks the key HANDLED, which stops the screen's own
     * arrow-key focus walk from moving the focus at the same time as the
     * selection - two things moving on one keystroke.
     */
    const walk = (dx, dy = 0) => () => {
        const module = atTable();
        if (!module)
            return;
        // A game arranging two rows takes the arrows itself, in both directions
        // (Skitgubbe's swap). Everything else walks its hand sideways.
        if (module.moveSwap?.(dx, dy))
            return true;
        if (dy !== 0)
            return; // nothing else has an up or down
        module.moveSelection(dx);
        return typeof module.selectedCard === 'function' ? true : undefined;
    };
    host.screen.key(['left', 'h'], walk(-1));
    host.screen.key(['right', 'l'], walk(1));
    host.screen.key(['up', 'k'], walk(0, -1));
    host.screen.key(['down', 'j'], walk(0, 1));
    /**
     * A CARD KEY PICKS, AND THE SAME KEY AGAIN PLAYS.
     *
     * "pressing the hotkey once to select and once more to throw makes more
     * sense" (sysop, 2026-09-15). A game that does not pick one card at a time
     * - patience, where the second key says where the card GOES, or a
     * Skitgubbe swap, where 1-3 then 4-6 is one move - leaves `selectedCard`
     * out and keeps the plain behaviour.
     */
    const pickOrPlay = (index) => () => {
        const module = atTable();
        if (!module)
            return;
        const table = currentTable();
        const picked = table ? module.selectedCard?.(table) ?? null : null;
        if (picked === index)
            module.primaryAction();
        else
            module.selectCard(index);
    };
    for (let key = 1; key <= 9; key += 1)
        host.screen.key([String(key)], pickOrPlay(key - 1));
    host.screen.key(['0'], pickOrPlay(9)); // 0 is the tenth card
    /*
     * ENTER PLAYS THE PICKED CARD. It is handled here rather than left to the
     * focused card widget so that it works whether the caller got to the card
     * with Tab, with the arrows or with a number - and `true` keeps the widget
     * from playing it a second time on the way past.
     */
    host.screen.key(['enter'], () => {
        const module = atTable();
        const table = currentTable();
        if (!module || !table)
            return;
        // A game may want ENTER for something other than playing: Skitgubbe's
        // swap picks a card up with it.
        if (module.toggleHold?.())
            return true;
        const picked = module.selectedCard?.(table) ?? null;
        if (picked === null)
            return;
        module.primaryAction();
        return true;
    });
}
