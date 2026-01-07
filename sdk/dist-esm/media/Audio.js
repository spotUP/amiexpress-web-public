/**
 * Audio API Implementation
 *
 * Provides real-time audio streaming capabilities for doors.
 * This implementation acts as a proxy that communicates with the client
 * via Socket.IO events to trigger microphone capture and playback.
 */
export class Audio {
    constructor(socket, roomId) {
        this.currentRoomId = null;
        this.activeStreams = [];
        this.audioLevels = { input: 0, output: 0 };
        this.muted = false;
        this.volume = 1.0;
        this.socket = socket;
        this.currentRoomId = roomId || null;
        this.setupHandlers();
    }
    setupHandlers() {
        // Listen for audio-related events from the client/server
        this.socket.on('audio:speaking-status', (data) => {
            this.activeStreams = data;
        });
        this.socket.on('audio:levels', (data) => {
            this.audioLevels = data;
        });
    }
    async startStreaming(options) {
        return new Promise((resolve, reject) => {
            this.socket.emit('audio:start-streaming', options, (response) => {
                if (response && response.success) {
                    resolve(response.streamId);
                }
                else {
                    reject(new Error(response?.error || 'Failed to start audio streaming'));
                }
            });
        });
    }
    async stopStreaming() {
        return new Promise((resolve) => {
            this.socket.emit('audio:stop-streaming', () => {
                resolve();
            });
        });
    }
    getActiveStreams() {
        return this.activeStreams;
    }
    setMuted(muted) {
        this.muted = muted;
        this.socket.emit('audio:mute', { muted });
    }
    setVolume(volume) {
        this.volume = volume;
        this.socket.emit('audio:volume', { volume });
    }
    getAudioLevels() {
        return this.audioLevels;
    }
    async subscribe(userId) {
        return new Promise((resolve, reject) => {
            this.socket.emit('audio:subscribe', { userId }, (response) => {
                if (response && response.success) {
                    resolve();
                }
                else {
                    reject(new Error(response?.error || 'Failed to subscribe to audio stream'));
                }
            });
        });
    }
    async unsubscribe(userId) {
        return new Promise((resolve) => {
            this.socket.emit('audio:unsubscribe', { userId }, () => {
                resolve();
            });
        });
    }
}
