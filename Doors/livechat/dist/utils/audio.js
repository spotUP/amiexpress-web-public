"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOUNDS = exports.AudioService = void 0;
const sounds_1 = require("./sounds");
Object.defineProperty(exports, "SOUNDS", { enumerable: true, get: function () { return sounds_1.SOUNDS; } });
/**
 * Audio service for hybrid door
 *
 * In hybrid mode, audio is played client-side. This service
 * emits socket events that the client.ts listens to and plays.
 */
class AudioService {
    constructor(socket) {
        this.enabled = true;
        this.mentionEnabled = true;
        this.socket = socket;
    }
    setEnabled(enabled) {
        this.enabled = enabled;
        // Notify client of enabled state change
        this.socket?.emit('audio:set-enabled', { enabled });
    }
    setMentionEnabled(enabled) {
        this.mentionEnabled = enabled;
    }
    setVolume(volume) {
        this.socket?.emit('audio:set-volume', { volume });
    }
    /** Play a library sound effect via client */
    playSound(name, params = {}) {
        if (!this.enabled)
            return;
        // Emit to client for playback
        this.socket?.emit('audio:play', { soundId: name, params });
    }
    /** Play a raw note (fallback) */
    play(name) {
        if (!this.enabled)
            return;
        if (name === 'mention' && !this.mentionEnabled)
            return;
        const sound = sounds_1.SOUNDS[name];
        if (!sound)
            return;
        // For hybrid, we just emit the sound name
        // Client will handle the actual synthesis
        this.playSound(name);
    }
    onMessage(isMention) {
        if (isMention) {
            this.playSound('mention');
        }
        else {
            this.playSound('message');
        }
    }
    onJoin() { this.playSound('join'); }
    onLeave() { this.playSound('leave'); }
    onError() { this.playSound('error'); }
    onNotification() { this.playSound('notification'); }
    onReaction() { this.playSound('confirm'); }
    onDM() { this.playSound('notification'); }
}
exports.AudioService = AudioService;
