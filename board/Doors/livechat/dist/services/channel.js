"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelService = void 0;
/** Channel state manager */
class ChannelService {
    constructor() {
        this.channels = new Map();
        this.current = null;
    }
    /** Set available channels */
    setChannels(list) {
        this.channels.clear();
        for (const ch of list) {
            this.channels.set(ch.id, ch);
        }
    }
    /** Get all channels */
    getAll() {
        return Array.from(this.channels.values());
    }
    /** Get channel by ID */
    get(id) {
        return this.channels.get(id);
    }
    /** Set current channel */
    setCurrent(id) {
        if (this.channels.has(id)) {
            this.current = id;
            return true;
        }
        return false;
    }
    /** Get current channel */
    getCurrent() {
        return this.current ? this.channels.get(this.current) || null : null;
    }
    /** Update member list for channel */
    setMembers(channelId, members) {
        const ch = this.channels.get(channelId);
        if (ch)
            ch.members = members;
    }
}
exports.ChannelService = ChannelService;
