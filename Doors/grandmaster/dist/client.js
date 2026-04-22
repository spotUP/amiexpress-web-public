"use strict";
/**
 * GRANDMASTER - Hybrid client audio bridge
 *
 * Listens for audio events from the server and plays WAV samples in the browser.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@amiexpress/bbs-door-sdk/client");
const Tone = __importStar(require("tone"));
class GrandmasterAudioClient {
    constructor() {
        this.sfxVolume = 1;
        this.musicVolume = 0.8;
        this.currentMusic = null;
        this.currentToneMusicFile = null; // Track which Tone player is playing music
        this.toneReady = false;
        this.tonePlayers = new Map();
        this.toneLoads = new Map();
        this.socketHandlers = [];
        this.door = new client_1.ClientDoor({
            name: 'Grandmaster',
            version: '1.0.0',
            author: 'AmiExpress',
            description: 'TGM3-inspired multiplayer Tetris audio bridge',
            runtime: 'hybrid',
            hybrid: true,
        });
        // User has already interacted with the page (login), so autoplay is allowed.
        // Initialize Tone.js immediately.
        void this.initTone();
        this.bindSocketEvents();
    }
    bindSocketEvents() {
        const socket = globalThis?.__BBS__?.socket;
        if (!socket || typeof socket.on !== 'function') {
            console.warn('[GrandmasterAudioClient] No Socket.IO connection for audio events');
            return;
        }
        const on = (event, handler) => {
            socket.on(event, handler);
            this.socketHandlers.push([event, handler]);
        };
        on('audio:sfx', (data) => this.playSfx(data));
        on('audio:voice', (data) => this.playVoice(data));
        on('audio:music', (data) => this.playMusic(data));
        on('audio:music:stop', () => this.stopMusic());
        on('audio:music:volume', (data) => {
            if (typeof data?.volume === 'number') {
                this.musicVolume = this.clampVolume(data.volume);
                if (this.currentMusic) {
                    this.currentMusic.volume = this.musicVolume;
                }
            }
        });
        // Clean up listeners when door becomes inactive
        const doorActiveHandler = (active) => {
            if (!active) {
                this.cleanup();
                socket.off('door-active', doorActiveHandler);
            }
        };
        on('door-active', doorActiveHandler);
    }
    cleanup() {
        this.stopMusic();
        const socket = globalThis?.__BBS__?.socket;
        if (socket) {
            for (const [event, handler] of this.socketHandlers) {
                socket.off(event, handler);
            }
        }
        this.socketHandlers = [];
        // Dispose Tone.js players
        for (const player of this.tonePlayers.values()) {
            try {
                player.dispose();
            }
            catch { /* ignore */ }
        }
        this.tonePlayers.clear();
        this.toneLoads.clear();
    }
    playSfx(data) {
        if (!data?.file)
            return;
        const volume = this.clampVolume(typeof data.volume === 'number' ? data.volume : this.sfxVolume);
        void this.playFile(data.file, volume);
    }
    playVoice(data) {
        if (!data?.file)
            return;
        const volume = this.clampVolume(typeof data.volume === 'number' ? data.volume : this.sfxVolume);
        void this.playFile(data.file, volume);
    }
    playMusic(data) {
        if (!data?.file)
            return;
        const volume = this.clampVolume(typeof data.volume === 'number' ? data.volume : this.musicVolume);
        this.stopMusic();
        if (this.toneReady) {
            void this.playToneMusic(data.file, volume, Boolean(data.loop));
            return;
        }
        const audio = new Audio(data.file);
        audio.loop = Boolean(data.loop);
        audio.volume = volume;
        this.currentMusic = audio;
        audio.play().catch(() => {
            /* ignore autoplay failures */
        });
    }
    stopMusic() {
        // Stop HTMLAudioElement music
        if (this.currentMusic) {
            this.currentMusic.pause();
            this.currentMusic.currentTime = 0;
            this.currentMusic = null;
        }
        // Stop Tone.js music player
        if (this.currentToneMusicFile) {
            const player = this.tonePlayers.get(this.currentToneMusicFile);
            if (player) {
                try {
                    player.stop();
                }
                catch {
                    // Player may already be stopped
                }
            }
            this.currentToneMusicFile = null;
        }
    }
    async playFile(file, volume) {
        if (this.toneReady) {
            await this.playToneSample(file, volume);
            return;
        }
        const audio = new Audio(file);
        audio.volume = volume;
        audio.play().catch(() => {
            /* ignore autoplay failures */
        });
    }
    async initTone() {
        if (this.toneReady)
            return;
        try {
            await Tone.start();
            this.toneReady = true;
        }
        catch {
            this.toneReady = false;
        }
    }
    async getTonePlayer(file) {
        const existing = this.tonePlayers.get(file);
        if (existing)
            return existing;
        const pending = this.toneLoads.get(file);
        if (pending)
            return pending;
        const loadPromise = (async () => {
            const player = new Tone.Player().toDestination();
            await player.load(file);
            this.tonePlayers.set(file, player);
            this.toneLoads.delete(file);
            return player;
        })();
        this.toneLoads.set(file, loadPromise);
        return loadPromise;
    }
    async playToneSample(file, volume) {
        try {
            const player = await this.getTonePlayer(file);
            player.volume.value = volume <= 0 ? -Infinity : Tone.gainToDb(volume);
            player.start();
        }
        catch {
            const audio = new Audio(file);
            audio.volume = volume;
            audio.play().catch(() => {
                /* ignore autoplay failures */
            });
        }
    }
    async playToneMusic(file, volume, loop) {
        try {
            const player = await this.getTonePlayer(file);
            player.loop = loop;
            player.volume.value = volume <= 0 ? -Infinity : Tone.gainToDb(volume);
            player.start();
            this.currentToneMusicFile = file; // Track for stopMusic()
        }
        catch {
            const audio = new Audio(file);
            audio.loop = loop;
            audio.volume = volume;
            this.currentMusic = audio;
            audio.play().catch(() => {
                /* ignore autoplay failures */
            });
        }
    }
    clampVolume(value) {
        if (Number.isNaN(value))
            return 0;
        return Math.max(0, Math.min(1, value));
    }
}
// Destroy any previous instance (handles door re-entry without page reload)
const prev = globalThis.__grandmasterAudio;
if (prev && typeof prev.cleanup === 'function') {
    prev.cleanup();
}
const instance = new GrandmasterAudioClient();
globalThis.__grandmasterAudio = instance;
//# sourceMappingURL=client.js.map