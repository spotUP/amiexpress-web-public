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
        host.exitDoor();
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
    host.screen.key(['left', 'h'], () => {
        if (host.modalActive || host.viewMode !== 'table')
            return;
        const table = host.currentProfile?.currentTableId
            ? host.findTableById(host.currentProfile.currentTableId)
            : null;
        host.gameModuleFor(table)?.moveSelection(-1);
    });
    host.screen.key(['right', 'l'], () => {
        if (host.modalActive || host.viewMode !== 'table')
            return;
        const table = host.currentProfile?.currentTableId
            ? host.findTableById(host.currentProfile.currentTableId)
            : null;
        host.gameModuleFor(table)?.moveSelection(1);
    });
    // Card selection keys (1-9, 0 for 10th card)
    for (let i = 1; i <= 9; i++) {
        host.screen.key([String(i)], () => {
            if (host.modalActive || host.viewMode !== 'table')
                return;
            const table = host.currentProfile?.currentTableId
                ? host.findTableById(host.currentProfile.currentTableId)
                : null;
            host.gameModuleFor(table)?.selectCard(i - 1); // Convert 1-based to 0-based index
        });
    }
    host.screen.key(['0'], () => {
        if (host.modalActive || host.viewMode !== 'table')
            return;
        const table = host.currentProfile?.currentTableId
            ? host.findTableById(host.currentProfile.currentTableId)
            : null;
        host.gameModuleFor(table)?.selectCard(9); // 0 key = 10th card (index 9)
    });
}
