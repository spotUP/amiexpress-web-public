"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudioApp = void 0;
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
class StudioApp {
    constructor(ctx) {
        this.screen = null;
        this.inputManager = null;
        this.ctx = ctx;
    }
    async start() {
        this.screen = (0, blessed_helpers_1.createScreen)(this.ctx.bbs, {
            title: 'Sprite Studio',
            responsive: true,
        });
        this.inputManager = new blessed_helpers_1.DoorInputManager(this.ctx, this.screen, {
            enableGameMode: false,
            enableGrabKeys: false,
            enableMouse: true,
        });
        this.screen.key(['q', 'escape', 'C-c'], () => {
            this.destroy();
            void this.ctx.close();
        });
        this.screen.render();
    }
    destroy() {
        if (this.inputManager) {
            this.inputManager.disable();
            this.inputManager = null;
        }
        if (this.screen) {
            this.screen.destroy();
            this.screen = null;
        }
    }
}
exports.StudioApp = StudioApp;
