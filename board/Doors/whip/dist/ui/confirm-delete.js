"use strict";
/**
 * The one delete confirmation this door asks.
 *
 * There were two copies of it - one in the project list, one on the kanban
 * board - each building a raw `blessed.question` box with its own frame,
 * its own colours and no focus trap, which is the shape that produced five
 * separate reports against CARD LOBBY on 2026-09-02. `ConfirmModal` is the
 * SDK's, takes the caller's theme, traps input while it is up, and paints
 * the destructive answer red and the safe one green.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmDelete = confirmDelete;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const door_theme_1 = require("../door-theme");
/**
 * Ask before deleting something.
 *
 * @param kind what is being deleted, lower case - "project", "task"
 * @param name its name, shown in quotes
 */
function confirmDelete(screen, kind, name) {
    return new Promise((resolve) => {
        let settled = false;
        const answer = (value) => {
            if (settled)
                return;
            settled = true;
            // Destroyed, not hidden: this opens once per delete, and ConfirmModal's
            // own close only hides - a hidden modal stays among the screen's
            // children for the rest of the session.
            modal.destroy();
            screen.render();
            resolve(value);
        };
        const modal = new blessed_1.ConfirmModal({
            parent: screen,
            title: `Delete ${kind}`,
            message: `Delete ${kind} "${name}"?`,
            confirmText: '[ Delete ]',
            cancelText: '[ Cancel ]',
            confirmColor: 'red',
            cancelColor: 'green',
            themeStyles: door_theme_1.S,
            onConfirm: () => answer(true),
            onCancel: () => answer(false),
        });
        modal.display();
    });
}
