"use strict";
/**
 * Voice Chat Door - Hybrid Door Server Component
 *
 * This is the server-side component that:
 * - Renders the neo-blessed UI
 * - Sends audio commands to the browser client
 * - Receives audio level updates from the client
 *
 * The client.ts component handles actual Web Audio:
 * - Microphone capture via getUserMedia
 * - Opus encoding via MediaRecorder
 * - Audio playback of other users
 *
 * Communication flow:
 * - Server emits 'audio:start-streaming' -> Client starts capture
 * - Server emits 'audio:stop-streaming' -> Client stops capture
 * - Server emits 'audio:mute' -> Client mutes/unmutes
 * - Client emits 'audio:levels' -> Server updates UI
 * - Client emits 'voice:speaking' -> Backend broadcasts to room
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
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const blessed_1 = __importStar(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const bbs_door_sdk_2 = require("@amiexpress/bbs-door-sdk");
const door_theme_1 = require("./door-theme");
const door = new bbs_door_sdk_1.CoreDoor({
    name: 'Voice Chat',
    version: '1.0.0',
    author: 'AmiExpress Team',
    description: 'Multi-party voice chat with real-time audio streaming',
});
door.onStart(async (ctx) => {
    // The board's theme, before any widget reads a colour from it.
    (0, door_theme_1.applyTheme)(ctx.bbs);
    // Create blessed screen using SDK helper (connects output to BBS socket)
    const screen = (0, bbs_door_sdk_1.createScreen)(ctx.bbs, {
        title: 'Voice Chat',
    });
    screen.program.write('\x1b[2J');
    screen.program.write('\x1b[H');
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();
    // Setup input handler to route terminal input to blessed
    const bbsSession = ctx.bbsSession;
    if (bbsSession) {
        bbsSession.doorInputHandler = (data) => {
            screen.program.emit('data', data);
            return true;
        };
    }
    // Main container
    const mainBox = blessed_1.default.box({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%-4',
        style: {
            fg: door_theme_1.T.ink,
            bg: door_theme_1.T.ground,
        },
    });
    // Title bar
    const titleBar = blessed_1.default.box({
        parent: mainBox,
        top: 0,
        left: 0,
        width: '100%',
        height: 3,
        content: `{center}{${door_theme_1.T.accent}-fg}{bold}Voice Chat with Adaptive Quality{/bold}{/${door_theme_1.T.accent}-fg}{/center}\n` +
            `{center}{${door_theme_1.T.ink}-fg}S:Start  M:Mute  A:Auto-Quality  +/-:Quality  Q:Quit{/${door_theme_1.T.ink}-fg}{/center}`,
        style: {
            fg: door_theme_1.T.ink,
            bg: door_theme_1.T.ground,
            border: {
                fg: door_theme_1.T.accent,
            },
        },
        border: {
            type: 'line',
        },
    });
    // Active speakers panel
    const speakersBox = blessed_1.default.box({
        parent: mainBox,
        top: 3,
        left: 1,
        width: '50%-1',
        height: '100%-6',
        style: {
            fg: door_theme_1.T.ink,
            bg: door_theme_1.T.ground,
            border: {
                fg: door_theme_1.T.ok,
            },
        },
        border: {
            type: 'line',
        },
        label: ' Active Speakers ',
        content: `{${door_theme_1.T.accentAlt}-fg}No speakers connected{/${door_theme_1.T.accentAlt}-fg}`,
        scrollable: true,
        alwaysScroll: true,
        scrollbar: {
            ch: ' ',
            style: {
                bg: door_theme_1.T.dim,
            },
        },
    });
    // Waveform visualization panel
    const waveformBox = blessed_1.default.box({
        parent: mainBox,
        top: 3,
        left: '50%',
        width: '50%-1',
        height: 15,
        style: {
            fg: door_theme_1.T.ink,
            bg: door_theme_1.T.ground,
            border: {
                fg: door_theme_1.T.accentAlt,
            },
        },
        border: {
            type: 'line',
        },
        label: ' Your Audio Level ',
        content: `{${door_theme_1.T.accentAlt}-fg}Not streaming{/${door_theme_1.T.accentAlt}-fg}`,
    });
    // Status panel
    const statusBox = blessed_1.default.box({
        parent: mainBox,
        top: 18,
        left: '50%',
        width: '50%-1',
        height: 6,
        style: {
            fg: door_theme_1.T.ink,
            bg: door_theme_1.T.ground,
            border: {
                fg: door_theme_1.T.accentAlt,
            },
        },
        border: {
            type: 'line',
        },
        label: ' Status ',
        content: `{${door_theme_1.T.accentAlt}-fg}Ready to start{/${door_theme_1.T.accentAlt}-fg}`,
    });
    // Network quality panel
    const networkBox = blessed_1.default.box({
        parent: mainBox,
        top: 24,
        left: '50%',
        width: '50%-1',
        height: 7,
        style: {
            fg: door_theme_1.T.ink,
            bg: door_theme_1.T.ground,
            border: {
                fg: door_theme_1.T.ok,
            },
        },
        border: {
            type: 'line',
        },
        label: ' Network Quality ',
        content: `{${door_theme_1.T.accentAlt}-fg}Monitoring not started{/${door_theme_1.T.accentAlt}-fg}`,
    });
    // Quality profile panel
    const qualityBox = blessed_1.default.box({
        parent: mainBox,
        top: 31,
        left: '50%',
        width: '50%-1',
        height: 8,
        style: {
            fg: door_theme_1.T.ink,
            bg: door_theme_1.T.ground,
            border: {
                fg: door_theme_1.T.accentAlt,
            },
        },
        border: {
            type: 'line',
        },
        label: ' Quality Profile ',
        content: `{${door_theme_1.T.accentAlt}-fg}Not streaming{/${door_theme_1.T.accentAlt}-fg}`,
    });
    // Controls info panel
    const controlsBox = blessed_1.default.box({
        parent: mainBox,
        top: 39,
        left: '50%',
        width: '50%-1',
        height: '100%-42',
        style: {
            fg: door_theme_1.T.ink,
            bg: door_theme_1.T.ground,
            border: {
                fg: door_theme_1.T.accent,
            },
        },
        border: {
            type: 'line',
        },
        label: ' Controls ',
        content: `{${door_theme_1.T.accent}-fg}[S]{/${door_theme_1.T.accent}-fg} Start/Stop Streaming\n` +
            `{${door_theme_1.T.accent}-fg}[M]{/${door_theme_1.T.accent}-fg} Mute/Unmute\n` +
            `{${door_theme_1.T.accent}-fg}[A]{/${door_theme_1.T.accent}-fg} Toggle Auto-Quality\n` +
            `{${door_theme_1.T.accent}-fg}[+/-]{/${door_theme_1.T.accent}-fg} Manual Quality\n` +
            `{${door_theme_1.T.accent}-fg}[L]{/${door_theme_1.T.accent}-fg} List Active Speakers\n\n` +
            `{${door_theme_1.T.alert}-fg}[Q]{/${door_theme_1.T.alert}-fg} Quit Voice Chat`,
    });
    // Footer help bar
    const footerBox = blessed_1.default.box({
        parent: screen,
        bottom: 0,
        left: 0,
        width: '100%',
        height: 4,
        style: {
            fg: door_theme_1.T.ground,
            bg: door_theme_1.T.accent,
        },
        content: `{center}{bold}Real-Time Voice Chat{/bold}{/center}\n` +
            `{center}Opus Codec - 48kHz - Voice Activity Detection{/center}\n` +
            `{center}Client-side audio processing for optimal server performance{/center}`,
    });
    screen.render();
    // Initialize network monitoring and adaptive quality
    const networkMonitor = new bbs_door_sdk_2.NetworkQualityMonitor(ctx.socket);
    const qualityManager = new bbs_door_sdk_2.AdaptiveQualityManager(networkMonitor);
    // App state
    const state = {
        screen,
        mainBox,
        speakersBox,
        waveformBox,
        statusBox,
        controlsBox,
        networkBox,
        qualityBox,
        isStreaming: false,
        isMuted: false,
        speakers: new Map(),
        myUserId: ctx.user.id,
        myAudioLevel: 0,
        networkMonitor,
        qualityManager,
    };
    // Start network monitoring
    networkMonitor.start();
    // Listen for network quality updates
    networkMonitor.on('metrics-update', (metrics) => {
        state.currentMetrics = metrics;
        updateNetworkDisplay(state);
    });
    networkMonitor.on('recommendation', (rec) => {
        state.currentRecommendation = rec;
        updateNetworkDisplay(state);
    });
    // Listen for quality changes
    qualityManager.on('quality-change', (event) => {
        updateQualityDisplay(state);
        updateStatus(state, `{${door_theme_1.T.accent}-fg}Quality changed to ${event.type}: ${event.to}{/${door_theme_1.T.accent}-fg}\n` +
            `Reason: ${event.reason}\n` +
            `Auto: ${event.automatic ? 'Yes' : 'No'}`);
    });
    // Handle audio events via Socket.IO
    // In hybrid mode, the client.ts handles Web Audio and emits events back
    if (ctx.socket) {
        // Stream started by other users
        ctx.socket.on('audio-stream-started', (data) => {
            if (data.userId !== state.myUserId) {
                state.speakers.set(data.userId, {
                    userId: data.userId,
                    username: data.username,
                    isSpeaking: false,
                    audioLevel: 0,
                    lastUpdate: Date.now(),
                });
                updateSpeakersList(state);
                updateStatus(state, `{${door_theme_1.T.ok}-fg}${data.username} joined the chat{/${door_theme_1.T.ok}-fg}`);
            }
        });
        // Stream stopped by other users
        ctx.socket.on('audio-stream-stopped', (data) => {
            if (data.userId !== state.myUserId) {
                const speaker = state.speakers.get(data.userId);
                if (speaker) {
                    state.speakers.delete(data.userId);
                    updateSpeakersList(state);
                    updateStatus(state, `{${door_theme_1.T.accentAlt}-fg}${speaker.username} left the chat{/${door_theme_1.T.accentAlt}-fg}`);
                }
            }
        });
        // Speaking status updates from other users (relayed by backend)
        ctx.socket.on('audio-speaking-status', (data) => {
            if (data.userId !== state.myUserId) {
                const speaker = state.speakers.get(data.userId);
                if (speaker) {
                    speaker.isSpeaking = data.isSpeaking;
                    speaker.audioLevel = data.audioLevel;
                    speaker.lastUpdate = Date.now();
                    updateSpeakersList(state);
                }
            }
        });
        // Audio levels from OUR client.ts (browser side)
        // The client calculates RMS from Web Audio and sends it here
        ctx.socket.on('audio:levels', (levels) => {
            if (state.isStreaming) {
                state.myAudioLevel = levels.input;
                updateWaveform(state, levels);
            }
        });
        // Audio error from client
        ctx.socket.on('audio:error', (data) => {
            updateStatus(state, `{${door_theme_1.T.alert}-fg}Audio Error: ${data.message}{/${door_theme_1.T.alert}-fg}`);
        });
        // Update speaker list periodically (remove stale entries)
        setInterval(() => {
            const now = Date.now();
            for (const [userId, speaker] of state.speakers.entries()) {
                if (now - speaker.lastUpdate > 5000) {
                    state.speakers.delete(userId);
                    updateSpeakersList(state);
                }
            }
        }, 1000);
    }
    // Key handlers
    screen.key(['s', 'S'], async () => {
        await toggleStreaming(ctx, state);
    });
    screen.key(['m', 'M'], async () => {
        await toggleMute(ctx, state);
    });
    screen.key(['a', 'A'], () => {
        toggleAutoQuality(state);
    });
    screen.key(['+', '='], () => {
        adjustQuality(state, 'up');
    });
    screen.key(['-', '_'], () => {
        adjustQuality(state, 'down');
    });
    screen.key(['l', 'L'], () => {
        listActiveSpeakers(ctx, state);
    });
    screen.key(['q', 'Q', 'escape'], () => {
        screen.destroy();
    });
    // Focus management
    screen.focusPush(mainBox);
    // Keep the door running until closed
    await new Promise((resolve) => screen.on('destroy', resolve));
});
door.onClose(async (ctx) => {
    // Cleanup: Stop audio streaming by emitting to client
    if (ctx.socket) {
        try {
            ctx.socket.emit('audio:stop-streaming');
        }
        catch (error) {
            // Ignore cleanup errors
        }
    }
    // Stop network monitoring
    const state = ctx.state;
    if (state?.networkMonitor) {
        state.networkMonitor.stop();
    }
    // Clear input handler
    const bbsSession = ctx.bbsSession;
    if (bbsSession) {
        delete bbsSession.doorInputHandler;
    }
});
// Helper functions
function updateStatus(state, message) {
    if (state.statusBox) {
        const timestamp = new Date().toLocaleTimeString();
        state.statusBox.setContent(`[${timestamp}]\n${message}`);
        state.screen.render();
    }
}
function updateSpeakersList(state) {
    if (!state.speakersBox) {
        return;
    }
    const speakers = Array.from(state.speakers.values());
    if (speakers.length === 0) {
        state.speakersBox.setContent(`{${door_theme_1.T.accentAlt}-fg}No other speakers connected{/${door_theme_1.T.accentAlt}-fg}`);
    }
    else {
        let content = '';
        for (const speaker of speakers) {
            const speakingIndicator = speaker.isSpeaking ? `{${door_theme_1.T.ok}-fg}[SPEAKING]{/${door_theme_1.T.ok}-fg}` : `{${door_theme_1.T.dim}-fg}[IDLE]{/${door_theme_1.T.dim}-fg}`;
            const audioBar = renderAudioBar(speaker.audioLevel);
            const username = speaker.isSpeaking ? `{bold}${speaker.username}{/bold}` : speaker.username;
            content += `${speakingIndicator} ${username}\n${audioBar}\n\n`;
        }
        state.speakersBox.setContent(content);
    }
    state.screen.render();
}
// Use SDK's renderAudioLevel instead of custom renderAudioBar
function renderAudioBar(level) {
    return (0, blessed_1.renderAudioLevel)(level, { barWidth: 40 });
}
function updateWaveform(state, levels) {
    if (!state.waveformBox) {
        return;
    }
    const waveform = levels.waveform || [];
    const audioLevel = state.myAudioLevel;
    // Simple waveform visualization
    let content = '';
    if (state.isMuted) {
        content = `{${door_theme_1.T.alert}-fg}{bold}MUTED{/bold}{/${door_theme_1.T.alert}-fg}\n\n`;
        content += `{${door_theme_1.T.dim}-fg}Audio input disabled{/${door_theme_1.T.dim}-fg}`;
    }
    else if (state.isStreaming) {
        // Audio level bar
        const bar = renderAudioBar(audioLevel);
        content = `{${door_theme_1.T.accent}-fg}Input Level:{/${door_theme_1.T.accent}-fg}\n${bar}\n\n`;
        // Simple waveform (just show last few samples)
        if (waveform.length > 0) {
            content += `{${door_theme_1.T.accent}-fg}Waveform:{/${door_theme_1.T.accent}-fg}\n`;
            const samples = waveform.slice(-30);
            for (const sample of samples) {
                const height = Math.floor(Math.abs(sample) * 10);
                content += height > 0 ? `{${door_theme_1.T.ok}-fg}|{/${door_theme_1.T.ok}-fg}` : `{${door_theme_1.T.dim}-fg}·{/${door_theme_1.T.dim}-fg}`;
            }
        }
        const isSpeaking = audioLevel > 0.01;
        if (isSpeaking) {
            content += `\n\n{${door_theme_1.T.ok}-fg}{bold}SPEAKING{/bold}{/${door_theme_1.T.ok}-fg}`;
        }
        else {
            content += `\n\n{${door_theme_1.T.dim}-fg}Idle{/${door_theme_1.T.dim}-fg}`;
        }
    }
    else {
        content = `{${door_theme_1.T.accentAlt}-fg}Not streaming{/${door_theme_1.T.accentAlt}-fg}`;
    }
    state.waveformBox.setContent(content);
    state.screen.render();
}
async function toggleStreaming(ctx, state) {
    if (!ctx.socket) {
        updateStatus(state, `{${door_theme_1.T.alert}-fg}Error: Socket not available{/${door_theme_1.T.alert}-fg}`);
        return;
    }
    try {
        if (state.isStreaming) {
            // Stop streaming - emit to client
            ctx.socket.emit('audio:stop-streaming');
            state.isStreaming = false;
            state.isMuted = false;
            updateStatus(state, `{${door_theme_1.T.accentAlt}-fg}Stopped streaming{/${door_theme_1.T.accentAlt}-fg}`);
            updateWaveform(state, { input: 0, output: 0 });
            updateQualityDisplay(state);
        }
        else {
            // Start streaming - emit to client with quality settings
            updateStatus(state, `{${door_theme_1.T.accentAlt}-fg}Starting audio stream...{/${door_theme_1.T.accentAlt}-fg}`);
            const audioOptions = state.qualityManager?.getAudioStreamOptions() || {
                codec: 'opus',
                sampleRate: 48000,
                bitrate: 32000,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
            };
            const streamId = `audio-${ctx.user.id}-${Date.now()}`;
            // Emit to client (browser) to start Web Audio capture
            ctx.socket.emit('audio:start-streaming', { options: audioOptions, streamId });
            state.isStreaming = true;
            state.isMuted = false;
            const audioProfile = state.qualityManager?.getAudioProfile();
            updateStatus(state, `{${door_theme_1.T.ok}-fg}Streaming active{/${door_theme_1.T.ok}-fg}\n` +
                `Stream ID: ${streamId.substring(0, 8)}...\n` +
                `Quality: ${audioProfile?.name || 'High'} (${(audioOptions.bitrate || 32000) / 1000}kbps)`);
            updateQualityDisplay(state);
        }
    }
    catch (error) {
        updateStatus(state, `{${door_theme_1.T.alert}-fg}Error: ${error.message}{/${door_theme_1.T.alert}-fg}`);
    }
}
async function toggleMute(ctx, state) {
    if (!state.isStreaming || !ctx.socket) {
        updateStatus(state, `{${door_theme_1.T.accentAlt}-fg}Not streaming - cannot mute{/${door_theme_1.T.accentAlt}-fg}`);
        return;
    }
    try {
        state.isMuted = !state.isMuted;
        // Emit to client (browser) to mute/unmute
        ctx.socket.emit('audio:mute', { muted: state.isMuted });
        if (state.isMuted) {
            updateStatus(state, `{${door_theme_1.T.alert}-fg}Microphone MUTED{/${door_theme_1.T.alert}-fg}`);
        }
        else {
            updateStatus(state, `{${door_theme_1.T.ok}-fg}Microphone UNMUTED{/${door_theme_1.T.ok}-fg}`);
        }
        updateWaveform(state, { input: state.isMuted ? 0 : state.myAudioLevel, output: 0 });
    }
    catch (error) {
        updateStatus(state, `{${door_theme_1.T.alert}-fg}Error: ${error.message}{/${door_theme_1.T.alert}-fg}`);
    }
}
async function listActiveSpeakers(ctx, state) {
    // List speakers from our local state (populated by socket events)
    const speakers = Array.from(state.speakers.values());
    let content = `{${door_theme_1.T.accent}-fg}Active Speakers:{/${door_theme_1.T.accent}-fg} ${speakers.length + (state.isStreaming ? 1 : 0)}\n\n`;
    // Add self if streaming
    if (state.isStreaming) {
        const status = state.myAudioLevel > 0.01 ? `{${door_theme_1.T.ok}-fg}SPEAKING{/${door_theme_1.T.ok}-fg}` : `{${door_theme_1.T.dim}-fg}IDLE{/${door_theme_1.T.dim}-fg}`;
        const level = Math.floor(state.myAudioLevel * 100);
        content += `{${door_theme_1.T.accentAlt}-fg}[YOU]{/${door_theme_1.T.accentAlt}-fg} ${ctx.user.username || 'You'} ${status}\n`;
        content += `  Audio Level: ${level}%\n\n`;
    }
    // Add other speakers
    for (const speaker of speakers) {
        const status = speaker.isSpeaking ? `{${door_theme_1.T.ok}-fg}SPEAKING{/${door_theme_1.T.ok}-fg}` : `{${door_theme_1.T.dim}-fg}IDLE{/${door_theme_1.T.dim}-fg}`;
        const level = Math.floor(speaker.audioLevel * 100);
        content += `${speaker.username} ${status}\n`;
        content += `  Audio Level: ${level}%\n\n`;
    }
    if (speakers.length === 0 && !state.isStreaming) {
        content += `{${door_theme_1.T.accentAlt}-fg}No active speakers{/${door_theme_1.T.accentAlt}-fg}\n`;
    }
    updateStatus(state, content);
}
function updateNetworkDisplay(state) {
    if (!state.networkBox || !state.networkMonitor) {
        return;
    }
    const metrics = state.currentMetrics;
    const rec = state.currentRecommendation;
    if (!metrics || !rec) {
        state.networkBox.setContent(`{${door_theme_1.T.accentAlt}-fg}Measuring network quality...{/${door_theme_1.T.accentAlt}-fg}`);
        state.screen.render();
        return;
    }
    // Color based on quality
    let statusColor = 'green';
    if (rec.status === 'fair')
        statusColor = 'yellow';
    else if (rec.status === 'poor' || rec.status === 'critical')
        statusColor = 'red';
    const qualitySymbol = state.networkMonitor.getQualitySymbol();
    let content = '';
    content += `{${statusColor}-fg}{bold}${qualitySymbol} ${rec.status.toUpperCase()}{/bold}{/${statusColor}-fg}\n`;
    content += `RTT: {${door_theme_1.T.accent}-fg}${Math.floor(metrics.rtt)}ms{/${door_theme_1.T.accent}-fg} `;
    content += `Loss: {${door_theme_1.T.accent}-fg}${metrics.packetLoss.toFixed(1)}%{/${door_theme_1.T.accent}-fg}\n`;
    content += `Jitter: {${door_theme_1.T.accent}-fg}${Math.floor(metrics.jitter)}ms{/${door_theme_1.T.accent}-fg} `;
    content += `BW: {${door_theme_1.T.accent}-fg}${Math.floor(metrics.bandwidth)}kbps{/${door_theme_1.T.accent}-fg}\n`;
    content += `Score: {${door_theme_1.T.accent}-fg}${Math.floor(rec.quality)}%{/${door_theme_1.T.accent}-fg}`;
    state.networkBox.setContent(content);
    state.screen.render();
}
function updateQualityDisplay(state) {
    if (!state.qualityBox || !state.qualityManager) {
        return;
    }
    if (!state.isStreaming) {
        state.qualityBox.setContent(`{${door_theme_1.T.accentAlt}-fg}Not streaming{/${door_theme_1.T.accentAlt}-fg}`);
        state.screen.render();
        return;
    }
    const audioProfile = state.qualityManager.getAudioProfile();
    const isAuto = state.qualityManager.isAutoAdjustEnabled();
    let content = '';
    content += `{${door_theme_1.T.accent}-fg}Audio:{/${door_theme_1.T.accent}-fg} {bold}${audioProfile.name}{/bold}\n`;
    content += `  Bitrate: ${audioProfile.bitrate / 1000}kbps\n`;
    content += `  Sample Rate: ${audioProfile.sampleRate / 1000}kHz\n`;
    content += `  Quality: ${audioProfile.quality}\n\n`;
    content += `{${door_theme_1.T.accent}-fg}Auto-Adjust:{/${door_theme_1.T.accent}-fg} `;
    content += isAuto ? `{${door_theme_1.T.ok}-fg}ON{/${door_theme_1.T.ok}-fg}` : `{${door_theme_1.T.accentAlt}-fg}OFF{/${door_theme_1.T.accentAlt}-fg}`;
    state.qualityBox.setContent(content);
    state.screen.render();
}
function toggleAutoQuality(state) {
    if (!state.qualityManager) {
        return;
    }
    if (state.qualityManager.isAutoAdjustEnabled()) {
        state.qualityManager.disableAutoAdjust();
        updateStatus(state, `{${door_theme_1.T.accentAlt}-fg}Auto-quality adjustment disabled{/${door_theme_1.T.accentAlt}-fg}`);
    }
    else {
        state.qualityManager.enableAutoAdjust();
        updateStatus(state, `{${door_theme_1.T.ok}-fg}Auto-quality adjustment enabled{/${door_theme_1.T.ok}-fg}`);
    }
    updateQualityDisplay(state);
}
function adjustQuality(state, direction) {
    if (!state.qualityManager) {
        return;
    }
    const audioProfiles = ['emergency', 'low', 'medium', 'high', 'studio'];
    const currentProfile = state.qualityManager.getAudioProfile();
    const currentIndex = audioProfiles.indexOf(currentProfile.name.toLowerCase().includes('emergency') ? 'emergency' :
        currentProfile.name.toLowerCase().includes('telephone') ? 'low' :
            currentProfile.name.toLowerCase().includes('voice') && !currentProfile.name.toLowerCase().includes('high') ? 'medium' :
                currentProfile.name.toLowerCase().includes('high') ? 'high' : 'studio');
    let newIndex = currentIndex;
    if (direction === 'up' && currentIndex < audioProfiles.length - 1) {
        newIndex = currentIndex + 1;
    }
    else if (direction === 'down' && currentIndex > 0) {
        newIndex = currentIndex - 1;
    }
    else {
        updateStatus(state, `{${door_theme_1.T.accentAlt}-fg}Already at ` + (direction === 'up' ? 'maximum' : 'minimum') + ` quality{/${door_theme_1.T.accentAlt}-fg}`);
        return;
    }
    const newProfile = audioProfiles[newIndex];
    state.qualityManager.setAudioQuality(newProfile);
    updateStatus(state, `{${door_theme_1.T.accent}-fg}Quality manually set to: ${newProfile}{/${door_theme_1.T.accent}-fg}`);
    updateQualityDisplay(state);
}
exports.default = door;
//# sourceMappingURL=index.js.map