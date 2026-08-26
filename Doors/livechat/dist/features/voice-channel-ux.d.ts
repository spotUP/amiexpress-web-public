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
import type { DoorContext } from '@amiexpress/bbs-door-sdk';
export interface VoiceChannelItem {
    id: string;
    name: string;
    participants: Array<{
        userId: number | string;
        username: string;
        isSpeaking: boolean;
    }>;
}
export interface VoiceControlBarOptions {
    parent: any;
    screen: any;
    socket: any;
    ctx?: DoorContext;
    username: string;
    onDisconnect?: () => void;
    onVideoToggle?: () => void;
    onGridToggle?: () => void;
    onModeCycle?: () => void;
}
/**
 * Bottom Control Bar (Discord-style)
 * Shows when user is in voice channel
 */
export declare class VoiceControlBar {
    private screen;
    private socket;
    private ctx?;
    private container;
    private statusBox;
    private muteButton;
    private videoButton;
    private gridToggleButton;
    private modeButton;
    private disconnectButton;
    private levelBar?;
    /** What the meter last drew, so unchanged readings cost nothing. */
    private meterState;
    private username;
    private isMuted;
    private hasVideo;
    private isSpeaking;
    private onDisconnectCallback?;
    private onVideoToggleCallback?;
    private onGridToggleCallback?;
    private onModeCycleCallback?;
    constructor(options: VoiceControlBarOptions);
    private createUI;
    private setupSocketHandlers;
    private toggleMute;
    private toggleVideo;
    private toggleGrid;
    updateGridButtonLabel(viewMode: 'speaker' | 'grid'): void;
    updateModeButtonLabel(mode: 'ascii' | 'color' | 'halfblock' | 'braille'): void;
    private disconnect;
    private updateSpeakingIndicator;
    show(): void;
    hide(): void;
    destroy(): void;
}
/**
 * Enhanced Voice Channel Integration
 * Discord UX: Voice channels appear in channel list with participants
 */
export interface EnhancedVoiceChannelOptions {
    parent?: any;
    channelList: any;
    screen: any;
    socket: any;
    ctx?: DoorContext;
    userId: number | string;
    username: string;
    chatPanel?: any;
    onJoinVoice?: (channelId: string) => void;
    onLeaveVoice?: () => void;
    showConfirmDialog?: (title: string, message: string) => Promise<boolean>;
    onRenderModeChange?: (mode: 'ascii' | 'color' | 'halfblock' | 'braille') => void;
    onTileRightClick?: (userId: string, x: number, y: number) => void;
    /**
     * Video started or stopped filling the chat panel.
     *
     * The panel draws a frame around its contents, which is right for a chat
     * log and wrong for a picture that reaches every edge - it showed as a
     * stray rule under the video.
     */
    onVideoVisibility?: (visible: boolean) => void;
    /**
     * The roster changed - somebody joined or left voice.
     *
     * The sidebar is rebuilt by server.ts, not here, so the count next to
     * "Voice" can only move if we say so. Without this it read (0) for ever,
     * which is what made a working voice channel look broken.
     */
    onRosterChange?: () => void;
}
export declare class EnhancedVoiceChannel {
    private parent?;
    private channelList;
    private screen;
    private socket;
    private ctx?;
    private userId;
    private username;
    private chatPanel?;
    private controlBar?;
    private videoGrid?;
    private currentVoiceChannel?;
    private voiceChannels;
    private networkMonitor?;
    private qualityManager?;
    private onJoinVoiceCallback?;
    private onLeaveVoiceCallback?;
    private showConfirmDialog?;
    private onRenderModeChange?;
    private onTileRightClick?;
    private onRosterChange?;
    private onVideoVisibility?;
    /** The last decoded frame per sender, for applying their next delta. */
    private cellBuffers;
    /** The size each sender encoded at, needed to scale their frame. */
    private frameSizes;
    private cellHandlerBound;
    private videoEnabled;
    private currentStreamDims;
    private resizeStreamTimer;
    private renderMode;
    private static readonly RENDER_MODE_CYCLE;
    constructor(options: EnhancedVoiceChannelOptions);
    private setupSocketHandlers;
    private setupAdaptiveQuality;
    private updateChannelList;
    private updateVideoGridVisibility;
    toggleVideo(): Promise<void>;
    /**
     * Compute the ASCII width/height the SDK should render for the local
     * stream. Reads the actual self-tile dims so the picture fills the
     * available space (whole chat panel when alone, half when 2 people, etc).
     * Falls back to 80x24 if the tile isn't measurable yet.
     */
    /** The video area of any tile in the grid, all being the same size. */
    private firstPeerTileDims;
    private computeStreamDims;
    /**
     * If the self-tile has changed size enough to matter (>20% on either
     * axis), stop the current ASCII stream and restart at the new dims.
     * Debounced so a burst of voice:joined / voice:left / resize events
     * collapses to a single restart.
     */
    private scheduleStreamResize;
    private restartStreamIfDimsChanged;
    /**
     * Cycle the local outgoing stream's render mode (ascii → color →
     * halfblock → braille → ascii). If video is currently on, restart
     * the stream with the new encoder so other users see the change too.
     */
    cycleRenderMode(): Promise<void>;
    getRenderMode(): 'ascii' | 'color' | 'halfblock' | 'braille';
    /**
     * Show voice permissions dialog and return user's choices
     * Uses proper blessed components: Checkbox, Button with focus cycling
     */
    private showVoicePermissionsDialog;
    joinVoiceChannel(channelId: string): Promise<void>;
    leaveVoiceChannel(): Promise<void>;
    /**
     * Listen for video frames, whether or not this user has a camera on.
     *
     * The handler used to be registered only when the local camera STARTED,
     * and torn down when it stopped - so a viewer who never enabled video
     * received every frame and dropped every one of them, sitting on "WAITING
     * FOR VIDEO" while other people streamed. The door's own log said so
     * plainly: `video:frame received, has handler: false`.
     *
     * Registering is idempotent: the SDK keeps one handler, so calling this
     * again simply replaces it with an identical one.
     */
    /**
     * Make sure the video grid exists, whether or not this user has anything
     * to do with a voice channel.
     *
     * The grid used to be built only when joining voice, and the frame handler
     * with it - so a user who never touched voice received every frame and had
     * nowhere to put it. Video does not depend on voice: the backend falls
     * back to the chat room when there is no voice channel, so people can see
     * each other perfectly well without one. The door's own log said which
     * sessions were deaf: `video:frame received, has handler: false`.
     */
    ensureVideoGrid(): void;
    /**
     * Compact binary frames from other people.
     *
     * Each sender's frames are deltas against their own previous frame, so
     * one decoded buffer is kept per sender. A packet that cannot be applied
     * - a delta that arrived before any full frame, or after a resize - is
     * DROPPED rather than drawn: the sender sends a full frame whenever the
     * shape changes, so the picture repairs itself within a frame or two.
     */
    private ensureCellHandler;
    /**
     * Draw somebody's latest frame in the mode THIS user has chosen.
     *
     * Kept separate from receiving so that changing the render mode can
     * redraw the picture already in hand, with no round trip to the sender
     * and no effect on anybody else's view.
     */
    private drawParticipant;
    private ensureFrameHandler;
    private startAudioStreaming;
    showGrid(): void;
    hideGrid(): void;
    isGridVisible(): boolean;
    isInVoiceChannel(): boolean;
    getCurrentVoiceChannel(): string | undefined;
    getVoiceChannels(): VoiceChannelItem[];
    /**
     * Adjust channel list height to make room for voice controls in sidebar.
     * Voice control bar is 4 rows tall at the bottom of the sidebar.
     */
    private adjustChannelListForVoice;
    destroy(): void;
}
export declare function createEnhancedVoiceChannel(options: EnhancedVoiceChannelOptions): EnhancedVoiceChannel;
export declare function createVoiceControlBar(options: VoiceControlBarOptions): VoiceControlBar;
