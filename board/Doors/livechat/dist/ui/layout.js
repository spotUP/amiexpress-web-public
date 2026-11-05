"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcLayout = calcLayout;
exports.chatBounds = chatBounds;
exports.sidebarBounds = sidebarBounds;
exports.inputBounds = inputBounds;
/** Calculate layout dimensions */
function calcLayout(screen) {
    const w = screen.width || 80;
    const sidebarWidth = Math.min(20, Math.floor(w * 0.25));
    return {
        screen,
        chatWidth: w - sidebarWidth - 1,
        sidebarWidth,
        inputHeight: 3
    };
}
/** Get chat panel bounds */
function chatBounds(cfg) {
    return {
        top: 0,
        left: 0,
        width: cfg.chatWidth,
        height: '100%-' + cfg.inputHeight
    };
}
/** Get sidebar bounds */
function sidebarBounds(cfg) {
    return {
        top: 0,
        right: 0,
        width: cfg.sidebarWidth,
        height: '100%-' + cfg.inputHeight
    };
}
/** Get input bounds */
function inputBounds(cfg) {
    return {
        bottom: 0,
        left: 0,
        width: '100%',
        height: cfg.inputHeight
    };
}
