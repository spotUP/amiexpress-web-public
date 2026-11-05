"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtendedEventBus = void 0;
const event_bus_1 = require("./event-bus");
/** Extended BBS Event Bus methods */
class ExtendedEventBus extends event_bus_1.BBSEventBus {
    /** Door entered */
    doorEnter(userId, username, doorName) {
        this.emit({ type: 'door_enter', userId, username, details: { doorName }, visibility: 'all', timestamp: new Date() });
    }
    /** Door exited */
    doorExit(userId, username, doorName) {
        this.emit({ type: 'door_exit', userId, username, details: { doorName }, visibility: 'all', timestamp: new Date() });
    }
    /** New message posted */
    newMessage(userId, username, conference) {
        this.emit({ type: 'new_message', userId, username, details: { conference }, visibility: 'all', timestamp: new Date() });
    }
    /** Sysop paged */
    pageSysop(userId, username) {
        this.emit({ type: 'page_sysop', userId, username, details: {}, visibility: 'all', timestamp: new Date() });
    }
    /** Conference joined */
    conferenceJoin(userId, username, conference) {
        this.emit({ type: 'conference_join', userId, username, details: { conference }, visibility: 'all', timestamp: new Date() });
    }
    /** Download completed */
    downloadComplete(userId, username, filename) {
        this.emit({ type: 'download_complete', userId, username, details: { filename }, visibility: 'all', timestamp: new Date() });
    }
    /** Node activity */
    nodeActivity(nodeId, status) {
        this.emit({ type: 'node_activity', nodeId, details: { status }, visibility: 'all', timestamp: new Date() });
    }
    /** System announcement */
    announce(message) {
        this.emit({ type: 'system_announcement', details: { message }, visibility: 'all', timestamp: new Date() });
    }
}
exports.ExtendedEventBus = ExtendedEventBus;
