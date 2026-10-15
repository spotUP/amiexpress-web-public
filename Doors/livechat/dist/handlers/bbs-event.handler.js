"use strict";
/**
 * BBS Event Handler for LiveChat
 * Listens to BBS system events and displays them in the chat log
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BBSEventHandler = void 0;
const door_theme_1 = require("../door-theme");
class BBSEventHandler {
    constructor(socket) {
        this.socket = socket;
    }
    /**
     * Register callback for BBS events
     */
    onEvent(callback) {
        this.eventCallback = callback;
    }
    /**
     * Start listening to BBS events from server
     */
    listen() {
        this.socket.on('bbs:event', (payload) => {
            // Skip Guest activity — pre-login / unauthenticated sessions
            // cycling through FRONTEND and similar doors have no chat identity
            // and spam the log. Reported 2026-04-24.
            if (payload?.username === 'Guest')
                return;
            if (this.eventCallback) {
                this.eventCallback(payload);
            }
        });
    }
    /**
     * Stop listening to BBS events
     */
    unlisten() {
        this.socket.off('bbs:event');
    }
    /**
     * Escape blessed tags in user-provided content to prevent formatting injection
     */
    escapeBlessedTags(text) {
        return text.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
    }
    /**
     * Format event for display in chat log
     */
    formatEvent(event) {
        const timestamp = new Date(event.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
        switch (event.type) {
            case 'user_login':
                return `{${door_theme_1.T.accent}-fg}[${timestamp}]{/} {${door_theme_1.T.ok}-fg}* ${this.escapeBlessedTags(event.username)}{/} logged in from ${this.escapeBlessedTags(event.data?.location || 'Unknown')} (Node ${event.nodeId})`;
            case 'user_logout':
                const duration = event.data?.duration;
                const durationText = duration ? ` after ${Math.floor(duration / 60)}m ${duration % 60}s` : '';
                return `{${door_theme_1.T.accent}-fg}[${timestamp}]{/} {${door_theme_1.T.accentAlt}-fg}* ${this.escapeBlessedTags(event.username)}{/} logged out${durationText} (Node ${event.nodeId})`;
            case 'upload':
                const uploadSize = event.data?.fileSize ? ` (${(event.data.fileSize / 1024).toFixed(1)}KB)` : '';
                const uploadConf = event.data?.conferenceName ? ` to ${this.escapeBlessedTags(event.data.conferenceName)}` : '';
                return `{${door_theme_1.T.accent}-fg}[${timestamp}]{/} {${door_theme_1.T.bar}-fg}* ${this.escapeBlessedTags(event.username)}{/} uploaded {${door_theme_1.T.ink}-fg}${this.escapeBlessedTags(event.data?.fileName)}${uploadSize}{/}${uploadConf}`;
            case 'download':
                const downloadSize = event.data?.fileSize ? ` (${(event.data.fileSize / 1024).toFixed(1)}KB)` : '';
                const downloadConf = event.data?.conferenceName ? ` from ${this.escapeBlessedTags(event.data.conferenceName)}` : '';
                return `{${door_theme_1.T.accent}-fg}[${timestamp}]{/} {${door_theme_1.T.accentAlt}-fg}* ${this.escapeBlessedTags(event.username)}{/} downloaded {${door_theme_1.T.ink}-fg}${this.escapeBlessedTags(event.data?.fileName)}${downloadSize}{/}${downloadConf}`;
            case 'door_activity':
                const action = event.data?.action === 'entered' ? 'entered' : 'exited';
                const actionColor = action === 'entered' ? 'green-fg' : 'yellow-fg';
                return `{${door_theme_1.T.accent}-fg}[${timestamp}]{/} {${actionColor}}* ${this.escapeBlessedTags(event.username)}{/} ${action} door {${door_theme_1.T.ink}-fg}${this.escapeBlessedTags(event.data?.doorName)}{/}`;
            case 'custom_door_event':
                const doorName = this.escapeBlessedTags(event.data?.doorName || 'Unknown');
                const eventType = event.data?.eventType || 'event';
                const message = this.escapeBlessedTags(event.data?.message || 'No message');
                const username = this.escapeBlessedTags(event.username);
                // Color-code based on event type
                let eventColor = 'white-fg';
                if (eventType === 'score' || eventType === 'score_submitted') {
                    eventColor = 'yellow-fg';
                }
                else if (eventType.includes('create') || eventType.includes('add') || eventType.includes('new')) {
                    eventColor = 'green-fg';
                }
                else if (eventType.includes('delete') || eventType.includes('remove')) {
                    eventColor = 'red-fg';
                }
                else if (eventType.includes('complete') || eventType.includes('done') || eventType.includes('finish')) {
                    eventColor = 'blue-fg';
                }
                else if (eventType.includes('achievement') || eventType.includes('unlock')) {
                    eventColor = 'yellow-fg';
                }
                else if (eventType.includes('update') || eventType.includes('edit') || eventType.includes('move')) {
                    eventColor = 'cyan-fg';
                }
                // Score events get a special trophy prefix
                if (eventType === 'score' || eventType === 'score_submitted') {
                    const pbTag = event.data?.isPersonalBest ? ' {lightgreen-fg}[NEW PB!]{/}' : '';
                    return `{${door_theme_1.T.accent}-fg}[${timestamp}]{/} {${eventColor}}[${doorName}]{/} {${door_theme_1.T.ink}-fg}${username}{/}: ${message}${pbTag}`;
                }
                // Match result events (winner/loser)
                if (eventType === 'match_result') {
                    return `{${door_theme_1.T.accent}-fg}[${timestamp}]{/} {${door_theme_1.T.accentAlt}-fg}[${doorName}]{/} {${door_theme_1.T.ink}-fg}${username}{/} ${message}`;
                }
                return `{${door_theme_1.T.accent}-fg}[${timestamp}]{/} {${eventColor}}[${doorName}]{/} {${door_theme_1.T.ink}-fg}${username}{/}: ${message}`;
            default:
                return `{${door_theme_1.T.accent}-fg}[${timestamp}]{/} {${door_theme_1.T.dim}-fg}* Unknown event: ${event.type}{/}`;
        }
    }
}
exports.BBSEventHandler = BBSEventHandler;
