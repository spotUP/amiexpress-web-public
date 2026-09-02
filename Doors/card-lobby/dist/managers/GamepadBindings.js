"use strict";
/**
 * Card Lobby - gamepad bindings
 *
 * The pad's buttons mean different things at a poker table and at an UNO
 * table, and nothing at all while a dialog is up. That decision table was
 * 110 lines in the middle of setupScreen(), where three of its calls -
 * drawUnoCard(), callUno(), refreshLobby() - named methods that do not
 * exist. The file carried `// @ts-nocheck`, so every one of them was a
 * TypeError waiting for somebody with a gamepad at an UNO table.
 *
 * Out here it is checked, and the host interface says exactly what the pad
 * is allowed to reach.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachGamepadBindings = attachGamepadBindings;
const gamepad_input_manager_1 = require("@amiexpress/bbs-door-sdk/utils/gamepad-input-manager");
/** Wire the pad to the door and hand back the manager to clean up later. */
function attachGamepadBindings(session, host) {
    // Set up gamepad support
    const gamepadManager = new gamepad_input_manager_1.GamepadInputManager(session.socket, {
        deadzone: 0.15,
        pollRate: 16,
    });
    // D-pad navigation
    gamepadManager.on('dpad:up', () => {
        if (host.modalActive)
            return;
        // Simulate up arrow key press
        host.screen.program.emit('keypress', null, { name: 'up' });
    });
    gamepadManager.on('dpad:down', () => {
        if (host.modalActive)
            return;
        // Simulate down arrow key press
        host.screen.program.emit('keypress', null, { name: 'down' });
    });
    gamepadManager.on('dpad:left', () => {
        if (host.modalActive)
            return;
        if (host.viewMode === 'table') {
            host.focusLobby();
        }
    });
    gamepadManager.on('dpad:right', () => {
        if (host.modalActive)
            return;
        if (host.viewMode === 'lobby' && host.currentProfile?.currentTableId) {
            host.focusTable();
        }
    });
    // Button A: Join/Select/Confirm
    gamepadManager.on('button:a', (pressed) => {
        if (!pressed || host.modalActive)
            return;
        if (host.viewMode === 'lobby') {
            // Join selected table
            host.runAction(() => host.joinSelectedTable());
        }
        else if (host.viewMode === 'table') {
            // Trigger action (call/check/fold based on game state)
            const table = host.currentProfile?.currentTableId
                ? host.findTableById(host.currentProfile.currentTableId)
                : null;
            if (table) {
                if (table.gameId === 'poker' || table.gameId === 'poker-house') {
                    host.triggerCall();
                }
                else if (table.gameId === 'uno' || table.gameId === 'uno-house') {
                    // Select the first card in hand; selectUnoCard loads the
                    // game itself and does nothing when there is no game.
                    host.selectUnoCard(0);
                }
            }
        }
    });
    // Button B: Back/Cancel
    gamepadManager.on('button:b', (pressed) => {
        if (!pressed || host.modalActive)
            return;
        if (host.viewMode === 'table') {
            host.runAction(() => host.leaveCurrentTable());
        }
    });
    // Button X: Fold (poker) or Draw card (UNO)
    gamepadManager.on('button:x', (pressed) => {
        if (!pressed || host.modalActive || host.viewMode !== 'table')
            return;
        const table = host.currentProfile?.currentTableId
            ? host.findTableById(host.currentProfile.currentTableId)
            : null;
        if (table) {
            if (table.gameId === 'poker' || table.gameId === 'poker-house') {
                host.triggerFold();
            }
            else if (table.gameId === 'uno' || table.gameId === 'uno-house') {
                host.triggerUnoDrawCard();
            }
        }
    });
    // Button Y: Raise (poker) or Call UNO
    gamepadManager.on('button:y', (pressed) => {
        if (!pressed || host.modalActive || host.viewMode !== 'table')
            return;
        const table = host.currentProfile?.currentTableId
            ? host.findTableById(host.currentProfile.currentTableId)
            : null;
        if (table) {
            if (table.gameId === 'poker' || table.gameId === 'poker-house') {
                host.triggerRaise();
            }
            else if (table.gameId === 'uno' || table.gameId === 'uno-house') {
                host.triggerUnoCallUno();
            }
        }
    });
    // Start button: Refresh lobby
    gamepadManager.on('button:start', (pressed) => {
        if (!pressed || host.modalActive)
            return;
        if (host.viewMode === 'lobby') {
            host.runAction(() => host.manualRefresh());
        }
    });
    return gamepadManager;
}
