/**
 * Video API Implementation
 *
 * Provides real-time ASCII video streaming capabilities for doors.
 * Converts video sources (webcam, files, URLs) to ASCII art with 16-color ANSI palette.
 */
export class Video {
    constructor(socket) {
        this.activeStreams = [];
        this.frameHandler = null;
        this.socket = socket;
        this.setupHandlers();
    }
    setupHandlers() {
        this.socket.on('video:streams-update', (streams) => {
            this.activeStreams = streams;
        });
        this.socket.on('video:frame', (data) => {
            if (this.frameHandler) {
                this.frameHandler(data.frame);
            }
        });
    }
    onFrame(handler) {
        this.frameHandler = handler;
    }
    async startStream(source, options) {
        return new Promise((resolve, reject) => {
            this.socket.emit('video:start-stream', { source, options }, (response) => {
                if (response && response.success) {
                    resolve(response.streamId);
                }
                else {
                    reject(new Error(response?.error || 'Failed to start video stream'));
                }
            });
        });
    }
    async stopStream(streamId) {
        return new Promise((resolve, reject) => {
            this.socket.emit('video:stop-stream', { streamId }, (response) => {
                if (response && response.success) {
                    resolve();
                }
                else {
                    reject(new Error(response?.error || 'Failed to stop video stream'));
                }
            });
        });
    }
    async subscribe(streamId) {
        return new Promise((resolve, reject) => {
            this.socket.emit('video:subscribe', { streamId }, (response) => {
                if (response && response.success) {
                    resolve();
                }
                else {
                    reject(new Error(response?.error || 'Failed to subscribe to video stream'));
                }
            });
        });
    }
    async unsubscribe(streamId) {
        return new Promise((resolve) => {
            this.socket.emit('video:unsubscribe', { streamId }, () => {
                resolve();
            });
        });
    }
    async getStreams() {
        return new Promise((resolve) => {
            this.socket.emit('video:get-streams', (streams) => {
                this.activeStreams = streams;
                resolve(streams);
            });
        });
    }
    async pauseStream(streamId) {
        return new Promise((resolve) => {
            this.socket.emit('video:pause-stream', { streamId }, () => {
                resolve();
            });
        });
    }
    async resumeStream(streamId) {
        return new Promise((resolve) => {
            this.socket.emit('video:resume-stream', { streamId }, () => {
                resolve();
            });
        });
    }
}
