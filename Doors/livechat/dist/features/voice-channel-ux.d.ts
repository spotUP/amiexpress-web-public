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
