"use strict";
/**
 * Discord-Style Voice Channel UX
 *
 * Improved UX matching Discord's patterns:
 * - Voice channels shown in channel list
 * - Click to join (no separate button)
 * - Persistent voice connection
 * - Bottom control bar when in voice
 * - Video grid overlay
 * - Speaking indicators
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedVoiceChannel = exports.VoiceControlBar = void 0;
exports.createEnhancedVoiceChannel = createEnhancedVoiceChannel;
exports.createVoiceControlBar = createVoiceControlBar;
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const theme_1 = require("../ui/theme");
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const video_grid_1 = require("./video-grid");
/**
 * Bottom Control Bar (Discord-style)
 * Shows when user is in voice channel
 */
class VoiceControlBar {
    constructor(options) {
        this.isMuted = false;
        this.hasVideo = false;
        this.isSpeaking = false;
        this.screen = options.screen;
        this.socket = options.socket;
        this.ctx = options.ctx;
        this.username = options.username;
        this.onDisconnectCallback = options.onDisconnect;
        this.onVideoToggleCallback = options.onVideoToggle;
        this.onGridToggleCallback = options.onGridToggle;
        this.onModeCycleCallback = options.onModeCycle;
        this.createUI(options.parent);
        this.setupSocketHandlers();
    }
    createUI(parent) {
        // Voice controls always render inside the sidebar panel (Discord-style)
        // Layout:
        // ├────────────────────┤
        // │ [*] username       │  <- status row (speaking indicator)
        // │ [M] [V] [F] [X]    │  <- controls row ([R]ender = keyboard 'r' / View menu)
        // └────────────────────┘
        this.container = blessed_1.default.box({
            parent,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 4,
            tags: true,
            style: {
                fg: 'white',
                bg: 'black',
                border: { fg: theme_1.PANEL_BORDER },
            },
            border: {
                type: 'line',
            },
            label: ' Voice ',
            hidden: true,
        });
        // User status with speaking indicator (row 0)
        this.statusBox = blessed_1.default.box({
            parent: this.container,
            top: 0,
            left: 1,
            width: '100%-4',
            height: 1,
            tags: true,
            border: undefined, // Prevent Panel default border (blessed.box returns Panel)
            content: `{gray-fg}[ ]{/gray-fg} ${this.username.substring(0, 12)}`,
            style: {
                fg: 'white',
                bg: 'black',
            },
        });
        // Controls row (row 1): [M] [V] [S] [X]
        // Mute button [M]
        this.muteButton = blessed_1.default.box({
            parent: this.container,
            top: 1,
            left: 1,
            width: 3,
            height: 1,
            tags: true,
            border: undefined, // Prevent Panel default border
            content: '{green-fg}[M]{/green-fg}',
            mouse: true,
            clickable: true,
            style: {
                fg: 'green',
                bg: 'black',
                hover: { fg: 'white', bg: 'green' },
            },
        });
        this.muteButton.on('click', () => {
            this.toggleMute();
        });
        // Video button [V]
        this.videoButton = blessed_1.default.box({
            parent: this.container,
            top: 1,
            left: 5,
            width: 3,
            height: 1,
            tags: true,
            border: undefined, // Prevent Panel default border
            content: '{gray-fg}[V]{/gray-fg}',
            mouse: true,
            clickable: true,
            style: {
                fg: 'gray',
                bg: 'black',
                hover: { fg: 'white', bg: 'cyan' },
            },
        });
        this.videoButton.on('click', () => {
            this.toggleVideo();
        });
        // Fullscreen/Grid toggle button.
        // Speaker mode = [F] (Fullscreen — active speaker fills the whole chat
        // panel, falling back to self if nobody is talking).
        // Grid mode    = [G] (split-view grid showing every participant).
        this.gridToggleButton = blessed_1.default.box({
            parent: this.container,
            top: 1,
            left: 9,
            width: 3,
            height: 1,
            tags: true,
            border: undefined, // Prevent Panel default border
            content: '{yellow-fg}[F]{/yellow-fg}',
            mouse: true,
            clickable: true,
            style: {
                fg: 'yellow',
                bg: 'black',
                hover: { fg: 'white', bg: 'yellow' },
            },
        });
        this.gridToggleButton.on('click', () => {
            this.toggleGrid();
        });
        // Render-mode cycle button: not put in the control bar because the
        // sidebar (~15 chars wide) can't fit a 5th 3-wide button without
        // overlapping [X]. Cycling is triggered via keyboard `r` and the
        // View menu instead — see `cycleRenderMode` in EnhancedVoiceChannel.
        // `modeButton` field kept (set to null) so the rest of the code can
        // safely call `updateModeButtonLabel` as a no-op.
        this.modeButton = null;
        // Disconnect button [X]
        this.disconnectButton = blessed_1.default.box({
            parent: this.container,
            top: 1,
            right: 1,
            width: 3,
            height: 1,
            tags: true,
            border: undefined, // Prevent Panel default border
            content: '{red-fg}[X]{/red-fg}',
            mouse: true,
            clickable: true,
            style: {
                fg: 'red',
                bg: 'black',
                hover: { fg: 'white', bg: 'red' },
            },
        });
        this.disconnectButton.on('click', () => {
            this.disconnect();
        });
    }
    setupSocketHandlers() {
        // Update speaking status from audio stream
        this.socket.on('audio-speaking-status', (data) => {
            if (data.userId === this.ctx?.user?.id) {
                this.isSpeaking = data.isSpeaking;
                this.updateSpeakingIndicator();
            }
        });
    }
    toggleMute() {
        if (!this.ctx?.audio) {
            // Toggle local state even without audio API
            this.isMuted = !this.isMuted;
        }
        else {
            this.isMuted = !this.isMuted;
            this.ctx.audio.setMuted(this.isMuted);
        }
        // Update button with colored tags
        if (this.isMuted) {
            this.muteButton.setContent('{red-fg}[M]{/red-fg}');
        }
        else {
            this.muteButton.setContent('{green-fg}[M]{/green-fg}');
        }
        // Notify server
        this.socket.emit('voice:mute', { isMuted: this.isMuted });
        this.screen.render();
    }
    toggleVideo() {
        this.hasVideo = !this.hasVideo;
        // Update button with colored tags
        if (this.hasVideo) {
            this.videoButton.setContent('{green-fg}[V]{/green-fg}');
        }
        else {
            this.videoButton.setContent('{gray-fg}[V]{/gray-fg}');
        }
        // Call callback to update video grid
        if (this.onVideoToggleCallback) {
            this.onVideoToggleCallback();
        }
        else {
            // Fallback: notify server directly if no callback
            this.socket.emit('voice:video-toggle', { hasVideo: this.hasVideo });
        }
        this.screen.render();
    }
    toggleGrid() {
        // Call callback to toggle video grid view mode
        if (this.onGridToggleCallback) {
            this.onGridToggleCallback();
        }
    }
    updateGridButtonLabel(viewMode) {
        // Speaker mode = [F] fullscreen/focus; grid = [G] split-view.
        if (viewMode === 'speaker') {
            this.gridToggleButton.setContent('{yellow-fg}[F]{/yellow-fg}');
        }
        else {
            this.gridToggleButton.setContent('{cyan-fg}[G]{/cyan-fg}');
        }
        this.screen.render();
    }
    updateModeButtonLabel(mode) {
        // First letter of the mode in the button slot so the user can read
        // the current encoder at a glance.
        const map = { ascii: 'A', color: 'C', halfblock: 'H', braille: 'B' };
        const ch = map[mode] || 'R';
        this.modeButton?.setContent(`{magenta-fg}[${ch}]{/magenta-fg}`);
        this.screen.render();
    }
    disconnect() {
        if (this.onDisconnectCallback) {
            this.onDisconnectCallback();
        }
        this.hide();
    }
    updateSpeakingIndicator() {
        if (!this.statusBox)
            return;
        // Discord-style: green ring when speaking
        if (this.isSpeaking) {
            this.statusBox.setContent(`{green-fg}[*]{/green-fg} ${this.username.substring(0, 12)}`);
        }
        else {
            this.statusBox.setContent(`{gray-fg}[ ]{/gray-fg} ${this.username.substring(0, 12)}`);
        }
        this.screen.render();
    }
    show() {
        this.container.show();
        this.container.setFront(); // Bring to front of other elements in parent
        if (this.screen)
            this.screen.render();
    }
    hide() {
        this.container.hide();
        this.screen.render();
    }
    destroy() {
        this.container.destroy();
    }
}
exports.VoiceControlBar = VoiceControlBar;
class EnhancedVoiceChannel {
    constructor(options) {
        this.voiceChannels = new Map();
        this.videoEnabled = false;
        this.currentStreamDims = null;
        this.resizeStreamTimer = null;
        this.renderMode = 'halfblock';
        this.parent = options.parent;
        this.channelList = options.channelList;
        this.screen = options.screen;
        this.socket = options.socket;
        this.ctx = options.ctx;
        this.userId = options.userId;
        this.username = options.username;
        this.chatPanel = options.chatPanel;
        this.onJoinVoiceCallback = options.onJoinVoice;
        this.onLeaveVoiceCallback = options.onLeaveVoice;
        this.showConfirmDialog = options.showConfirmDialog;
        this.onRenderModeChange = options.onRenderModeChange;
        this.onTileRightClick = options.onTileRightClick;
        this.setupSocketHandlers();
        this.setupAdaptiveQuality();
    }
    setupSocketHandlers() {
        // Voice channel events
        this.socket.on('voice:channels', (channels) => {
            this.voiceChannels.clear();
            for (const channel of channels) {
                this.voiceChannels.set(channel.id, channel);
            }
            this.updateChannelList();
        });
        this.socket.on('voice:joined', (data) => {
            const channel = this.voiceChannels.get(data.channelId);
            if (channel) {
                channel.participants.push({
                    userId: String(data.userId),
                    username: data.username,
                    isSpeaking: false,
                });
                this.updateChannelList();
            }
            // Add to video grid. Self is included so the user gets a self-preview
            // tile (the local onFrame() handler at ~line 537 feeds their camera
            // frames into this same grid via updateParticipantVideo). Previously
            // self was filtered out and the user saw only other participants —
            // or nothing at all when alone in a channel, which flagged 2026-04-24
            // as 'where's my ASCII video?'.
            if (this.videoGrid) {
                console.log('[voice-channel-ux] voice:joined — adding to grid. data.userId=%s this.userId=%s isSelf=%s', data.userId, this.userId, String(data.userId) === String(this.userId));
                this.videoGrid.addParticipant({
                    userId: String(data.userId),
                    username: data.username,
                    socketId: '',
                    isMuted: data.isMuted || false,
                    hasVideo: data.hasVideo || false,
                    hasScreenShare: data.hasScreenShare || false,
                    isSpeaking: false,
                    audioLevel: 0,
                });
                // My self-tile shrank/grew — rerun the SDK encode at the new dims.
                this.scheduleStreamResize();
            }
        });
        this.socket.on('voice:left', (data) => {
            const channel = this.voiceChannels.get(data.channelId);
            if (channel) {
                channel.participants = channel.participants.filter(p => String(p.userId) !== String(data.userId));
                this.updateChannelList();
            }
            // Remove from video grid
            if (this.videoGrid) {
                this.videoGrid.removeParticipant(String(data.userId));
                // Tile sizes changed — re-encode local stream at new dims.
                this.scheduleStreamResize();
            }
        });
        this.socket.on('audio-speaking-status', (data) => {
            for (const channel of this.voiceChannels.values()) {
                const participant = channel.participants.find(p => String(p.userId) === String(data.userId));
                if (participant) {
                    participant.isSpeaking = data.isSpeaking;
                    this.updateChannelList();
                    break;
                }
            }
            // Update video grid
            if (this.videoGrid) {
                this.videoGrid.updateParticipant(String(data.userId), {
                    isSpeaking: data.isSpeaking,
                    audioLevel: data.audioLevel || 0,
                });
                // Set active speaker highlight (for others)
                const targetId = String(data.userId);
                if (data.isSpeaking && targetId !== String(this.userId)) {
                    this.videoGrid.setActiveSpeaker(targetId);
                }
                else if (!data.isSpeaking && targetId !== String(this.userId)) {
                    // If they stopped speaking, remove highlight
                    this.videoGrid.setActiveSpeaker(undefined);
                }
            }
        });
        // Video toggle events
        this.socket.on('voice:video-toggle', (data) => {
            if (this.videoGrid) {
                this.videoGrid.updateParticipant(String(data.userId), {
                    hasVideo: data.hasVideo,
                });
                // Show video grid if anyone has video enabled
                this.updateVideoGridVisibility();
            }
        });
        // Handle incoming video frames
        this.socket.on('video:frame', (data) => {
            if (this.videoGrid) {
                this.videoGrid.updateParticipantVideo(String(data.userId), data.frame);
            }
        });
        // Mute events
        this.socket.on('voice:mute', (data) => {
            if (this.videoGrid) {
                this.videoGrid.updateParticipant(data.userId, {
                    isMuted: data.isMuted,
                });
            }
        });
    }
    setupAdaptiveQuality() {
        if (!this.ctx?.audio || !this.socket)
            return;
        this.networkMonitor = new bbs_door_sdk_1.NetworkQualityMonitor(this.socket);
        this.qualityManager = new bbs_door_sdk_1.AdaptiveQualityManager(this.networkMonitor);
        this.networkMonitor.start();
    }
    updateChannelList() {
        // Update channel list to show voice channels with participants
        // This would integrate with the existing channel list component
        // Format: "🔊 Voice Channel (2)" with participant count
        this.screen.render();
    }
    updateVideoGridVisibility() {
        if (!this.videoGrid)
            return;
        // Show video grid ONLY if someone has video enabled (not just for being in voice)
        const inVoice = this.isInVoiceChannel();
        const hasAnyVideo = this.videoGrid.getParticipants().some(p => p.hasVideo);
        if (inVoice && hasAnyVideo && !this.videoGrid.isVisible()) {
            this.videoGrid.show();
            this.videoGrid.setFront();
        }
        else if ((!inVoice || !hasAnyVideo) && this.videoGrid.isVisible()) {
            this.videoGrid.hide();
        }
    }
    async toggleVideo() {
        this.videoEnabled = !this.videoEnabled;
        console.log('[voice-channel-ux] toggleVideo videoEnabled=%s hasCtxVideo=%s gridParticipants=%d inVoice=%s', this.videoEnabled, !!this.ctx?.video, this.videoGrid?.getParticipantCount() ?? -1, this.isInVoiceChannel());
        // Check if video API is available (only for web clients, not terminal)
        if (!this.ctx?.video) {
            console.log('[Voice] Video API not available - web client required for video');
            this.videoEnabled = false; // Disable it since it won't work
            return;
        }
        // Notify server
        this.socket.emit('voice:video-toggle', { hasVideo: this.videoEnabled });
        // Handle video streaming
        if (this.videoEnabled) {
            try {
                // Register the frame handler BEFORE calling startStream — matches the
                // working neoshowcase webcam-demo ordering so no frames between
                // 'startStream returned' and 'onFrame registered' can slip through
                // unhandled.
                this.ctx.video.onFrame((frame) => {
                    console.log('[voice-channel-ux] onFrame fired, videoEnabled:', this.videoEnabled, 'hasGrid:', !!this.videoGrid, 'userId:', this.userId, 'participants:', this.videoGrid?.getParticipantCount(), 'frame len:', frame?.length ?? 0);
                    if (this.videoEnabled && this.videoGrid) {
                        this.videoGrid.updateParticipantVideo(this.userId, frame);
                    }
                });
                // Flip the self-tile's hasVideo BEFORE frames start arriving so
                // updateVideoDisplay() doesn't briefly paint the no-video avatar
                // between startStream() and the first frame (also avoids the
                // previous race where setVideoFrame's hasVideo-gate dropped frames).
                if (this.videoGrid) {
                    this.videoGrid.updateParticipant(this.userId, { hasVideo: true });
                }
                const dims = this.computeStreamDims();
                this.currentStreamDims = dims;
                const videoOptions = this.qualityManager?.getVideoProfile();
                await this.ctx.video.startStream({ type: 'webcam' }, {
                    width: dims.width,
                    height: dims.height,
                    fps: videoOptions?.fps || 10,
                    colored: this.renderMode === 'color',
                    mode: this.renderMode,
                });
            }
            catch (error) {
                console.log('[Voice] Video stream failed:', error.message);
                this.videoEnabled = true; // Keep it enabled so we can show the error in the tile
                if (this.videoGrid) {
                    const errorMsg = error.message?.includes('denied') ? 'CAMERA BLOCKED' : 'STREAM ERROR';
                    this.videoGrid.updateParticipantError(this.userId, errorMsg);
                }
                this.socket.emit('voice:video-toggle', { hasVideo: true });
            }
        }
        else {
            try {
                const myStreamId = `video-${this.socket.id}`;
                await this.ctx.video.stopStream(myStreamId);
                // Remove listener
                this.ctx.video.onFrame(() => { });
                this.currentStreamDims = null;
            }
            catch (error) {
                console.log('[Voice] Stop video failed:', error.message);
            }
        }
        // Update own participant in video grid
        if (this.videoGrid) {
            this.videoGrid.updateParticipant(this.userId, {
                hasVideo: this.videoEnabled,
            });
            this.updateVideoGridVisibility();
        }
    }
    /**
     * Compute the ASCII width/height the SDK should render for the local
     * stream. Reads the actual self-tile dims so the picture fills the
     * available space (whole chat panel when alone, half when 2 people, etc).
     * Falls back to 80x24 if the tile isn't measurable yet.
     */
    computeStreamDims() {
        const dims = this.videoGrid?.getTileVideoDims(this.userId) ?? null;
        if (!dims || !dims.width || !dims.height) {
            return { width: 80, height: 24 };
        }
        // Floor to whole chars; clamp to a sensible minimum so the SDK doesn't
        // get a 0xN request if the tile is briefly unsized during a relayout.
        const w = Math.max(40, Math.floor(dims.width));
        const h = Math.max(12, Math.floor(dims.height));
        return { width: w, height: h };
    }
    /**
     * If the self-tile has changed size enough to matter (>20% on either
     * axis), stop the current ASCII stream and restart at the new dims.
     * Debounced so a burst of voice:joined / voice:left / resize events
     * collapses to a single restart.
     */
    scheduleStreamResize() {
        if (!this.videoEnabled || !this.ctx?.video || !this.currentStreamDims)
            return;
        if (this.resizeStreamTimer)
            clearTimeout(this.resizeStreamTimer);
        this.resizeStreamTimer = setTimeout(() => {
            this.resizeStreamTimer = null;
            this.restartStreamIfDimsChanged().catch(err => {
                console.log('[voice-channel-ux] stream resize failed:', err?.message ?? err);
            });
        }, 150);
    }
    async restartStreamIfDimsChanged() {
        if (!this.videoEnabled || !this.ctx?.video || !this.currentStreamDims)
            return;
        const target = this.computeStreamDims();
        const cur = this.currentStreamDims;
        const wDelta = Math.abs(target.width - cur.width) / Math.max(1, cur.width);
        const hDelta = Math.abs(target.height - cur.height) / Math.max(1, cur.height);
        // 5%, not 20%. The wide threshold was there to stop a resize DRAG from
        // restarting the camera dozens of times - but the browser now waits for
        // the size to settle before announcing it, so this is called once per
        // resize and can afford to track the window closely. At 20% an ordinary
        // window change left the picture visibly the wrong shape.
        if (wDelta < 0.05 && hDelta < 0.05)
            return;
        console.log('[voice-channel-ux] resize stream %dx%d -> %dx%d', cur.width, cur.height, target.width, target.height);
        const myStreamId = `video-${this.socket.id}`;
        try {
            await this.ctx.video.stopStream(myStreamId);
        }
        catch {
            // best-effort
        }
        this.currentStreamDims = target;
        const videoOptions = this.qualityManager?.getVideoProfile();
        await this.ctx.video.startStream({ type: 'webcam' }, {
            width: target.width,
            height: target.height,
            fps: videoOptions?.fps || 10,
            colored: this.renderMode === 'color',
            mode: this.renderMode,
        });
    }
    /**
     * Cycle the local outgoing stream's render mode (ascii → color →
     * halfblock → braille → ascii). If video is currently on, restart
     * the stream with the new encoder so other users see the change too.
     */
    async cycleRenderMode() {
        const cycle = EnhancedVoiceChannel.RENDER_MODE_CYCLE;
        const idx = cycle.indexOf(this.renderMode);
        this.renderMode = cycle[(idx + 1) % cycle.length];
        console.log('[voice-channel-ux] renderMode →', this.renderMode);
        this.controlBar?.updateModeButtonLabel(this.renderMode);
        // Push the mode into the self-tile's status bar so the user can see
        // "spot [V] [HALFBLOCK]" and identify which encoder produced a given
        // look without having to cycle and guess.
        if (this.videoGrid) {
            this.videoGrid.setTileRenderMode(this.userId, this.renderMode);
        }
        // System-message feedback so the user sees something changed even when
        // video is off (no stream to visibly re-encode).
        if (this.onRenderModeChange)
            this.onRenderModeChange(this.renderMode);
        if (!this.videoEnabled || !this.ctx?.video)
            return;
        // Force a stream restart by invalidating dims, then run the
        // resize path (debounced, dedupe-friendly).
        this.currentStreamDims = { width: 0, height: 0 };
        this.scheduleStreamResize();
    }
    getRenderMode() {
        return this.renderMode;
    }
    /**
     * Show voice permissions dialog and return user's choices
     * Uses proper blessed components: Checkbox, Button with focus cycling
     */
    async showVoicePermissionsDialog() {
        return new Promise((resolve) => {
            // Track if dialog was already resolved to prevent double-resolution
            let resolved = false;
            const resolveOnce = (result) => {
                if (resolved)
                    return;
                resolved = true;
                cleanup();
                resolve(result);
            };
            // Modal overlay (darkens background)
            const modalOverlay = blessed_1.default.box({
                parent: this.screen,
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: undefined, // Prevent Panel default border
                style: { bg: 'black', transparent: true },
                // @ts-ignore
                zIndex: 99998,
            });
            // Dialog container
            const dialog = blessed_1.default.box({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: 52,
                height: 11,
                border: { type: 'line' },
                style: {
                    fg: 'white',
                    bg: 'black',
                    border: { fg: theme_1.PANEL_BORDER },
                },
                tags: true,
                label: ' {cyan-fg}Join Voice Channel{/cyan-fg} ',
                ch: ' ',
                // @ts-ignore
                zIndex: 99999,
            });
            // Header text
            blessed_1.default.text({
                parent: dialog,
                top: 1,
                left: 2,
                width: 48,
                content: 'Enable audio and video for this call?',
                tags: true,
                style: { fg: 'white', bg: 'black' },
            });
            // Instructions
            blessed_1.default.text({
                parent: dialog,
                top: 2,
                left: 2,
                width: 48,
                content: '{gray-fg}Tab to navigate, Space/Enter to toggle/select{/gray-fg}',
                tags: true,
                style: { bg: 'black' },
            });
            // Microphone checkbox - using proper Checkbox widget
            const micCheckbox = blessed_1.default.checkbox({
                parent: dialog,
                top: 4,
                left: 3,
                width: 30,
                height: 1,
                text: 'Enable Microphone',
                checked: true,
                style: {
                    fg: 'white',
                    bg: 'black',
                    focus: { fg: 'black', bg: 'cyan' },
                    hover: { fg: 'black', bg: 'blue' },
                },
            });
            // Camera checkbox - using proper Checkbox widget
            const cameraCheckbox = blessed_1.default.checkbox({
                parent: dialog,
                top: 5,
                left: 3,
                width: 30,
                height: 1,
                text: 'Enable Camera',
                checked: true,
                style: {
                    fg: 'white',
                    bg: 'black',
                    focus: { fg: 'black', bg: 'cyan' },
                    hover: { fg: 'black', bg: 'blue' },
                },
            });
            // Join button - using proper Button widget
            const joinButton = blessed_1.default.button({
                parent: dialog,
                bottom: 1,
                left: 5,
                width: 18,
                height: 1,
                content: '{center}[ Join ]{/center}',
                tags: true,
                mouse: true,
                style: {
                    fg: 'green',
                    bg: 'black',
                    focus: { fg: 'white', bg: 'green' },
                    hover: { fg: 'white', bg: 'green' },
                },
            });
            // Cancel button - using proper Button widget
            const cancelButton = blessed_1.default.button({
                parent: dialog,
                bottom: 1,
                right: 5,
                width: 18,
                height: 1,
                content: '{center}[ Cancel ]{/center}',
                tags: true,
                mouse: true,
                style: {
                    fg: 'red',
                    bg: 'black',
                    focus: { fg: 'white', bg: 'red' },
                    hover: { fg: 'white', bg: 'red' },
                },
            });
            // Focusable elements in tab order
            const focusables = [micCheckbox, cameraCheckbox, joinButton, cancelButton];
            let focusIndex = 0;
            // Focus cycling with Tab
            const cycleFocus = (direction) => {
                focusIndex = (focusIndex + direction + focusables.length) % focusables.length;
                focusables[focusIndex].focus();
                this.screen.render();
            };
            // Setup keyboard handlers on SCREEN (not dialog) so they fire
            // regardless of which inner widget currently has focus (checkboxes/buttons
            // steal focus from the dialog). Handlers are removed in cleanup().
            const onTab = () => {
                cycleFocus(1);
            };
            const onSTab = () => {
                cycleFocus(-1);
            };
            const onEscape = () => {
                resolveOnce(null);
            };
            const onEnter = () => {
                const focused = this.screen.focused;
                // Checkboxes handle their own Enter via Checkbox.key(['space','enter']) — don't double-toggle.
                if (focused === micCheckbox || focused === cameraCheckbox) {
                    return;
                }
                if (focused === cancelButton) {
                    resolveOnce(null);
                    return;
                }
                // Default / join button: submit with current checkbox values
                resolveOnce({
                    enableMic: micCheckbox.isChecked(),
                    enableCamera: cameraCheckbox.isChecked(),
                });
            };
            this.screen.key(['tab'], onTab);
            this.screen.key(['S-tab'], onSTab);
            this.screen.key(['escape'], onEscape);
            this.screen.key(['enter'], onEnter);
            // Button press handlers
            joinButton.on('press', () => {
                resolveOnce({
                    enableMic: micCheckbox.isChecked(),
                    enableCamera: cameraCheckbox.isChecked(),
                });
            });
            cancelButton.on('press', () => {
                resolveOnce(null);
            });
            // Also handle Enter on buttons
            joinButton.key(['enter'], () => {
                resolveOnce({
                    enableMic: micCheckbox.isChecked(),
                    enableCamera: cameraCheckbox.isChecked(),
                });
            });
            cancelButton.key(['enter'], () => {
                resolveOnce(null);
            });
            // Cleanup function to destroy all elements + unbind screen-level keys
            const cleanup = () => {
                this.screen.unkey(['tab'], onTab);
                this.screen.unkey(['S-tab'], onSTab);
                this.screen.unkey(['escape'], onEscape);
                this.screen.unkey(['enter'], onEnter);
                dialog.destroy();
                modalOverlay.destroy();
                this.screen.render();
            };
            // Click outside to cancel (on modal overlay)
            modalOverlay.on('click', () => {
                resolveOnce(null);
            });
            // Initial focus on first checkbox
            dialog.setFront();
            modalOverlay.setFront();
            dialog.setFront();
            micCheckbox.focus();
            this.screen.render();
        });
    }
    async joinVoiceChannel(channelId) {
        if (this.currentVoiceChannel === channelId) {
            // Already in this channel, leave instead
            await this.leaveVoiceChannel();
            return;
        }
        // Leave current channel if in one
        if (this.currentVoiceChannel) {
            await this.leaveVoiceChannel();
        }
        // Skip permissions dialog — mic + camera are ON by default.
        // Browser will prompt for getUserMedia permission automatically when
        // startAudioStreaming / toggleVideo fires. User can toggle via sidebar buttons.
        const permissions = { enableMic: true, enableCamera: true };
        try {
            // Helper to complete the join (called on success or timeout)
            const completeJoin = async (participants) => {
                this.currentVoiceChannel = channelId;
                // Create control bar
                if (!this.controlBar) {
                    this.controlBar = new VoiceControlBar({
                        parent: this.parent || this.screen,
                        screen: this.screen,
                        socket: this.socket,
                        ctx: this.ctx,
                        username: this.username,
                        onDisconnect: () => {
                            this.leaveVoiceChannel();
                        },
                        onVideoToggle: () => {
                            this.toggleVideo();
                        },
                        onGridToggle: () => {
                            if (this.videoGrid) {
                                this.videoGrid.toggleViewMode();
                                const newMode = this.videoGrid.getViewMode();
                                this.controlBar?.updateGridButtonLabel(newMode);
                                // Tile size jumps between speaker/grid layouts — rescale.
                                this.scheduleStreamResize();
                            }
                        },
                        onModeCycle: () => {
                            this.cycleRenderMode().catch(err => {
                                console.log('[voice-channel-ux] cycleRenderMode failed:', err?.message ?? err);
                            });
                        },
                    });
                    // Sync the control bar label to the initial render mode.
                    this.controlBar.updateModeButtonLabel(this.renderMode);
                }
                // Create video grid
                if (!this.videoGrid) {
                    // Use chatPanel as parent if available, otherwise use screen
                    const gridParent = this.chatPanel || this.screen;
                    this.videoGrid = new video_grid_1.VideoGrid({
                        parent: gridParent,
                        screen: this.screen,
                        left: 0,
                        top: 0,
                        width: '100%',
                        height: '100%',
                        currentUserId: this.userId,
                        currentUsername: this.username,
                        onTileRightClick: (uid, x, y) => {
                            this.onTileRightClick?.(uid, x, y);
                        },
                        // Any change to the tiles means the picture has to be re-encoded
                        // to fit them - a sidebar toggle and a view-mode switch resize
                        // the tile just as surely as the window does.
                        onLayoutChanged: () => this.scheduleStreamResize(),
                    });
                    // Start hidden until someone enables video
                    this.videoGrid.hide();
                    // Terminal resize → re-encode local stream so it tracks the new
                    // chat-panel size. Debounced inside scheduleStreamResize.
                    this.screen.on('resize', () => this.scheduleStreamResize());
                }
                // Add current user to video grid
                this.videoGrid.addParticipant({
                    userId: this.userId,
                    username: this.username,
                    socketId: '',
                    isMuted: false,
                    hasVideo: false,
                    hasScreenShare: false,
                    isSpeaking: false,
                    audioLevel: 0,
                });
                // Seed the self-tile's render-mode label so it's visible before
                // the first cycleRenderMode() call.
                this.videoGrid.setTileRenderMode(this.userId, this.renderMode);
                // Add existing participants if provided
                if (participants) {
                    for (const p of participants) {
                        if (p.userId !== this.userId) {
                            this.videoGrid.addParticipant({
                                userId: p.userId,
                                username: p.username,
                                socketId: '',
                                isMuted: p.isMuted || false,
                                hasVideo: p.hasVideo || false,
                                hasScreenShare: p.hasScreenShare || false,
                                isSpeaking: false,
                                audioLevel: 0,
                            });
                        }
                    }
                }
                // Start audio streaming if mic enabled
                if (permissions.enableMic) {
                    await this.startAudioStreaming();
                }
                // Show control bar and shrink channel list to make room
                this.controlBar.show();
                this.adjustChannelListForVoice(true);
                // Enable camera if requested
                if (permissions.enableCamera) {
                    // Wait a bit for control bar to render
                    setTimeout(() => {
                        this.toggleVideo();
                    }, 100);
                }
                // Update grid visibility (will show avatars by default)
                this.updateVideoGridVisibility();
                if (this.onJoinVoiceCallback) {
                    this.onJoinVoiceCallback(channelId);
                }
            };
            // Track if callback was received
            let callbackReceived = false;
            // Join voice channel on server with timeout fallback
            this.socket.emit('voice:join-channel', { channelId }, async (response) => {
                callbackReceived = true;
                if (response && response.success) {
                    await completeJoin(response.participants);
                }
                else {
                    // Server responded but denied - still show UI for demo/testing
                    await completeJoin();
                }
            });
            // Timeout: If server doesn't respond in 2 seconds, proceed anyway (local/demo mode)
            setTimeout(async () => {
                if (!callbackReceived) {
                    await completeJoin();
                }
            }, 2000);
        }
        catch (error) {
        }
    }
    async leaveVoiceChannel() {
        if (!this.currentVoiceChannel)
            return;
        try {
            // Stop audio streaming
            if (this.ctx?.audio) {
                await this.ctx.audio.stopStreaming();
            }
            // And the camera. Leaving the channel stopped the microphone only, so
            // the webcam stayed live - and its light stayed on - after the user
            // had left the call.
            if (this.videoEnabled && this.ctx?.video) {
                try {
                    await this.ctx.video.stopStream(`video-${this.socket.id}`);
                }
                catch {
                    // best-effort: leaving must not be blocked by a camera that has
                    // already gone away.
                }
                this.videoEnabled = false;
                this.currentStreamDims = null;
                this.socket.emit('voice:video-toggle', { hasVideo: false });
                if (this.videoGrid) {
                    this.videoGrid.updateParticipant(this.userId, { hasVideo: false });
                }
            }
            // Leave channel on server
            this.socket.emit('voice:leave-channel', {
                channelId: this.currentVoiceChannel,
            });
            // Hide control bar and restore channel list height
            if (this.controlBar) {
                this.controlBar.hide();
                this.adjustChannelListForVoice(false);
            }
            this.currentVoiceChannel = undefined;
            if (this.onLeaveVoiceCallback) {
                this.onLeaveVoiceCallback();
            }
        }
        catch (error) {
        }
    }
    async startAudioStreaming() {
        if (!this.ctx?.audio || !this.qualityManager) {
            return;
        }
        try {
            const audioOptions = this.qualityManager.getAudioStreamOptions();
            await this.ctx.audio.startStreaming(audioOptions);
        }
        catch (error) {
            // Permission denied or getUserMedia failed
            console.log('[Voice] Audio streaming failed:', error.message);
        }
    }
    showGrid() {
        if (this.videoGrid) {
            this.videoGrid.show();
            // Don't call setFront() - rely on zIndex so command suggestions stay on top
        }
    }
    hideGrid() {
        if (this.videoGrid) {
            this.videoGrid.hide();
        }
    }
    isGridVisible() {
        if (!this.videoGrid)
            return false;
        return !this.videoGrid.hidden;
    }
    isInVoiceChannel() {
        return !!this.currentVoiceChannel;
    }
    getCurrentVoiceChannel() {
        return this.currentVoiceChannel;
    }
    getVoiceChannels() {
        return Array.from(this.voiceChannels.values());
    }
    /**
     * Adjust channel list height to make room for voice controls in sidebar.
     * Voice control bar is 4 rows tall at the bottom of the sidebar.
     */
    adjustChannelListForVoice(voiceActive) {
        if (!this.channelList)
            return;
        // Channel list default: '100%-2' (full sidebar minus border)
        // When voice active: shrink by 4 rows for the voice control bar
        if (voiceActive) {
            this.channelList.height = '100%-6'; // 2 for border + 4 for voice bar
        }
        else {
            this.channelList.height = '100%-2';
        }
        this.screen.render();
    }
    destroy() {
        if (this.controlBar) {
            this.controlBar.destroy();
        }
        if (this.videoGrid) {
            this.videoGrid.destroy();
        }
        if (this.networkMonitor) {
            this.networkMonitor.stop();
        }
    }
}
exports.EnhancedVoiceChannel = EnhancedVoiceChannel;
EnhancedVoiceChannel.RENDER_MODE_CYCLE = ['ascii', 'color', 'halfblock', 'braille'];
function createEnhancedVoiceChannel(options) {
    return new EnhancedVoiceChannel(options);
}
function createVoiceControlBar(options) {
    return new VoiceControlBar(options);
}
