"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketEmitter = void 0;
/** Socket event emitter */
class SocketEmitter {
    constructor(socket) { this.s = socket; }
    keystroke(chId, uid, char) {
        this.s?.emit?.('chat:keystroke', { channelId: chId, userId: uid, char });
    }
    keystrokeClear(chId, uid) {
        this.s?.emit?.('chat:keystroke-clear', { channelId: chId, userId: uid });
    }
    keystrokeSubmit(chId, uid) {
        this.s?.emit?.('chat:keystroke-submit', { channelId: chId, userId: uid });
    }
    message(msg) {
        this.s?.emit?.('chat:message', msg);
    }
    messageEdit(msg) {
        this.s?.emit?.('chat:message-edit', msg);
    }
    messageDelete(msgId, chId) {
        this.s?.emit?.('chat:message-delete', { messageId: msgId, channelId: chId });
    }
    threadReply(msg) {
        this.s?.emit?.('chat:thread-reply', msg);
    }
    channelCreated(ch) {
        this.s?.emit?.('chat:channel-created', { channel: ch });
    }
    channelDeleted(chId) {
        this.s?.emit?.('chat:channel-deleted', { channelId: chId });
    }
    channelUpdated(ch) {
        this.s?.emit?.('chat:channel-updated', { channel: ch });
    }
    userJoined(chId, uid, name) {
        this.s?.emit?.('chat:user-joined', { channelId: chId, userId: uid, username: name });
    }
    userLeft(chId, uid, name) {
        this.s?.emit?.('chat:user-left', { channelId: chId, userId: uid, username: name });
    }
    presenceUpdate(status) {
        this.s?.emit?.('chat:presence-update', { status });
    }
}
exports.SocketEmitter = SocketEmitter;
