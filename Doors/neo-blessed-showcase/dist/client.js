"use strict";
/**
 * Neo-Blessed Showcase - Hybrid Door Client Component
 *
 * This client runs in the browser and handles:
 * - Audio capture via Web Audio API for the Mic Demo
 * - Audio level calculation (RMS)
 *
 * The UI is rendered server-side via neo-blessed.
 * This client only handles audio for the mic demo.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@amiexpress/bbs-door-sdk/client");
// =============================================================================
// Showcase Client
// =============================================================================
class ShowcaseClient {
    constructor() {
        // Audio capture state
        this.mediaStream = null;
        this.audioContext = null;
        this.analyserNode = null;
        this.sourceNode = null;
        // State
        this.isStreaming = false;
        this.levelInterval = null;
        this.door = new client_1.ClientDoor({
            name: 'Neo-Blessed Showcase',
            version: '2.0.0',
            author: 'AmiExpress SDK',
            description: 'Widget showcase with Web Audio',
            runtime: 'hybrid',
            hybrid: true,
        });
        this.setupEventHandlers();
        this.setupUserGestureHandler();
    }
    /**
     * Browser autoplay policy requires user gesture to start audio.
     */
    setupUserGestureHandler() {
        const initOnGesture = async () => {
            if (this.audioContext)
                return;
            try {
                this.audioContext = new AudioContext();
                console.log('[ShowcaseClient] AudioContext initialized on user gesture');
            }
            catch (error) {
                console.error('[ShowcaseClient] AudioContext init failed:', error);
            }
            document.removeEventListener('keydown', initOnGesture);
            document.removeEventListener('click', initOnGesture);
            document.removeEventListener('touchstart', initOnGesture);
        };
        document.addEventListener('keydown', initOnGesture, { once: false });
        document.addEventListener('click', initOnGesture, { once: false });
        document.addEventListener('touchstart', initOnGesture, { once: false });
    }
    setupEventHandlers() {
        // Handle start streaming command from server (mic demo)
        this.door.on('audio:start-streaming', async (data) => {
            console.log('[ShowcaseClient] Received start-streaming command:', data);
            await this.startCapture(data.options || {});
        });
        // Handle stop streaming command from server
        this.door.on('audio:stop-streaming', async () => {
            console.log('[ShowcaseClient] Received stop-streaming command');
            await this.stopCapture();
        });
        // Handle door lifecycle
        this.door.on('connect', () => {
            console.log('[ShowcaseClient] Connected to server');
        });
        this.door.on('disconnect', () => {
            console.log('[ShowcaseClient] Disconnected from server');
            this.stopCapture();
        });
    }
    /**
     * Start audio capture for mic demo
     */
    async startCapture(options) {
        if (this.isStreaming) {
            console.log('[ShowcaseClient] Already streaming');
            return;
        }
        try {
            // Initialize AudioContext if not already done
            if (!this.audioContext) {
                this.audioContext = new AudioContext();
            }
            // Resume context if suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: options.sampleRate || 44100,
                    channelCount: options.channels || 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: false,
            });
            console.log('[ShowcaseClient] Got media stream:', this.mediaStream.id);
            // Create audio nodes for level analysis
            this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 256;
            this.analyserNode.smoothingTimeConstant = 0.8;
            this.sourceNode.connect(this.analyserNode);
            this.isStreaming = true;
            // Start audio level monitoring
            this.startLevelMonitoring();
            // Notify server that streaming started
            this.door.emit('audio:started');
            console.log('[ShowcaseClient] Audio capture started');
        }
        catch (error) {
            console.error('[ShowcaseClient] Failed to start capture:', error);
            this.door.emit('audio:error', { message: error.message });
        }
    }
    /**
     * Stop audio capture
     */
    async stopCapture() {
        if (!this.isStreaming)
            return;
        // Stop level monitoring
        this.stopLevelMonitoring();
        // Disconnect audio nodes
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        this.analyserNode = null;
        // Stop media stream tracks
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((track) => track.stop());
            this.mediaStream = null;
        }
        this.isStreaming = false;
        // Notify server
        this.door.emit('audio:stopped');
        console.log('[ShowcaseClient] Audio capture stopped');
    }
    /**
     * Start monitoring audio levels and send updates
     */
    startLevelMonitoring() {
        if (this.levelInterval)
            return;
        const dataArray = new Uint8Array(this.analyserNode?.frequencyBinCount || 128);
        this.levelInterval = setInterval(() => {
            if (!this.analyserNode || !this.isStreaming)
                return;
            // Get frequency data
            this.analyserNode.getByteFrequencyData(dataArray);
            // Calculate RMS (root mean square) for audio level
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const normalized = dataArray[i] / 255;
                sum += normalized * normalized;
            }
            const rms = Math.sqrt(sum / dataArray.length);
            // Get time domain data for waveform
            const waveformData = new Uint8Array(this.analyserNode.fftSize);
            this.analyserNode.getByteTimeDomainData(waveformData);
            const waveform = Array.from(waveformData.slice(0, 30)).map((v) => (v - 128) / 128);
            // Send audio levels to server
            const levels = {
                input: rms,
                output: 0,
                waveform,
            };
            this.door.emit('audio:levels', levels);
        }, 100); // 10 updates per second (matches mic demo interval)
    }
    /**
     * Stop monitoring audio levels
     */
    stopLevelMonitoring() {
        if (this.levelInterval) {
            clearInterval(this.levelInterval);
            this.levelInterval = null;
        }
    }
    start() {
        this.door.start();
        console.log('[ShowcaseClient] Started - listening for audio commands');
    }
}
// =============================================================================
// Entry Point
// =============================================================================
const client = new ShowcaseClient();
client.start();
//# sourceMappingURL=client.js.map