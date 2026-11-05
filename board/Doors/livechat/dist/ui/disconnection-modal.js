"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisconnectionModal = void 0;
exports.createDisconnectionModal = createDisconnectionModal;
/**
 * Disconnection Modal for ChatOnly Mode - uses SDK ConfirmModal widget
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const theme_1 = require("./theme");
const door_theme_1 = require("../door-theme");
class DisconnectionModal {
    constructor(options) {
        this.modal = new blessed_1.ConfirmModal({
            parent: options.screen,
            title: 'Connection Error',
            borderColor: theme_1.PANEL_BORDER,
            confirmText: '[ Retry ]',
            cancelText: '[ Cancel ]',
            // Semantic, and therefore tokens rather than the primary colour: a
            // Cancel button that matched every border would stop reading as the
            // way out. The theme still owns the two shades.
            confirmColor: door_theme_1.T.ok,
            cancelColor: door_theme_1.T.alert,
            overlay: true,
            overlayOpacity: 0.5,
            zIndex: 9990,
            onConfirm: () => {
                options.onRetry();
            },
            onCancel: () => {
                options.onCancel();
            },
        });
    }
    showError(message) {
        this.modal.setMessage(message);
        this.modal.display();
    }
    show() {
        this.modal.display();
    }
    hide() {
        this.modal.hide();
    }
    destroy() {
        this.modal.destroy();
    }
}
exports.DisconnectionModal = DisconnectionModal;
function createDisconnectionModal(options) {
    return new DisconnectionModal(options);
}
