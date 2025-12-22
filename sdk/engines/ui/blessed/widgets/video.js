/**
 * Video - Video playback widget (browser-compatible placeholder)
 */
import { Box } from './box';
export class Video extends Box {
    constructor(options = {}) {
        const { src, file, autoPlay, loop, controls, muted, ...boxOptions } = options;
        super({
            ...boxOptions,
            width: options.width || 60,
            height: options.height || 20,
            border: options.border !== undefined ? options.border : { type: 'line' },
        });
        this.src = '';
        this.playing = false;
        this.currentTime = 0;
        this.duration = 0;
        this.autoPlay = autoPlay || false;
        this.loop = loop || false;
        this.controls = controls !== false;
        this.muted = muted || false;
        if (src) {
            this.setSource(src);
        }
        else if (file) {
            this.setSource(file);
        }
        // Setup controls if enabled
        if (this.controls) {
            this.setupControls();
        }
    }
    /**
     * Setup keyboard controls
     */
    setupControls() {
        this.enableKeys();
        this.key(['space'], () => {
            this.togglePlay();
        });
        this.key(['left'], () => {
            this.seek(-5);
        });
        this.key(['right'], () => {
            this.seek(5);
        });
        this.key(['m'], () => {
            this.toggleMute();
        });
        this.key(['f'], () => {
            this.emit('fullscreen');
        });
    }
    /**
     * Set video source
     */
    setSource(src) {
        this.src = src;
        this.currentTime = 0;
        this.playing = false;
        this.updateDisplay();
        this.emit('load', src);
        if (this.autoPlay) {
            this.play();
        }
    }
    /**
     * Update display
     */
    updateDisplay() {
        const w = typeof this.width === 'number' ? this.width : 60;
        const h = typeof this.height === 'number' ? this.height : 20;
        const lines = [];
        // Video frame placeholder
        for (let i = 0; i < h - 3; i++) {
            lines.push(' '.repeat(w));
        }
        // Video info
        const info = `[${this.playing ? 'Playing' : 'Paused'}] ${this.formatTime(this.currentTime)} / ${this.formatTime(this.duration)}`;
        const padding = Math.floor((w - info.length) / 2);
        lines.push(' '.repeat(padding) + info);
        // Controls
        if (this.controls) {
            const controlsText = `[Space] Play/Pause  [←→] Seek  [M] Mute  [F] Fullscreen`;
            const controlsPadding = Math.floor((w - controlsText.length) / 2);
            lines.push(' '.repeat(controlsPadding) + controlsText);
        }
        this.setContent(lines.join('\n'));
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Format time in MM:SS
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    /**
     * Play video
     */
    play() {
        this.playing = true;
        this.updateDisplay();
        this.emit('play');
    }
    /**
     * Pause video
     */
    pause() {
        this.playing = false;
        this.updateDisplay();
        this.emit('pause');
    }
    /**
     * Toggle play/pause
     */
    togglePlay() {
        if (this.playing) {
            this.pause();
        }
        else {
            this.play();
        }
    }
    /**
     * Stop video
     */
    stop() {
        this.playing = false;
        this.currentTime = 0;
        this.updateDisplay();
        this.emit('stop');
    }
    /**
     * Seek by offset
     */
    seek(offset) {
        this.currentTime = Math.max(0, Math.min(this.duration, this.currentTime + offset));
        this.updateDisplay();
        this.emit('seek', this.currentTime);
    }
    /**
     * Seek to time
     */
    seekTo(time) {
        this.currentTime = Math.max(0, Math.min(this.duration, time));
        this.updateDisplay();
        this.emit('seek', this.currentTime);
    }
    /**
     * Get current time
     */
    getCurrentTime() {
        return this.currentTime;
    }
    /**
     * Get duration
     */
    getDuration() {
        return this.duration;
    }
    /**
     * Set duration
     */
    setDuration(duration) {
        this.duration = duration;
        this.updateDisplay();
    }
    /**
     * Check if playing
     */
    isPlaying() {
        return this.playing;
    }
    /**
     * Check if muted
     */
    isMuted() {
        return this.muted;
    }
    /**
     * Mute audio
     */
    mute() {
        this.muted = true;
        this.emit('mute');
    }
    /**
     * Unmute audio
     */
    unmute() {
        this.muted = false;
        this.emit('unmute');
    }
    /**
     * Toggle mute
     */
    toggleMute() {
        if (this.muted) {
            this.unmute();
        }
        else {
            this.mute();
        }
    }
    /**
     * Get video source
     */
    getSource() {
        return this.src;
    }
    /**
     * Set loop mode
     */
    setLoop(loop) {
        this.loop = loop;
    }
    /**
     * Check if looping
     */
    isLooping() {
        return this.loop;
    }
}
