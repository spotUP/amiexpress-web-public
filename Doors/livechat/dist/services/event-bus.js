"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BBSEventBus = void 0;
const events_1 = require("./events");
/** BBS Event Bus - broadcasts system events to chat */
class BBSEventBus {
    constructor(socket) {
        this.socket = socket;
    }
    /** Emit a BBS event */
    emit(event) {
        events_1.events.emit('bbs:event', event);
        if (this.socket) {
            this.socket.send('bbs:event', event);
        }
    }
    /** User logged in */
    userLogin(userId, username, nodeId) {
        this.emit({
            type: 'user_login',
            userId, username, nodeId,
            details: {},
            visibility: 'all',
            timestamp: new Date()
        });
    }
    /** User logged out */
    userLogout(userId, username) {
        this.emit({
            type: 'user_logout',
            userId, username,
            details: {},
            visibility: 'all',
            timestamp: new Date()
        });
    }
    /** Upload started */
    uploadStart(userId, username, filename, size) {
        this.emit({
            type: 'upload_start',
            userId, username,
            details: { filename, size },
            visibility: 'all',
            timestamp: new Date()
        });
    }
    /** Upload completed */
    uploadComplete(userId, username, filename, area) {
        this.emit({
            type: 'upload_complete',
            userId, username,
            details: { filename, area },
            visibility: 'all',
            timestamp: new Date()
        });
    }
    /** Download started */
    downloadStart(userId, username, filename) {
        this.emit({
            type: 'download_start',
            userId, username,
            details: { filename },
            visibility: 'all',
            timestamp: new Date()
        });
    }
}
exports.BBSEventBus = BBSEventBus;
