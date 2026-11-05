"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginModal = void 0;
exports.createLoginModal = createLoginModal;
/**
 * Login Modal for ChatOnly Mode - uses SDK LoginModal widget
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
class LoginModal {
    constructor(options) {
        this.onError = options.onError;
        this.modal = new blessed_1.LoginModal({
            parent: options.screen,
            title: 'LiveChat Login',
            overlay: true,
            overlayOpacity: 0.5,
            zIndex: 9990,
            onSubmit: options.onSubmit,
        });
    }
    showError(message) {
        this.modal.showError(message);
        if (this.onError) {
            this.onError(message);
        }
    }
    hideError() {
        this.modal.hideError();
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
    clearInputs() {
        this.modal.clearInputs();
    }
}
exports.LoginModal = LoginModal;
function createLoginModal(options) {
    return new LoginModal(options);
}
