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
    private settingsButton;
    private disconnectButton;
    private username;
    private isMuted;
    private hasVideo;
    private isSpeaking;
    private onDisconnectCallback?;
    private onVideoToggleCallback?;
    constructor(options: VoiceControlBarOptions);
    private createUI;
    private setupSocketHandlers;
    private toggleMute;
    private toggleVideo;
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
    private videoEnabled;
    constructor(options: EnhancedVoiceChannelOptions);
    private setupSocketHandlers;
    private setupAdaptiveQuality;
    private updateChannelList;
    private updateVideoGridVisibility;
    toggleVideo(): Promise<void>;
    joinVoiceChannel(channelId: string): Promise<void>;
    leaveVoiceChannel(): Promise<void>;
    private startAudioStreaming;
    showGrid(): void;
    hideGrid(): void;
    isInVoiceChannel(): boolean;
    getCurrentVoiceChannel(): string | undefined;
    getVoiceChannels(): VoiceChannelItem[];
    destroy(): void;
}
export declare function createEnhancedVoiceChannel(options: EnhancedVoiceChannelOptions): EnhancedVoiceChannel;
export declare function createVoiceControlBar(options: VoiceControlBarOptions): VoiceControlBar;
