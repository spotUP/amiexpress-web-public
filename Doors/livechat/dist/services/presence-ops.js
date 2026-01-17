"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PresenceOps = void 0;
/** Presence operations with DB persistence */
class PresenceOps {
    constructor(repo, socket, userId) {
        this.repo = repo;
        this.socket = socket;
        this.userId = userId;
    }
    /** Set user online */
    async setOnline() {
        await this.repo.set(this.userId, 'online');
        this.socket?.emit?.('chat:presence-update', {
            userId: this.userId, status: 'online'
        });
    }
    /** Set user away */
    async setAway(message) {
        await this.repo.set(this.userId, 'away', message);
        this.socket?.emit?.('chat:presence-update', {
            userId: this.userId, status: 'away', custom: message
        });
    }
    /** Set user status */
    async setStatus(status, custom) {
        await this.repo.set(this.userId, status, custom);
        this.socket?.emit?.('chat:presence-update', {
            userId: this.userId, status, custom
        });
    }
    /** Set activity (playing game, etc) */
    async setActivity(activity) {
        await this.repo.setActivity(this.userId, activity);
        this.socket?.emit?.('chat:activity-update', {
            userId: this.userId, activity
        });
    }
    /** Set user offline */
    async setOffline() {
        await this.repo.setOffline(this.userId);
        this.socket?.emit?.('chat:presence-update', {
            userId: this.userId, status: 'offline'
        });
    }
}
exports.PresenceOps = PresenceOps;
