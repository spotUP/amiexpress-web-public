"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PresenceService = void 0;
const events_1 = require("./events");
/** User presence service */
class PresenceService {
    constructor() {
        this.presence = new Map();
    }
    /** Set user status */
    setStatus(userId, status, custom) {
        const existing = this.presence.get(userId) || {
            userId,
            status: 'offline',
            lastActive: new Date()
        };
        existing.status = status;
        existing.customStatus = custom;
        existing.lastActive = new Date();
        this.presence.set(userId, existing);
        events_1.events.emit('presence:update', existing);
    }
    /** Set user activity */
    setActivity(userId, activity) {
        const existing = this.presence.get(userId);
        if (existing) {
            existing.activity = activity;
            existing.lastActive = new Date();
            events_1.events.emit('presence:activity', existing);
        }
    }
    /** Get user presence */
    get(userId) {
        return this.presence.get(userId);
    }
    /** Get all online users */
    getOnline() {
        const online = [];
        const now = Date.now();
        for (const p of this.presence.values()) {
            if (p.status !== 'offline' && now - p.lastActive.getTime() < 300000) {
                online.push(p);
            }
        }
        return online;
    }
    /** Update last active timestamp */
    touch(userId) {
        const p = this.presence.get(userId);
        if (p)
            p.lastActive = new Date();
    }
    /** Set user offline */
    setOffline(userId) {
        this.setStatus(userId, 'offline');
    }
    /** Count by status */
    countByStatus() {
        const counts = {
            online: 0, away: 0, dnd: 0, invisible: 0, offline: 0
        };
        for (const p of this.presence.values()) {
            counts[p.status]++;
        }
        return counts;
    }
}
exports.PresenceService = PresenceService;
