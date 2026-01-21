"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisconnectionModal = void 0;
exports.createDisconnectionModal = createDisconnectionModal;
/**
 * Disconnection Modal for ChatOnly Mode - uses SDK ConfirmModal widget
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
class DisconnectionModal {
    constructor(options) {
        this.modal = new blessed_1.ConfirmModal({
            parent: options.screen,
            title: 'Connection Error',
            borderColor: 'red',
            confirmText: '[ Retry ]',
            cancelText: '[ Cancel ]',
            confirmColor: 'green',
            cancelColor: 'red',
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
